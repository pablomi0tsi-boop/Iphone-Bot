"""Async SQLite persistence layer used for listing de-duplication.

The monitor may poll OLX many times per hour. To avoid re-processing (and
re-notifying) the same offer over and over, every listing that has been seen is
recorded in a small SQLite database keyed by the OLX listing id.

The whole module is asynchronous (via :mod:`aiosqlite`) so it integrates cleanly
with the asyncio event loop that drives the rest of the application.
"""

from __future__ import annotations

import time
from typing import Optional

import aiosqlite

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

        Safe to call once during application start-up. Enables WAL mode so that
        reads and writes do not block each other during long polling loops.
        """
        self._db = await aiosqlite.connect(self._path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL;")
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

    async def close(self) -> None:
        """Close the underlying connection if it is open."""
        if self._db is not None:
            await self._db.close()
            self._db = None

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
