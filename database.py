"""Async SQLite persistence layer used for listing de-duplication.

The monitor may poll OLX many times per hour. To avoid re-processing (and
re-notifying) the same offer over and over, every listing that has been seen is
recorded in a small SQLite database keyed by the OLX listing id.

Notify lifecycle (Phase 1 delivery semantics):

* ``skipped`` — evaluated and rejected, or priming seed; never Discord-notified.
* ``pending`` — claimed for Discord delivery; webhook not yet confirmed.
* ``sent`` — Discord webhook accepted (or dry-run success).

A listing is only marked ``sent`` after a confirmed successful send. Failed
webhooks leave the row ``pending`` so it can be retried. Concurrent query
loops use :meth:`try_claim_notify` (``INSERT OR IGNORE``) so only one claim
wins — preventing duplicate Discord messages.

The whole module is asynchronous (via :mod:`aiosqlite`) so it integrates cleanly
with the asyncio event loop that drives the rest of the application.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import time
from typing import Iterable, List, Optional, Sequence, Set, Tuple

import aiosqlite

logger = logging.getLogger(__name__)

# Notify lifecycle values stored in ``seen_listings.notify_status``.
STATUS_SKIPPED = "skipped"
STATUS_PENDING = "pending"
STATUS_SENT = "sent"

# A row queued for bulk insertion of non-notify decisions:
#   (listing_id, source, title, price, url)
SkipRecord = Tuple[str, str, Optional[str], Optional[float], Optional[str]]

# Legacy alias kept for callers/tests that still pass a trailing ``notified``
# bool — mapped to skipped/sent by :meth:`mark_seen_many`.
SeenRecord = Tuple[str, str, Optional[str], Optional[float], Optional[str], bool]

# Pending Discord payload reconstructed from the DB for retries:
#   listing_id, source, title, price, url, model, storage_gb, resale, profit, query
PendingNotifyRow = Tuple[
    str,
    str,
    Optional[str],
    Optional[float],
    Optional[str],
    str,
    int,
    float,
    float,
    str,
]

__all__ = [
    "ListingDatabase",
    "STATUS_PENDING",
    "STATUS_SENT",
    "STATUS_SKIPPED",
    "SkipRecord",
    "SeenRecord",
    "PendingNotifyRow",
]


class ListingDatabase:
    """Thin async wrapper around a SQLite table of previously seen listings.

    Usage::

        db = ListingDatabase("listings.db")
        await db.connect()
        try:
            if not await db.is_seen("123"):
                await db.mark_skipped("123", source="olx", title="iPhone 13", ...)
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
                listing_id     TEXT PRIMARY KEY,
                source         TEXT NOT NULL,
                title          TEXT,
                price          REAL,
                url            TEXT,
                notified       INTEGER NOT NULL DEFAULT 0,
                first_seen     REAL NOT NULL,
                notify_status  TEXT NOT NULL DEFAULT 'skipped',
                model          TEXT,
                storage_gb     INTEGER,
                resale_price   REAL,
                profit         REAL,
                notify_query   TEXT,
                notify_attempts INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        await self._migrate_schema()
        await self._db.commit()

    async def _migrate_schema(self) -> None:
        """Add Phase-1 columns to older DBs and backfill ``notify_status``."""
        db = self._require_db()
        async with db.execute("PRAGMA table_info(seen_listings)") as cursor:
            columns = {row[1] for row in await cursor.fetchall()}

        alterations = {
            "notify_status": (
                "ALTER TABLE seen_listings "
                "ADD COLUMN notify_status TEXT NOT NULL DEFAULT 'skipped'"
            ),
            "model": "ALTER TABLE seen_listings ADD COLUMN model TEXT",
            "storage_gb": "ALTER TABLE seen_listings ADD COLUMN storage_gb INTEGER",
            "resale_price": "ALTER TABLE seen_listings ADD COLUMN resale_price REAL",
            "profit": "ALTER TABLE seen_listings ADD COLUMN profit REAL",
            "notify_query": "ALTER TABLE seen_listings ADD COLUMN notify_query TEXT",
            "notify_attempts": (
                "ALTER TABLE seen_listings "
                "ADD COLUMN notify_attempts INTEGER NOT NULL DEFAULT 0"
            ),
        }
        for name, ddl in alterations.items():
            if name not in columns:
                await db.execute(ddl)
                logger.info("Migrated seen_listings: added column %s", name)

        # Legacy rows: notified=1 → sent; otherwise leave skipped (no retry of
        # historical rejects/primes — only new pending rows are retried).
        await db.execute(
            """
            UPDATE seen_listings
            SET notify_status = 'sent'
            WHERE notified = 1 AND notify_status != 'sent'
            """
        )

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

    async def seen_subset(self, listing_ids: Sequence[str]) -> Set[str]:
        """Return the subset of ``listing_ids`` already present in the database.

        This is the batch counterpart to :meth:`is_seen`: it lets the caller
        discover every new id in a page with a single query instead of one query
        per listing, which materially reduces per-poll latency.

        Includes ``pending`` / ``sent`` / ``skipped`` — any prior decision.
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

    async def get_notify_status(self, listing_id: str) -> Optional[str]:
        """Return ``notify_status`` for ``listing_id``, or ``None`` if absent."""
        db = self._require_db()
        async with db.execute(
            "SELECT notify_status FROM seen_listings WHERE listing_id = ?",
            (listing_id,),
        ) as cursor:
            row = await cursor.fetchone()
        return str(row[0]) if row is not None else None

    async def mark_skipped(
        self,
        listing_id: str,
        *,
        source: str = "olx",
        title: Optional[str] = None,
        price: Optional[float] = None,
        url: Optional[str] = None,
    ) -> None:
        """Record a listing that will not be Discord-notified (reject / priming)."""
        await self.mark_skipped_many([(listing_id, source, title, price, url)])

    async def mark_skipped_many(self, records: Iterable[SkipRecord]) -> None:
        """Bulk-insert skipped listings (``INSERT OR IGNORE``)."""
        rows = [
            (
                listing_id,
                source,
                title,
                price,
                url,
                0,
                time.time(),
                STATUS_SKIPPED,
            )
            for (listing_id, source, title, price, url) in records
        ]
        if not rows:
            return
        db = self._require_db()
        await db.executemany(
            """
            INSERT OR IGNORE INTO seen_listings
                (listing_id, source, title, price, url, notified, first_seen,
                 notify_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        await db.commit()

    async def try_claim_notify(
        self,
        listing_id: str,
        *,
        source: str = "olx",
        title: Optional[str] = None,
        price: Optional[float] = None,
        url: Optional[str] = None,
        model: str,
        storage_gb: int,
        resale_price: float,
        profit: float,
        query: str,
    ) -> bool:
        """Atomically claim ``listing_id`` for Discord delivery.

        Inserts a ``pending`` row. Returns ``True`` only when this caller won
        the insert (first writer). Concurrent loops seeing the same id get
        ``False`` and must not enqueue a second notification.
        """
        db = self._require_db()
        await db.execute(
            """
            INSERT OR IGNORE INTO seen_listings
                (listing_id, source, title, price, url, notified, first_seen,
                 notify_status, model, storage_gb, resale_price, profit,
                 notify_query, notify_attempts)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                listing_id,
                source,
                title,
                price,
                url,
                time.time(),
                STATUS_PENDING,
                model,
                storage_gb,
                resale_price,
                profit,
                query,
            ),
        )
        async with db.execute("SELECT changes()") as cursor:
            row = await cursor.fetchone()
        await db.commit()
        claimed = bool(row and int(row[0]) == 1)
        if claimed:
            logger.debug("Claimed listing %s for notify (pending)", listing_id)
        return claimed

    async def mark_notified(self, listing_id: str) -> None:
        """Mark ``listing_id`` as successfully Discord-notified (``sent``)."""
        db = self._require_db()
        await db.execute(
            """
            UPDATE seen_listings
            SET notified = 1, notify_status = ?
            WHERE listing_id = ?
            """,
            (STATUS_SENT, listing_id),
        )
        await db.commit()

    async def bump_notify_attempt(self, listing_id: str) -> int:
        """Increment ``notify_attempts`` for a pending row; return new count."""
        db = self._require_db()
        await db.execute(
            """
            UPDATE seen_listings
            SET notify_attempts = notify_attempts + 1
            WHERE listing_id = ? AND notify_status = ?
            """,
            (listing_id, STATUS_PENDING),
        )
        await db.commit()
        async with db.execute(
            "SELECT notify_attempts FROM seen_listings WHERE listing_id = ?",
            (listing_id,),
        ) as cursor:
            row = await cursor.fetchone()
        return int(row[0]) if row else 0

    async def list_pending_notifications(
        self, *, max_attempts: int = 20
    ) -> List[PendingNotifyRow]:
        """Return pending deals that still need a Discord send (for retries)."""
        db = self._require_db()
        async with db.execute(
            """
            SELECT listing_id, source, title, price, url,
                   model, storage_gb, resale_price, profit, notify_query
            FROM seen_listings
            WHERE notify_status = ?
              AND notify_attempts < ?
              AND model IS NOT NULL
              AND storage_gb IS NOT NULL
              AND resale_price IS NOT NULL
              AND profit IS NOT NULL
            ORDER BY first_seen ASC
            """,
            (STATUS_PENDING, max_attempts),
        ) as cursor:
            rows = await cursor.fetchall()
        result: List[PendingNotifyRow] = []
        for row in rows:
            result.append(
                (
                    str(row[0]),
                    str(row[1]),
                    row[2],
                    float(row[3]) if row[3] is not None else None,
                    row[4],
                    str(row[5]),
                    int(row[6]),
                    float(row[7]),
                    float(row[8]),
                    str(row[9] or ""),
                )
            )
        return result

    # -- Backward-compatible helpers (older call sites / tests) ------------- #

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
        """Legacy helper: ``notified=True`` → sent; else skipped.

        Prefer :meth:`mark_skipped` / :meth:`try_claim_notify` /
        :meth:`mark_notified` in new code.
        """
        if notified:
            claimed = await self.try_claim_notify(
                listing_id,
                source=source,
                title=title,
                price=price,
                url=url,
                model="?",
                storage_gb=0,
                resale_price=0.0,
                profit=0.0,
                query="",
            )
            if claimed:
                await self.mark_notified(listing_id)
            else:
                await self.mark_notified(listing_id)
            return
        await self.mark_skipped(
            listing_id, source=source, title=title, price=price, url=url
        )

    async def mark_seen_many(self, records: Iterable[SeenRecord]) -> None:
        """Legacy bulk insert: trailing bool maps to skipped (False) / sent (True).

        ``True`` is treated as already-sent (e.g. tests). Production notify
        path uses :meth:`try_claim_notify` + :meth:`mark_notified` instead.
        """
        skipped: List[SkipRecord] = []
        sent_now: List[SeenRecord] = []
        for record in records:
            listing_id, source, title, price, url, notified = record
            if notified:
                sent_now.append(record)
            else:
                skipped.append((listing_id, source, title, price, url))
        await self.mark_skipped_many(skipped)
        for listing_id, source, title, price, url, _ in sent_now:
            await self.try_claim_notify(
                listing_id,
                source=source,
                title=title,
                price=price,
                url=url,
                model="?",
                storage_gb=0,
                resale_price=0.0,
                profit=0.0,
                query="",
            )
            await self.mark_notified(listing_id)
