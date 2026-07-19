"""Async SQLite persistence layer used for listing de-duplication.

The monitor may poll OLX many times per hour. To avoid re-processing (and
re-notifying) the same offer over and over, every listing that has been seen is
recorded in a small SQLite database keyed by the OLX listing id.

The whole module is asynchronous (via :mod:`aiosqlite`) so it integrates cleanly
with the asyncio event loop that drives the rest of the application.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import time
from datetime import datetime, timezone
from typing import Iterable, Optional, Sequence, Set, Tuple

import aiosqlite

logger = logging.getLogger(__name__)
# Also emit on the app logger so SQLite diagnostics are visible even when the
# process was started under a filtered handler setup, and so operators scanning
# for ``phonedealbot:`` lines cannot miss them.
app_logger = logging.getLogger("phonedealbot")

# Bump this when changing instrumentation so startup logs prove the loaded code.
SQLITE_INSTRUMENTATION_VERSION = "sqlite-instrumentation-v2"


def _sqlite_log(message: str, *args: object) -> None:
    """Log SQLite diagnostics to both the module and app loggers."""
    logger.info(message, *args)
    app_logger.info(message, *args)


def _sqlite_error(message: str, *args: object) -> None:
    """Log SQLite errors to both the module and app loggers."""
    logger.error(message, *args)
    app_logger.error(message, *args)


# A row queued for bulk insertion:
#   (listing_id, source, title, price, url, notified)
SeenRecord = Tuple[str, str, Optional[str], Optional[float], Optional[str], bool]

__all__ = ["ListingDatabase", "SQLITE_INSTRUMENTATION_VERSION"]


class ListingDatabase:
    """Thin async wrapper around a SQLite table of previously seen listings.

    Usage::

        db = ListingDatabase("listings.db")
        await db.connect()
        try:
            if not await db.is_seen("123"):
                await db.mark_seen("123", source="olx", title="iPhone 13", ...)
        finally:
            await db.close()
    """

    def __init__(self, path: str) -> None:
        """Store the on-disk location of the SQLite database.

        :param path: Path to the SQLite file. Use ``":memory:"`` for an
            ephemeral database (handy in tests).
        """
        self._path = path
        self._db: Optional[aiosqlite.Connection] = None
        # Poll instrumentation: baseline IDs that existed before unseen calc,
        # and a gate that forbids INSERT until unseen has been computed.
        self._poll_baseline: Optional[Set[str]] = None
        self._poll_label: Optional[str] = None
        self._inserts_allowed: bool = True

    @property
    def path(self) -> str:
        """Configured SQLite path (file path or ``:memory:``)."""
        return self._path

    @property
    def absolute_path(self) -> str:
        """Absolute filesystem path (or ``:memory:``)."""
        if self._path == ":memory:":
            return ":memory:"
        return os.path.abspath(self._path)

    async def connect(self) -> None:
        """Open the connection and ensure the schema exists.

        Safe to call once during application start-up. The parent directory is
        created automatically, and if the database file is found to be corrupt it
        is quarantined and recreated so the monitor self-heals instead of
        crash-looping. Enables WAL mode so reads and writes do not block each
        other during long polling loops.
        """
        self._ensure_parent_dir()
        try:
            await self._open_and_init()
        except (sqlite3.DatabaseError, aiosqlite.Error) as exc:
            # An unreadable/corrupt on-disk database: quarantine and recreate
            # once. In-memory databases cannot be corrupt, so re-raise those.
            if self._path == ":memory:":
                raise
            _sqlite_error(
                "Database at %s is unusable (%s); quarantining and recreating",
                self.absolute_path,
                exc,
            )
            await self._safe_close()
            self._quarantine_corrupt_files()
            await self._open_and_init()
        row_count = await self.count()
        _sqlite_log(
            "SQLite instrumentation ACTIVE | version=%s | path=%s | "
            "absolute_path=%s | row_count=%d",
            SQLITE_INSTRUMENTATION_VERSION,
            self._path,
            self.absolute_path,
            row_count,
        )
        _sqlite_log(
            "Connected to SQLite database at %s (absolute_path=%s, row_count=%d)",
            self._path,
            self.absolute_path,
            row_count,
        )

    def _ensure_parent_dir(self) -> None:
        """Create the database's parent directory when it does not exist."""
        if self._path == ":memory:":
            return
        parent = os.path.dirname(os.path.abspath(self._path))
        if parent:
            os.makedirs(parent, exist_ok=True)

    async def _open_and_init(self) -> None:
        """Open the connection, verify integrity and create the schema."""
        self._db = await aiosqlite.connect(self._path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL;")
        # Cheap integrity probe (the table is tiny); surfaces a corrupt file so
        # connect() can quarantine it rather than failing later mid-poll.
        if self._path != ":memory:":
            async with self._db.execute("PRAGMA quick_check;") as cursor:
                row = await cursor.fetchone()
            if row is not None and str(row[0]).lower() != "ok":
                raise sqlite3.DatabaseError(f"integrity check failed: {row[0]}")
        await self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS seen_listings (
                listing_id TEXT PRIMARY KEY,
                source     TEXT NOT NULL,
                title      TEXT,
                price      REAL,
                url        TEXT,
                notified   INTEGER NOT NULL DEFAULT 0,
                first_seen REAL NOT NULL
            )
            """
        )
        await self._db.commit()

    def _quarantine_corrupt_files(self) -> None:
        """Rename the corrupt database (and WAL/SHM sidecars) out of the way."""
        stamp = time.strftime("%Y%m%d-%H%M%S")
        for suffix in ("", "-wal", "-shm"):
            path = self._path + suffix
            if os.path.exists(path):
                target = f"{path}.corrupt-{stamp}"
                try:
                    os.replace(path, target)
                    logger.warning("Moved corrupt database file %s -> %s", path, target)
                except OSError as exc:  # pragma: no cover - best effort
                    logger.error("Could not quarantine %s: %s", path, exc)

    async def _safe_close(self) -> None:
        """Close the connection, ignoring any error from a broken handle."""
        if self._db is not None:
            try:
                await self._db.close()
            except (sqlite3.Error, aiosqlite.Error):  # pragma: no cover
                pass
            self._db = None

    async def close(self) -> None:
        """Close the underlying connection if it is open."""
        await self._safe_close()

    def _require_db(self) -> aiosqlite.Connection:
        """Return the live connection or raise if :meth:`connect` was skipped."""
        if self._db is None:
            raise RuntimeError("ListingDatabase.connect() must be called first")
        return self._db

    # -- poll gating (unseen calc before INSERT) ---------------------------- #

    def begin_poll(self, label: str = "") -> None:
        """Start a poll: forbid INSERT until :meth:`mark_unseen_computed`.

        Call this before ``seen_subset`` / ``contains`` so any premature INSERT
        is detected. Pair with :meth:`end_poll` in a ``finally`` block.
        """
        self._poll_label = label or None
        self._poll_baseline = None
        self._inserts_allowed = False
        _sqlite_log(
            "database.poll_begin | path=%s | absolute_path=%s | label=%s | "
            "inserts_allowed=False",
            self._path,
            self.absolute_path,
            label or None,
        )

    def mark_unseen_computed(self, baseline_seen_ids: Set[str]) -> None:
        """Record which IDs existed before this poll and allow INSERTs.

        ``baseline_seen_ids`` must be the result of ``seen_subset`` taken
        **before** any insert for this poll.
        """
        self._poll_baseline = set(baseline_seen_ids)
        self._inserts_allowed = True
        _sqlite_log(
            "database.unseen_computed | path=%s | absolute_path=%s | label=%s | "
            "baseline_seen_count=%d | inserts_allowed=True | "
            "inserts_before_unseen_calc=False",
            self._path,
            self.absolute_path,
            self._poll_label,
            len(self._poll_baseline),
        )

    def end_poll(self) -> None:
        """Clear poll baseline / gate after the poll finishes."""
        _sqlite_log(
            "database.poll_end | path=%s | absolute_path=%s | label=%s",
            self._path,
            self.absolute_path,
            self._poll_label,
        )
        self._poll_baseline = None
        self._poll_label = None
        self._inserts_allowed = True

    def _assert_insert_allowed(self, listing_id: str) -> None:
        """Log (and refuse) INSERT attempted before unseen calculation."""
        if self._inserts_allowed:
            return
        _sqlite_error(
            "database.INSERT_BEFORE_UNSEEN | path=%s | absolute_path=%s | "
            "id=%s | label=%s | "
            "bug=INSERT attempted before unseen calculation — blocked",
            self._path,
            self.absolute_path,
            listing_id,
            self._poll_label,
        )
        raise RuntimeError(
            f"SQLite INSERT of {listing_id!r} attempted before unseen "
            f"calculation (db={self.absolute_path}, poll={self._poll_label!r})"
        )

    async def _exists(self, listing_id: str) -> bool:
        """Raw existence check without instrumentation."""
        db = self._require_db()
        async with db.execute(
            "SELECT 1 FROM seen_listings WHERE listing_id = ? LIMIT 1",
            (listing_id,),
        ) as cursor:
            return await cursor.fetchone() is not None

    async def is_seen(self, listing_id: str) -> bool:
        """Return ``True`` if ``listing_id`` has already been recorded."""
        return await self._exists(listing_id)

    async def contains(self, listing_id: str) -> bool:
        """Return ``True`` when SQLite already has ``id``.

        Every call logs the database path, total row count, and whether the ID
        already existed in the current poll's pre-insert baseline (when a poll
        is active via :meth:`begin_poll` / :meth:`mark_unseen_computed`).
        """
        existed_now = await self._exists(listing_id)
        row_count = await self.count()
        if self._poll_baseline is not None:
            existed_before_poll: Optional[bool] = listing_id in self._poll_baseline
        else:
            # No active poll baseline (e.g. debug_listing one-shot) — fall back
            # to the live existence check so the field is still populated.
            existed_before_poll = existed_now
        _sqlite_log(
            "database.contains | path=%s | absolute_path=%s | id=%s | "
            "contains=%s | row_count=%d | existed_before_current_poll=%s | "
            "poll_label=%s",
            self._path,
            self.absolute_path,
            listing_id,
            existed_now,
            row_count,
            existed_before_poll,
            self._poll_label,
        )
        return existed_now

    async def seen_subset(self, listing_ids: Sequence[str]) -> Set[str]:
        """Return the subset of ``listing_ids`` already present in the database.

        This is the batch counterpart to :meth:`is_seen`: it lets the caller
        discover every new id in a page with a single query instead of one query
        per listing, which materially reduces per-poll latency.
        """
        if not listing_ids:
            return set()
        db = self._require_db()
        # SQLite limits the number of bound variables (default 999); pages are
        # small (<= 40) but chunk defensively just in case.
        found: Set[str] = set()
        chunk = 500
        for start in range(0, len(listing_ids), chunk):
            batch = listing_ids[start : start + chunk]
            placeholders = ",".join("?" * len(batch))
            query = (
                f"SELECT listing_id FROM seen_listings "
                f"WHERE listing_id IN ({placeholders})"
            )
            async with db.execute(query, tuple(batch)) as cursor:
                rows = await cursor.fetchall()
            found.update(row[0] for row in rows)
        return found

    async def count(self) -> int:
        """Return the number of listings currently stored (useful for tests)."""
        db = self._require_db()
        async with db.execute("SELECT COUNT(*) FROM seen_listings") as cursor:
            row = await cursor.fetchone()
            return int(row[0]) if row else 0

    async def mark_seen(
        self,
        listing_id: str,
        *,
        source: str = "olx",
        title: Optional[str] = None,
        price: Optional[float] = None,
        url: Optional[str] = None,
        notified: bool = False,
    ) -> None:
        """Record a listing so it is ignored on subsequent polls.

        Uses ``INSERT OR IGNORE`` so concurrent tasks cannot raise on a
        duplicate primary key; the first writer wins.

        :param listing_id: Unique OLX listing identifier.
        :param source: Marketplace the listing came from (always ``"olx"`` here).
        :param title: Listing title, stored for debugging/auditing.
        :param price: Listing price, stored for debugging/auditing.
        :param url: Canonical listing URL.
        :param notified: Whether a Discord notification was sent for this deal.
        """
        self._assert_insert_allowed(listing_id)
        db = self._require_db()
        first_seen = time.time()
        timestamp = datetime.now(timezone.utc).isoformat()
        cursor = await db.execute(
            """
            INSERT OR IGNORE INTO seen_listings
                (listing_id, source, title, price, url, notified, first_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                listing_id,
                source,
                title,
                price,
                url,
                1 if notified else 0,
                first_seen,
            ),
        )
        await db.commit()
        inserted = cursor.rowcount is not None and cursor.rowcount > 0
        _sqlite_log(
            "database.INSERT | path=%s | absolute_path=%s | id=%s | "
            "timestamp=%s | first_seen_unix=%s | notified=%s | inserted=%s | "
            "title=%r",
            self._path,
            self.absolute_path,
            listing_id,
            timestamp,
            first_seen,
            notified,
            inserted,
            title,
        )

    async def mark_seen_many(self, records: Iterable[SeenRecord]) -> None:
        """Record many listings in a single transaction/commit.

        Committing once per poll (instead of once per listing) avoids repeated
        fsyncs and keeps the polling loop responsive under bursts of new
        listings.

        :param records: Iterable of
            ``(listing_id, source, title, price, url, notified)`` tuples.
        """
        materialised = list(records)
        if not materialised:
            return
        for listing_id, *_rest in materialised:
            self._assert_insert_allowed(listing_id)

        timestamp = datetime.now(timezone.utc).isoformat()
        first_seen = time.time()
        rows = [
            (
                listing_id,
                source,
                title,
                price,
                url,
                1 if notified else 0,
                first_seen,
            )
            for (listing_id, source, title, price, url, notified) in materialised
        ]
        # Log every INSERT attempt with exact id + timestamp before writing.
        for listing_id, source, title, price, url, notified in materialised:
            _sqlite_log(
                "database.INSERT | path=%s | absolute_path=%s | id=%s | "
                "timestamp=%s | first_seen_unix=%s | notified=%s | title=%r",
                self._path,
                self.absolute_path,
                listing_id,
                timestamp,
                first_seen,
                notified,
                title,
            )

        db = self._require_db()
        await db.executemany(
            """
            INSERT OR IGNORE INTO seen_listings
                (listing_id, source, title, price, url, notified, first_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        await db.commit()
        _sqlite_log(
            "database.INSERT_BATCH_COMMIT | path=%s | absolute_path=%s | "
            "count=%d | timestamp=%s | poll_label=%s",
            self._path,
            self.absolute_path,
            len(rows),
            timestamp,
            self._poll_label,
        )
