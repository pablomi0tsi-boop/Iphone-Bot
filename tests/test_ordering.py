"""Tests that the monitor processes/delivers OLX listings newest-first by
publication timestamp, not by the (non-chronological) raw API response order.

Covers:
* ``listing_sort_key`` parses OLX timestamps correctly and treats missing/
  malformed timestamps as the OLDEST possible value (never the newest).
* ``OlxClient.search()`` returns listings sorted newest-first even when the
  fake server deliberately returns them in a scrambled, non-chronological
  order (mirroring real OLX behaviour).
* The full ``DealMonitor._process_listings`` pipeline preserves that order
  end to end: deals are delivered to Discord newest-first.

Run directly::

    python tests/test_ordering.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import aiohttp
from aiohttp import web

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import AppConfig, DealMonitor  # noqa: E402
from olx import Listing, OlxClient, listing_sort_key  # noqa: E402
from pricing import PriceBook  # noqa: E402


def test_listing_sort_key_parses_and_orders() -> None:
    newer = Listing(id="1", title="new", price=100.0, currency="PLN", url="",
                     created_at="2026-07-19T12:00:00+02:00")
    older = Listing(id="2", title="old", price=100.0, currency="PLN", url="",
                     created_at="2026-07-01T12:00:00+02:00")
    missing = Listing(id="3", title="missing", price=100.0, currency="PLN", url="",
                       created_at=None)
    malformed = Listing(id="4", title="bad", price=100.0, currency="PLN", url="",
                         created_at="not-a-timestamp")

    assert listing_sort_key(newer) > listing_sort_key(older)
    # Missing/malformed timestamps must sort as the OLDEST, never the newest.
    assert listing_sort_key(missing) < listing_sort_key(older)
    assert listing_sort_key(malformed) < listing_sort_key(older)

    ordered = sorted([older, missing, newer, malformed], key=listing_sort_key, reverse=True)
    assert [listing.id for listing in ordered] == ["1", "2", "3", "4"] or \
        [listing.id for listing in ordered] == ["1", "2", "4", "3"], (
        "newest (id=1) must sort first; missing/malformed (3, 4) must sort last"
    )
    assert ordered[0].id == "1"
    print("PASS: listing_sort_key parses OLX timestamps and orders newest-first; "
          "missing/malformed timestamps sort as oldest")


def _offer(offer_id: int, title: str, created_time: str | None) -> dict:
    return {
        "id": offer_id,
        "title": title,
        "url": f"https://www.olx.pl/oferta/{offer_id}",
        "created_time": created_time,
        "description": "",
        "params": [{"key": "price", "value": {"value": 500, "currency": "PLN"}}],
        "business": False,
        "user": None,
        "location": None,
        "photos": [{"link": "https://example.com/pic.jpg"}],
    }


# Deliberately scrambled / non-chronological order, exactly like the real OLX
# API returns (relevance-ranked, not newest-first).
SCRAMBLED_OFFERS = [
    _offer(1, "third newest",  "2026-07-15T09:00:00+02:00"),
    _offer(2, "OLDEST",        "2026-07-01T09:00:00+02:00"),
    _offer(3, "NEWEST",        "2026-07-19T18:30:00+02:00"),
    _offer(4, "no timestamp",  None),
    _offer(5, "second newest", "2026-07-17T09:00:00+02:00"),
]


class _FakeOlxServer:
    def __init__(self) -> None:
        self.base_url = ""
        self._runner: web.AppRunner | None = None

    async def start(self) -> None:
        app = web.Application()
        app.router.add_get("/api/v1/offers/", self._offers)
        self._runner = web.AppRunner(app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, "127.0.0.1", 0)
        await site.start()
        sock = list(self._runner.sites)[0]._server.sockets[0]  # type: ignore[attr-defined]
        self.base_url = f"http://127.0.0.1:{sock.getsockname()[1]}"

    async def stop(self) -> None:
        if self._runner is not None:
            await self._runner.cleanup()

    async def _offers(self, request: web.Request) -> web.Response:
        if int(request.query.get("offset", "0")) > 0:
            return web.json_response({"data": [], "metadata": {"promoted": []}})
        return web.json_response({"data": SCRAMBLED_OFFERS, "metadata": {"promoted": []}})


async def test_olx_client_search_returns_newest_first() -> None:
    server = _FakeOlxServer()
    await server.start()
    try:
        async with aiohttp.ClientSession() as session:
            client = OlxClient(session, base_url=f"{server.base_url}/api/v1/offers/")
            listings = await client.search("iphone 13")

        ids_in_order = [listing.id for listing in listings]
        # The fake server returned ids in a scrambled order; the client must
        # re-sort them newest-first by 'created_at', not preserve API order.
        assert ids_in_order[0] == "3", (
            f"expected the NEWEST listing (id=3) first, got order {ids_in_order}"
        )
        assert ids_in_order == ["3", "5", "1", "2", "4"], ids_in_order
        print(
            "PASS: OlxClient.search() re-sorts scrambled API results newest-first "
            f"by 'created_at' (order: {ids_in_order}, API order was "
            f"{[str(o['id']) for o in SCRAMBLED_OFFERS]})"
        )
    finally:
        await server.stop()


def _build_config(server: _FakeOlxServer) -> AppConfig:
    return AppConfig(
        webhook_url="",
        discord_username="Test",
        discord_rate_limit_seconds=0.0,
        olx_base_url=f"{server.base_url}/api/v1/offers/",
        olx_user_agent="test",
        olx_region_id=None,
        olx_sort_by=None,
        olx_include_promoted=False,
        olx_extra_params={},
        poll_interval_seconds=10,
        jitter_seconds=0,
        max_backoff_seconds=60,
        request_timeout_seconds=5,
        results_per_query=40,
        pages_per_poll=1,
        search_queries=["iphone 13"],
        database_path=":memory:",
        stats_interval_seconds=0.0,
        blacklist_keywords=[],
        accessory_keywords=[],
        prime_on_start=False,
        price_book=PriceBook({"iPhone 13": {"128": 900}}),
    )


async def test_deal_delivery_order_is_newest_first_not_profit_order() -> None:
    """When multiple deals are found in one poll, they must be queued
    newest-first (by listing timestamp) -- deliberately NOT in profit order,
    to prove the sort key really is recency and not profit size."""
    server = _FakeOlxServer()
    await server.start()
    try:
        config = _build_config(server)
        config.price_book = PriceBook({"iPhone 13": {"128": 900}})
        monitor = DealMonitor(config)
        await monitor._db.connect()

        # Recency order:  3 (newest) > 1 > 2 (oldest)
        # Profit order:   2 (850) > 1 (800) > 3 (100)   -- deliberately reversed
        # so the two orderings cannot be confused with each other.
        listings = [
            Listing(id="1", title="iPhone 13 128GB", price=100.0, currency="PLN",
                    url="u1", created_at="2026-07-15T09:00:00+02:00", photo_count=1),
            Listing(id="2", title="iPhone 13 128GB", price=50.0, currency="PLN",
                    url="u2", created_at="2026-07-01T09:00:00+02:00", photo_count=1),
            Listing(id="3", title="iPhone 13 128GB", price=800.0, currency="PLN",
                    url="u3", created_at="2026-07-19T18:30:00+02:00", photo_count=1),
        ]
        # Sort as OlxClient.search() would (newest-first) before handing to
        # _process_listings, mirroring real usage.
        listings.sort(key=listing_sort_key, reverse=True)
        await monitor._process_listings("iphone 13", listings, priming=False)
        await monitor._db.close()

        queued_ids = []
        while not monitor._queue.empty():
            item = monitor._queue.get_nowait()
            queued_ids.append(item[0].id)

        assert queued_ids == ["3", "1", "2"], (
            f"expected newest-first delivery order ['3','1','2'], got {queued_ids} "
            "(profit-first order would incorrectly be ['2','1','3'])"
        )
        print(
            f"PASS: deals delivered newest-first ({queued_ids}), NOT in profit "
            "order (which would have been ['2', '1', '3'])"
        )
    finally:
        await server.stop()


async def _main() -> None:
    test_listing_sort_key_parses_and_orders()
    await test_olx_client_search_returns_newest_first()
    await test_deal_delivery_order_is_newest_first_not_profit_order()
    print("\nALL ORDERING TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(_main())
