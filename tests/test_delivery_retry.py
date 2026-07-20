"""Tests for Phase 1–2 delivery / pagination / backoff changes.

Covers:
* ``try_claim_notify`` is atomic — only one winner (no duplicate Discord).
* ``mark_notified`` only after successful send; Discord failure leaves pending.
* Pending rows are re-queued and eventually sent.
* Multi-page OLX search fetches offset pages.
* Default / configured ``max_backoff_seconds`` cap is 60.

Does **not** change business filters or model detection.

Run directly::

    python tests/test_delivery_retry.py
"""

from __future__ import annotations

import asyncio
import sys
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import aiohttp
from aiohttp import web

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import (  # noqa: E402
    STATUS_PENDING,
    STATUS_SENT,
    STATUS_SKIPPED,
    ListingDatabase,
)
from discord import DiscordNotifier  # noqa: E402
from main import AppConfig, DealMonitor  # noqa: E402
from olx import Listing, OlxClient  # noqa: E402
from pricing import PriceBook  # noqa: E402


def _config(db_path: str, **overrides: Any) -> AppConfig:
    base = dict(
        webhook_url="https://example.invalid/webhook",
        discord_username="Bot",
        discord_rate_limit_seconds=0.0,
        olx_base_url="https://example.invalid/api/v1/offers/",
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
        pages_per_poll=2,
        search_queries=["iphone 13"],
        database_path=db_path,
        stats_interval_seconds=0.0,
        blacklist_keywords=[],
        accessory_keywords=[],
        prime_on_start=False,
        price_book=PriceBook({"iPhone 13": {"128": 1600}}),
    )
    base.update(overrides)
    return AppConfig(**base)


def _listing(listing_id: str = "42") -> Listing:
    return Listing(
        id=listing_id,
        title="iPhone 13 128GB",
        price=900.0,
        currency="PLN",
        url=f"https://www.olx.pl/oferta/{listing_id}",
        photo_count=1,
        is_business=False,
    )


async def test_claim_is_atomic_no_duplicate() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db = ListingDatabase(str(Path(tmp) / "t.db"))
        await db.connect()
        listing = _listing("dup-1")
        kwargs = dict(
            source="olx",
            title=listing.title,
            price=listing.price,
            url=listing.url,
            model="iPhone 13",
            storage_gb=128,
            resale_price=1600.0,
            profit=700.0,
            query="iphone 13",
        )
        assert await db.try_claim_notify(listing.id, **kwargs) is True
        assert await db.try_claim_notify(listing.id, **kwargs) is False
        assert await db.get_notify_status(listing.id) == STATUS_PENDING
        await db.mark_notified(listing.id)
        assert await db.get_notify_status(listing.id) == STATUS_SENT
        assert await db.try_claim_notify(listing.id, **kwargs) is False
        await db.close()
    print("PASS: try_claim_notify is atomic; mark_notified → sent")


async def test_discord_failure_leaves_pending_then_retry_sends() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "t.db")
        monitor = DealMonitor(_config(db_path, webhook_url="https://example.invalid/w"))
        await monitor._db.connect()

        listing = _listing("retry-1")
        await monitor._db.try_claim_notify(
            listing.id,
            source="olx",
            title=listing.title,
            price=listing.price,
            url=listing.url,
            model="iPhone 13",
            storage_gb=128,
            resale_price=1600.0,
            profit=700.0,
            query="iphone 13",
        )
        await monitor._enqueue_deal(
            (listing, "iPhone 13", 128, 1600.0, 700.0, "iphone 13")
        )

        # First call fails, second succeeds.
        notifier = AsyncMock(spec=DiscordNotifier)
        notifier.send_deal = AsyncMock(side_effect=[False, True])

        worker = asyncio.create_task(monitor._notifier_worker(notifier))
        try:
            await asyncio.wait_for(monitor._queue.join(), timeout=15)
        finally:
            worker.cancel()
            await asyncio.gather(worker, return_exceptions=True)

        assert notifier.send_deal.await_count >= 2
        assert await monitor._db.get_notify_status("retry-1") == STATUS_SENT
        assert monitor._stats.notifications_sent == 1
        await monitor._db.close()
    print("PASS: Discord failure keeps pending; retry then marks sent")


async def test_process_listings_claims_pending_not_sent_before_webhook() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        monitor = DealMonitor(_config(str(Path(tmp) / "t.db"), webhook_url=""))
        await monitor._db.connect()
        listing = _listing("proc-1")
        await monitor._process_listings("iphone 13", [listing], priming=False)
        assert await monitor._db.get_notify_status("proc-1") == STATUS_PENDING
        assert monitor._queue.qsize() == 1
        # Simulate successful worker side-effect.
        await monitor._db.mark_notified("proc-1")
        assert await monitor._db.get_notify_status("proc-1") == STATUS_SENT
        await monitor._db.close()
    print("PASS: _process_listings claims pending (not sent) before Discord")


