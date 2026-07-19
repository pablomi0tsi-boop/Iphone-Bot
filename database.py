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
from typing import Iterable, Optional, Sequence, Set, Tuple

import aiosqlite

logger = logging.getLogger(__name__)

# A row queued for bulk insertion:
#   (listing_id, source, title, price, url, notified)
SeenRecord = Tuple[str, str, Optional[str], Optional[float], Optional[str], bool]

__all__ = ["ListingDatabase"]


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
            logger.error(
                "Database at %s is unusable (%s); quarantining and recreating",
                self._path,
                exc,
            )
            await self._safe_close()
            self._quarantine_corrupt_files()
            await self._open_and_init()
        logger.info("Connected to SQLite database at %s", self._path)

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

    async def is_seen(self, listing_id: str) -> bool:
        """Return ``True`` if ``listing_id`` has already been recorded."""
        db = self._require_db()
        async with db.execute(
            "SELECT 1 FROM seen_listings WHERE listing_id = ? LIMIT 1",
            (listing_id,),
        ) as cursor:
            return await cursor.fetchone() is not None

    async def contains(self, listing_id: str) -> bool:
        """Alias for :meth:`is_seen` — ``True`` when SQLite already has ``id``."""
        return await self.is_seen(listing_id)

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
        db = self._require_db()
        await db.execute(
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
                time.time(),
            ),
        )
        await db.commit()

    async def mark_seen_many(self, records: Iterable[SeenRecord]) -> None:
        """Record many listings in a single transaction/commit.

        Committing once per poll (instead of once per listing) avoids repeated
        fsyncs and keeps the polling loop responsive under bursts of new
        listings.

        :param records: Iterable of
            ``(listing_id, source, title, price, url, notified)`` tuples.
        """
        rows = [
            (
                listing_id,
                source,
                title,
                price,
                url,
                1 if notified else 0,
                time.time(),
            )
            for (listing_id, source, title, price, url, notified) in records
        ]
        if not rows:
            return
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
