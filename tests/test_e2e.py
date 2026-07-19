"""End-to-end test for the OLX iPhone resale-deal monitor.

Spins up a local aiohttp server that impersonates BOTH the OLX offers API and a
Discord webhook, points the monitor at it, and asserts the full pipeline works:

    fetch -> drop promoted -> blacklist -> parse model/storage -> resale lookup
          -> profit -> SQLite batch de-dup -> queue -> Discord notify

No network access, secrets or real accounts are required, so this runs anywhere.

Run directly::

    python tests/test_e2e.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import aiohttp
from aiohttp import web

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from discord import DiscordNotifier  # noqa: E402
from main import AppConfig, DealMonitor  # noqa: E402
from olx import OlxClient  # noqa: E402
from pricing import PriceBook  # noqa: E402


def _offer(
    offer_id: int,
    title: str,
    price,
    *,
    description: str = "",
    model_label: str | None = None,
    storage_label: str | None = None,
    photos: int = 1,
    business: bool = False,
    seller: str | None = None,
    currency: str = "PLN",
) -> dict:
    """Build an OLX-API-shaped offer dict for the fake server."""
    params = []
    if price is not None:
        params.append(
            {
                "key": "price",
                "value": {"value": price, "currency": currency, "label": f"{price} zł"},
            }
        )
    if model_label is not None:
        params.append(
            {"key": "phonemodel", "value": {"key": "m", "label": model_label}}
        )
    if storage_label is not None:
        params.append(
            {
                "key": "builtinmemory_phones",
                "value": {"key": "s", "label": storage_label},
            }
        )
    return {
        "id": offer_id,
        "title": title,
        "url": f"https://www.olx.pl/oferta/{offer_id}",
        "created_time": "2026-07-19T10:00:00+02:00",
        "description": description,
        "params": params,
        "business": business,
        "user": {"name": seller} if seller else None,
        "location": {"city": {"name": "Warszawa"}, "region": {"name": "Mazowieckie"}},
        "photos": [
            {"link": "https://example.com/{width}x{height}/pic.jpg"}
            for _ in range(photos)
        ],
    }


# Index 5 is flagged promoted and must be ignored despite looking like a deal.
FAKE_OFFERS = [
    # organic deal via STRUCTURED hints: resale 1900 - 1200 = 700 profit
    _offer(2001, "iPhone 13 128GB idealny", 1200,
           model_label="iPhone 13", storage_label="128GB", photos=3, seller="Jan K"),
    # text-parsed, not profitable: resale(13 Pro Max/256)=3050 - 5000 < 0
    _offer(2002, "iPhone 13 Pro Max 256GB", 5000),
    # blacklisted (icloud) even though cheap
    _offer(2003, "iPhone 13 128GB blokada icloud", 500),
    # storage cannot be determined -> ignore
    _offer(2004, "iPhone 13 sprzedam", 800),
    # unknown model (not in price book) -> ignore
    _offer(2005, "iPhone 99 128GB", 100),
    # PROMOTED look-alike deal -> must be skipped
    _offer(2006, "iPhone 13 128GB tanio", 100,
           model_label="iPhone 13", storage_label="128GB"),
    # swap keyword ("zamiana") -> ignore even though otherwise a deal
    _offer(2007, "iPhone 13 128GB zamiana", 500,
           model_label="iPhone 13", storage_label="128GB", photos=3),
    # price == 0 (swap/trade) -> ignore
    _offer(2008, "iPhone 13 128GB", 0,
           model_label="iPhone 13", storage_label="128GB", photos=3),
    # no photos attached -> ignore
    _offer(2009, "iPhone 13 128GB", 400,
           model_label="iPhone 13", storage_label="128GB", photos=0),
    # business/shop account -> ignore
    _offer(2010, "iPhone 13 128GB", 400,
           model_label="iPhone 13", storage_label="128GB", photos=3, business=True),
    # accessory keyword ("bateria") -> ignore even though it parses as a phone
    _offer(2011, "iPhone 13 128GB bateria do wymiany", 400,
           model_label="iPhone 13", storage_label="128GB", photos=3),
    # below minimum_profit (resale 1900 - 1750 = 150 < 300) -> ignore
    _offer(2012, "iPhone 13 128GB", 1750,
           model_label="iPhone 13", storage_label="128GB", photos=3),
]
PROMOTED_INDICES = [5]


class FakeServer:
    def __init__(self) -> None:
        self.webhook_payloads: list[dict] = []
        self._runner: web.AppRunner | None = None
        self.base_url = ""

    async def start(self) -> None:
        app = web.Application()
        app.router.add_get("/api/v1/offers/", self._offers)
        app.router.add_post("/webhook", self._webhook)
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
        query = request.query.get("query", "").lower()
        offset = int(request.query.get("offset", "0"))
        if "iphone" not in query or offset > 0:
            return web.json_response({"data": [], "metadata": {"promoted": []}})
        return web.json_response(
            {"data": FAKE_OFFERS, "metadata": {"promoted": PROMOTED_INDICES}}
        )

    async def _webhook(self, request: web.Request) -> web.Response:
        self.webhook_payloads.append(await request.json())
        return web.Response(status=204)


def _build_config(server: FakeServer, *, prime: bool) -> AppConfig:
    return AppConfig(
        webhook_url=f"{server.base_url}/webhook",
        discord_username="Test Bot",
        discord_rate_limit_seconds=0.0,
        olx_base_url=f"{server.base_url}/api/v1/offers/",
        olx_user_agent="test-agent",
        olx_region_id=None,
        olx_sort_by=None,
        olx_include_promoted=False,
        olx_extra_params={},
        poll_interval_seconds=0.1,
        jitter_seconds=0.0,
        max_backoff_seconds=1.0,
        request_timeout_seconds=5.0,
        results_per_query=40,
        pages_per_poll=1,
        search_queries=["iphone 13"],
        database_path=":memory:",
        minimum_profit=300.0,
        stats_interval_seconds=0.0,
        blacklist_keywords=[
            "icloud", "blokada", "uszkodzony", "na części",
            "zamienię", "zamiana", "swap", "wymiana", "trade",
        ],
        accessory_keywords=["etui", "case", "bateria", "szkło", "ładowarka"],
        prime_on_start=prime,
        price_book=PriceBook(
            {
                "iPhone 13": {"128": 1900, "256": 2100},
                "iPhone 13 Pro Max": {"256": 3050},
            }
        ),
    )


async def _run_cycles(
    monitor: DealMonitor, cycles: int, *, priming_first_cycle: bool
) -> None:
    await monitor._db.connect()
    async with aiohttp.ClientSession() as session:
        olx = OlxClient(session, base_url=monitor._config.olx_base_url)
        notifier = DiscordNotifier(
            session,
            webhook_url=monitor._config.webhook_url,
            username=monitor._config.discord_username,
            rate_limit_seconds=0.0,
        )
        worker = asyncio.create_task(monitor._notifier_worker(notifier))
        try:
            for cycle in range(cycles):
                priming = priming_first_cycle and cycle == 0
                for query in monitor._config.search_queries:
                    listings = await olx.search(query)
                    await monitor._process_listings(query, listings, priming=priming)
                await monitor._queue.join()
        finally:
            worker.cancel()
            await asyncio.gather(worker, return_exceptions=True)
    await monitor._db.close()


async def test_full_matching_pipeline() -> None:
    """Only the single profitable, non-blacklisted, identifiable organic listing
    notifies; everything else is filtered; a second cycle de-dupes."""
    server = FakeServer()
    await server.start()
    try:
        monitor = DealMonitor(_build_config(server, prime=False))
        await _run_cycles(monitor, cycles=2, priming_first_cycle=False)

        assert len(server.webhook_payloads) == 1, (
            f"expected exactly 1 webhook, got {len(server.webhook_payloads)}"
        )
        embed = server.webhook_payloads[0]["embeds"][0]
        assert embed["title"] == "🔥 DEAL FOUND", embed["title"]
        fields = {f["name"]: f["value"] for f in embed["fields"]}
        assert fields["📱 Model"] == "iPhone 13", fields
        assert fields["💾 Storage"] == "128GB", fields
        assert fields["📈 Expected profit"].startswith("700.00"), fields  # 1900 - 1200
        assert fields["🏷️ My resale price"].startswith("1900.00"), fields
        assert fields["👤 Seller name"] == "Jan K", fields
        assert "Open on OLX" in fields["🔗 Link"], fields
        # Stats counters updated.
        assert monitor._stats.deals_found == 1, monitor._stats
        assert monitor._stats.notifications_sent == 1, monitor._stats
        assert monitor._stats.average_profit == 700.0, monitor._stats
        print("PASS: full pipeline notifies only the valid profitable deal, de-dupes")
    finally:
        await server.stop()


async def test_blacklist_and_unknowns_are_ignored() -> None:
    """Blacklisted / unknown-storage / unknown-model / promoted / unprofitable
    listings never notify (verified via evaluate())."""
    server = FakeServer()
    await server.start()
    try:
        monitor = DealMonitor(_build_config(server, prime=False))
        async with aiohttp.ClientSession() as session:
            olx = OlxClient(session, base_url=f"{server.base_url}/api/v1/offers/")
            listings = await olx.search("iphone 13")
        by_id = {listing.id: listing for listing in listings}
        # Promoted 2006 filtered by the client already.
        assert "2006" not in by_id, "promoted listing should be filtered by client"
        assert monitor.evaluate(by_id["2001"]) is not None       # good deal
        assert monitor.evaluate(by_id["2002"]) is None           # not profitable
        assert monitor.evaluate(by_id["2003"]) is None           # blacklisted
        assert monitor.evaluate(by_id["2004"]) is None           # no storage
        assert monitor.evaluate(by_id["2005"]) is None           # unknown model
        assert monitor.evaluate(by_id["2007"]) is None           # swap keyword
        assert monitor.evaluate(by_id["2008"]) is None           # price == 0
        assert monitor.evaluate(by_id["2009"]) is None           # no photos
        assert monitor.evaluate(by_id["2010"]) is None           # business account
        assert monitor.evaluate(by_id["2011"]) is None           # accessory keyword
        assert monitor.evaluate(by_id["2012"]) is None           # below minimum_profit
        print(
            "PASS: blacklist / no-storage / unknown-model / swap / zero-price / "
            "no-photos / business / accessory / below-min-profit ignored"
        )
    finally:
        await server.stop()


async def test_priming_suppresses_first_cycle() -> None:
    server = FakeServer()
    await server.start()
    try:
        monitor = DealMonitor(_build_config(server, prime=True))
        await _run_cycles(monitor, cycles=1, priming_first_cycle=True)
        assert server.webhook_payloads == [], server.webhook_payloads
        print("PASS: priming suppresses notifications on the first cycle")
    finally:
        await server.stop()


async def _main() -> None:
    await test_blacklist_and_unknowns_are_ignored()
    await test_full_matching_pipeline()
    await test_priming_suppresses_first_cycle()
    print("\nALL TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(_main())
