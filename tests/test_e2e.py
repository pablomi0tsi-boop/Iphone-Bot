"""End-to-end test for the OLX phone-deal monitor.

Spins up a local aiohttp server that impersonates BOTH the OLX offers API and a
Discord webhook, points the monitor at it, and asserts the full pipeline works:

    fetch -> keyword filter -> profit calc -> SQLite de-dup -> Discord notify

No network access, secrets or real accounts are required, so this runs anywhere.

Run directly::

    python tests/test_e2e.py

or under pytest::

    pytest -q
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import aiohttp
from aiohttp import web

# Make the project root importable when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import ListingDatabase  # noqa: E402
from discord import DiscordNotifier  # noqa: E402
from main import AppConfig, DealMonitor, FeeConfig, Target  # noqa: E402
from olx import OlxClient  # noqa: E402


def _offer(offer_id: int, title: str, price, *, currency: str = "PLN") -> dict:
    """Build an OLX-API-shaped offer dict for the fake server."""
    params = []
    if price is not None:
        params.append(
            {
                "key": "price",
                "value": {"value": price, "currency": currency, "label": f"{price} zł"},
            }
        )
    return {
        "id": offer_id,
        "title": title,
        "url": f"https://www.olx.pl/oferta/{offer_id}",
        "created_time": "2026-07-19T10:00:00+02:00",
        "params": params,
        "location": {"city": {"name": "Warszawa"}, "region": {"name": "Mazowieckie"}},
        "photos": [{"link": "https://example.com/{width}x{height}/pic.jpg"}],
    }


# The catalogue the fake OLX returns for the iphone query.
FAKE_OFFERS = [
    _offer(1001, "iPhone 13 128GB idealny", 1200),      # deal: cheap, profitable
    _offer(1002, "iPhone 13 Pro Max", 4500),            # too expensive -> no notify
    _offer(1003, "Etui iPhone 13 silikon", 30),         # excluded keyword -> no notify
    _offer(1004, "iPhone 13 zamiana", None),            # no price -> no notify
]


class FakeServer:
    """Serves the fake OLX API and captures Discord webhook payloads."""

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
        port = sock.getsockname()[1]
        self.base_url = f"http://127.0.0.1:{port}"

    async def stop(self) -> None:
        if self._runner is not None:
            await self._runner.cleanup()

    async def _offers(self, request: web.Request) -> web.Response:
        query = request.query.get("query", "").lower()
        data = FAKE_OFFERS if "iphone" in query else []
        return web.json_response({"data": data})

    async def _webhook(self, request: web.Request) -> web.Response:
        self.webhook_payloads.append(await request.json())
        return web.Response(status=204)


def _build_config(server: FakeServer, *, prime: bool) -> AppConfig:
    return AppConfig(
        webhook_url=f"{server.base_url}/webhook",
        discord_username="Test Bot",
        olx_base_url=f"{server.base_url}/api/v1/offers/",
        olx_user_agent="test-agent",
        olx_region_id=None,
        olx_extra_params={},
        poll_interval_seconds=0.1,
        request_timeout_seconds=5.0,
        database_path=":memory:",
        default_min_expected_profit=100.0,
        fees=FeeConfig(flat=0.0, percentage=10.0),
        prime_on_start=prime,
        results_per_query=40,
        targets=[
            Target(
                name="iPhone 13",
                query="iphone 13",
                max_buy_price=1500.0,
                market_value=2000.0,
                keywords_any=["iphone 13"],
                keywords_exclude=["etui", "case"],
                min_expected_profit=100.0,
            )
        ],
    )


async def _run_cycles(monitor: DealMonitor, server: FakeServer, cycles: int) -> None:
    """Run ``cycles`` polling cycles against the fake server."""
    await monitor._db.connect()
    async with aiohttp.ClientSession() as session:
        olx = OlxClient(
            session,
            base_url=monitor._config.olx_base_url,
            user_agent=monitor._config.olx_user_agent,
            request_timeout=monitor._config.request_timeout_seconds,
        )
        notifier = DiscordNotifier(
            session,
            webhook_url=monitor._config.webhook_url,
            username=monitor._config.discord_username,
            rate_limit_seconds=0.0,
        )
        for _ in range(cycles):
            for target in monitor._config.targets:
                await monitor._poll_target(target, olx, notifier)
            if not monitor._primed and monitor._config.prime_on_start:
                monitor._primed = True
    await monitor._db.close()


async def test_notifies_only_good_deals_and_dedupes() -> None:
    """With priming off, exactly one webhook fires for the single good deal,
    and a second identical cycle sends nothing (de-dup)."""
    server = FakeServer()
    await server.start()
    try:
        config = _build_config(server, prime=False)
        monitor = DealMonitor(config)
        await _run_cycles(monitor, server, cycles=2)

        assert len(server.webhook_payloads) == 1, (
            f"expected exactly 1 webhook, got {len(server.webhook_payloads)}"
        )
        embed = server.webhook_payloads[0]["embeds"][0]
        assert "iPhone 13 128GB" in embed["title"], embed["title"]
        # profit = 2000 - 1200 - 0 - (2000 * 10%) = 600
        profit_field = next(f for f in embed["fields"] if f["name"] == "Est. profit")
        assert profit_field["value"].startswith("600.00"), profit_field
        print("PASS: notifies only good deals and de-dupes across cycles")
    finally:
        await server.stop()


async def test_priming_suppresses_first_cycle() -> None:
    """With priming on, the first cycle records but never notifies."""
    server = FakeServer()
    await server.start()
    try:
        config = _build_config(server, prime=True)
        monitor = DealMonitor(config)
        await _run_cycles(monitor, server, cycles=1)
        assert server.webhook_payloads == [], server.webhook_payloads
        print("PASS: priming suppresses notifications on the first cycle")
    finally:
        await server.stop()


async def test_profit_and_deal_logic_units() -> None:
    """Unit-level checks of the profit and deal-threshold helpers."""
    server = FakeServer()  # only needed to build a config object
    config = _build_config(server, prime=False)
    monitor = DealMonitor(config)
    target = config.targets[0]

    from olx import Listing

    cheap = Listing(id="1", title="iPhone 13", price=1200, currency="PLN", url="")
    pricey = Listing(id="2", title="iPhone 13", price=1900, currency="PLN", url="")

    assert monitor.expected_profit(cheap, target) == 600.0
    assert monitor.is_good_deal(cheap, target, 600.0) is True
    # 1900 > max_buy_price(1500) -> not a deal even if profit were positive
    assert monitor.is_good_deal(pricey, target, monitor.expected_profit(pricey, target)) is False
    print("PASS: profit calculation and deal thresholds")


async def _main() -> None:
    await test_profit_and_deal_logic_units()
    await test_notifies_only_good_deals_and_dedupes()
    await test_priming_suppresses_first_cycle()
    print("\nALL TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(_main())