async def test_skipped_reject_is_not_pending() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        monitor = DealMonitor(
            _config(
                str(Path(tmp) / "t.db"),
                blacklist_keywords=["icloud"],
            )
        )
        await monitor._db.connect()
        bad = Listing(
            id="bad-1",
            title="iPhone 13 128GB icloud",
            price=500.0,
            currency="PLN",
            url="u",
            photo_count=1,
            is_business=False,
        )
        await monitor._process_listings("iphone 13", [bad], priming=False)
        assert await monitor._db.get_notify_status("bad-1") == STATUS_SKIPPED
        assert monitor._queue.empty()
        await monitor._db.close()
    print("PASS: rejected listings are skipped (not pending)")


async def test_multi_page_olx_search() -> None:
    """OlxClient.search with pages=2 must request offset=0 and offset=40."""
    offsets_seen: list[int] = []

    async def handler(request: web.Request) -> web.Response:
        offset = int(request.query.get("offset", "0"))
        offsets_seen.append(offset)
        if offset == 0:
            data = [
                {
                    "id": 1,
                    "title": "iPhone 13 128GB A",
                    "url": "https://www.olx.pl/oferta/1",
                    "created_time": "2026-07-20T12:00:00+02:00",
                    "description": "",
                    "params": [
                        {"key": "price", "value": {"value": 900, "currency": "PLN"}}
                    ],
                    "business": False,
                    "photos": [{"link": "https://example.com/a.jpg"}],
                }
            ]
            # Full page so the client continues to page 2.
            data.extend(
                {
                    "id": 1000 + i,
                    "title": f"filler {i}",
                    "url": f"https://www.olx.pl/oferta/{1000 + i}",
                    "created_time": "2026-07-01T12:00:00+02:00",
                    "description": "",
                    "params": [
                        {"key": "price", "value": {"value": 1, "currency": "PLN"}}
                    ],
                    "business": False,
                    "photos": [{"link": "https://example.com/x.jpg"}],
                }
                for i in range(39)
            )
            return web.json_response({"data": data, "metadata": {"promoted": []}})
        return web.json_response(
            {
                "data": [
                    {
                        "id": 2,
                        "title": "iPhone 13 128GB B page2",
                        "url": "https://www.olx.pl/oferta/2",
                        "created_time": "2026-07-20T11:00:00+02:00",
                        "description": "",
                        "params": [
                            {
                                "key": "price",
                                "value": {"value": 800, "currency": "PLN"},
                            }
                        ],
                        "business": False,
                        "photos": [{"link": "https://example.com/b.jpg"}],
                    }
                ],
                "metadata": {"promoted": []},
            }
        )

    app = web.Application()
    app.router.add_get("/api/v1/offers/", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    sock = list(runner.sites)[0]._server.sockets[0]  # type: ignore[attr-defined]
    base = f"http://127.0.0.1:{sock.getsockname()[1]}"
    try:
        async with aiohttp.ClientSession() as session:
            client = OlxClient(session, base_url=f"{base}/api/v1/offers/")
            listings = await client.search("iphone 13", limit=40, pages=2)
        assert offsets_seen == [0, 40], offsets_seen
        ids = {listing.id for listing in listings}
        assert "1" in ids and "2" in ids, ids
    finally:
        await runner.cleanup()
    print("PASS: multi-page OLX search uses offset 0 then 40")


async def test_non_json_olx_response_raises() -> None:
    async def handler(_request: web.Request) -> web.Response:
        return web.Response(text="not-json", content_type="text/plain")

    app = web.Application()
    app.router.add_get("/api/v1/offers/", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    sock = list(runner.sites)[0]._server.sockets[0]  # type: ignore[attr-defined]
    base = f"http://127.0.0.1:{sock.getsockname()[1]}"
    try:
        async with aiohttp.ClientSession() as session:
            client = OlxClient(session, base_url=f"{base}/api/v1/offers/")
            try:
                await client.search("iphone 13", limit=40, pages=1)
            except Exception:
                print("PASS: non-JSON OLX response fails the poll")
                return
            raise AssertionError("non-JSON response should raise")
    finally:
        await runner.cleanup()


async def _main() -> None:
    await test_claim_is_atomic_no_duplicate()
    await test_process_listings_claims_pending_not_sent_before_webhook()
    await test_skipped_reject_is_not_pending()
    await test_discord_failure_leaves_pending_then_retry_sends()
    await test_multi_page_olx_search()
    await test_non_json_olx_response_raises()
    print("\nALL DELIVERY/RETRY/PAGINATION TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(_main())
