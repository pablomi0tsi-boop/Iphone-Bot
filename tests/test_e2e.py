"""End-to-end test for the OLX iPhone resale-deal monitor.

Spins up a local aiohttp server that impersonates BOTH the OLX website search
page (``__PRERENDERED_STATE__``) and a Discord webhook, points the monitor at
it, and asserts the full pipeline works:

    fetch website SSR -> drop promoted -> blacklist -> parse model/storage
          -> resale lookup -> profit -> SQLite batch de-dup -> Discord notify

No network access, secrets or real accounts are required, so this runs anywhere.

Run directly::

    python tests/test_e2e.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import aiohttp
from aiohttp import web

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from discord import DiscordNotifier  # noqa: E402
from main import AppConfig, DealMonitor  # noqa: E402
from olx import OlxClient  # noqa: E402
from pricing import PriceBook  # noqa: E402


class _LogCapture(logging.Handler):
    """Collect log records for assertion."""

    def __init__(self) -> None:
        super().__init__(level=logging.INFO)
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())


def _fresh_created_time() -> str:
    """ISO timestamp within the 2-minute freshness window."""
    return datetime.now(timezone.utc).isoformat()


def _stale_created_time() -> str:
    """ISO timestamp older than the 2-minute freshness window."""
    return (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()


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
    created_time: str | None = None,
    promoted: bool = False,
) -> dict:
    """Build a website-SSR-shaped ad dict for the fake server."""
    params = []
    if model_label is not None:
        params.append(
            {
                "key": "phonemodel",
                "name": "Model telefonu",
                "type": "select",
                "value": model_label,
                "normalizedValue": model_label.lower().replace(" ", "-"),
            }
        )
    if storage_label is not None:
        params.append(
            {
                "key": "builtinmemory_phones",
                "name": "Pamięć wbudowana",
                "type": "select",
                "value": storage_label,
                "normalizedValue": storage_label.lower(),
            }
        )
    created = created_time or _fresh_created_time()
    price_obj = None
    if price is not None:
        price_obj = {
            "budget": False,
            "free": False,
            "exchange": False,
            "displayValue": f"{price} zł",
            "regularPrice": {
                "value": price,
                "currencyCode": currency,
                "currencySymbol": "zł",
                "negotiable": False,
            },
        }
    return {
        "id": offer_id,
        "title": title,
        "description": description,
        "url": f"https://www.olx.pl/d/oferta/test-CID99-ID{offer_id}.html",
        "createdTime": created,
        "lastRefreshTime": created,
        "params": params,
        "isBusiness": business,
        "isPromoted": promoted,
        "searchReason": "promoted" if promoted else "organic",
        "user": {"name": seller} if seller else None,
        "location": {
            "cityName": "Warszawa",
            "regionName": "Mazowieckie",
            "pathName": "Mazowieckie, Warszawa",
        },
        "price": price_obj,
        "photos": [
            f"https://example.com/pic-{offer_id}-{i}.jpg"
            for i in range(photos)
        ],
    }


def _render_search_html(ads: list[dict]) -> str:
    """Embed ``ads`` in a minimal ``__PRERENDERED_STATE__`` HTML page."""
    state = {
        "listing": {
            "listing": {
                "ads": ads,
                "pageNumber": 0,
                "categoryId": 1839,
                "requestParams": {
                    "categoryPath": (
                        "elektronika/telefony/smartfony-telefony-komorkowe"
                    ),
                    "query": "iphone",
                    "params": {"search[order]": "created_at:desc"},
                },
                "params": {
                    "query": "iphone",
                    "category_id": 1839,
                    "sort_by": "created_at:desc",
                },
            }
        }
    }
    encoded = json.dumps(json.dumps(state, ensure_ascii=False))
    return (
        "<!doctype html><html><head><title>OLX</title></head><body>"
        f"<script>window.__PRERENDERED_STATE__ = {encoded};</script>"
        "</body></html>"
    )


# Promoted look-alike deal must be ignored despite looking like a deal.
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
           model_label="iPhone 13", storage_label="128GB", promoted=True),
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
    # otherwise a deal, but published > 2 minutes ago -> ignore
    _offer(2013, "iPhone 13 128GB świeży ale stary timestamp", 400,
           model_label="iPhone 13", storage_label="128GB", photos=3,
           created_time=_stale_created_time()),
]


class FakeServer:
    def __init__(self) -> None:
        self.webhook_payloads: list[dict] = []
        self.offers: list[dict] = list(FAKE_OFFERS)
        self.last_offer_params: dict | None = None
        self.last_request_path: str = ""
        self._runner: web.AppRunner | None = None
        self.base_url = ""

    async def start(self) -> None:
        app = web.Application()
        app.router.add_get(
            "/elektronika/telefony/smartfony-telefony-komorkowe/q-{slug}/",
            self._search,
        )
        app.router.add_get("/elektronika/telefony/q-{slug}/", self._search)
        app.router.add_get("/q-{slug}/", self._search)
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

    async def _search(self, request: web.Request) -> web.Response:
        self.last_offer_params = dict(request.query)
        self.last_request_path = request.path
        slug = request.match_info.get("slug", "").lower()
        page = int(request.query.get("page", "1"))
        if "iphone" not in slug or page > 1:
            return web.Response(
                text=_render_search_html([]),
                content_type="text/html",
            )
        return web.Response(
            text=_render_search_html(self.offers),
            content_type="text/html",
        )

    async def _webhook(self, request: web.Request) -> web.Response:
        self.webhook_payloads.append(await request.json())
        return web.Response(status=204)


def _build_config(server: FakeServer, *, prime: bool) -> AppConfig:
    return AppConfig(
        webhook_url=f"{server.base_url}/webhook",
        discord_username="Test Bot",
        discord_rate_limit_seconds=0.0,
        olx_base_url=f"{server.base_url}/",
        olx_user_agent="test-agent",
        olx_region_id=None,
        olx_sort_by="created_at:desc",
        olx_include_promoted=False,
        olx_extra_params={},
        olx_search_path_prefix=(
            "elektronika/telefony/smartfony-telefony-komorkowe"
        ),
        olx_category_id=1839,
        olx_category_name="Smartfony i telefony komórkowe",
        poll_interval_seconds=0.1,
        jitter_seconds=0.0,
        max_backoff_seconds=1.0,
        request_timeout_seconds=5.0,
        results_per_query=40,
        pages_per_poll=1,
        prime_pages_per_query=1,
        search_queries=["iphone"],
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
        debug_notify_all=False,
        max_listing_age_seconds=120.0,
    )


async def _run_cycles(
    monitor: DealMonitor,
    cycles: int,
    *,
    priming_first_cycle: bool,
    between_cycles=None,
) -> None:
    await monitor._db.connect()
    async with aiohttp.ClientSession() as session:
        olx = OlxClient(
            session,
            base_url=monitor._config.olx_base_url,
            sort_by=monitor._config.olx_sort_by,
            search_path_prefix=monitor._config.olx_search_path_prefix,
            category_id=monitor._config.olx_category_id,
            category_name=monitor._config.olx_category_name,
        )
        notifier = DiscordNotifier(
            session,
            webhook_url=monitor._config.webhook_url,
            username=monitor._config.discord_username,
            rate_limit_seconds=0.0,
        )
        worker = asyncio.create_task(monitor._notifier_worker(notifier))
        try:
            for cycle in range(cycles):
                if between_cycles is not None and cycle > 0:
                    await between_cycles(cycle)
                priming = priming_first_cycle and cycle == 0
                for query in monitor._config.search_queries:
                    pages = (
                        monitor._config.prime_pages_per_query
                        if priming
                        else monitor._config.pages_per_poll
                    )
                    listings = await olx.search(query, pages=pages)
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
            olx = OlxClient(
                session,
                base_url=f"{server.base_url}/",
                search_path_prefix=(
                    "elektronika/telefony/smartfony-telefony-komorkowe"
                ),
                category_id=1839,
            )
            listings = await olx.search("iphone")
        by_id = {listing.id: listing for listing in listings}
        # Promoted 2006 filtered by the client already.
        assert "2006" not in by_id, "promoted listing should be filtered by client"

        log_capture = _LogCapture()
        main_logger = logging.getLogger("phonedealbot")
        main_logger.addHandler(log_capture)
        previous_level = main_logger.level
        main_logger.setLevel(logging.INFO)
        try:
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
            assert monitor.evaluate(by_id["2013"]) is None           # too old
        finally:
            main_logger.removeHandler(log_capture)
            main_logger.setLevel(previous_level)

        expected_reasons = {
            "2002": "profit below threshold",
            "2003": "blacklist keyword: 'icloud'",
            "2004": "unsupported storage",
            "2005": "unknown model",
            "2007": "blacklist keyword: 'zamiana'",
            "2008": "price <= 0",
            "2009": "no photos",
            "2010": "business seller",
            "2011": "accessory filter",
            "2012": "profit below threshold",
            "2013": "listing older than 120s",
        }
        expected_decisions = {
            "2001": "SENT",
            "2002": "REJECT_PROFIT",
            "2003": "REJECT_OTHER",  # blacklist
            "2004": "REJECT_MODEL",
            "2005": "REJECT_MODEL",
            "2007": "REJECT_OTHER",  # blacklist swap
            "2008": "REJECT_PRICE",
            "2009": "REJECT_OTHER",  # no photos
            "2010": "REJECT_OTHER",  # business
            "2011": "REJECT_ACCESSORY",
            "2012": "REJECT_PROFIT",
            "2013": "REJECT_OTHER",  # age
        }
        for listing_id, reason_fragment in expected_reasons.items():
            listing = by_id[listing_id]
            match = next(
                (
                    msg
                    for msg in log_capture.messages
                    if (
                        f"id={listing.id}" in msg
                        and f"title={listing.title!r}" in msg
                        and f"price={listing.price}" in msg
                        and "Rejected listing" in msg
                        and reason_fragment in msg
                    )
                ),
                None,
            )
            assert match is not None, (
                f"missing rejection log for {listing_id} "
                f"(expected reason containing {reason_fragment!r}): "
                f"{log_capture.messages}"
            )
            assert "model=" in match and "storage=" in match
            assert "resale=" in match and "profit=" in match

        for listing_id, decision in expected_decisions.items():
            listing = by_id[listing_id]
            match = next(
                (
                    msg
                    for msg in log_capture.messages
                    if (
                        "Listing decision |" in msg
                        and f"decision={decision}" in msg
                        and f"id={listing.id}" in msg
                        and f"title={listing.title!r}" in msg
                        and f"price={listing.price}" in msg
                        and "model=" in msg
                        and "storage=" in msg
                        and "profit=" in msg
                        and "reason=" in msg
                    )
                ),
                None,
            )
            assert match is not None, (
                f"missing Listing decision for {listing_id} "
                f"(expected decision={decision}): {log_capture.messages}"
            )

        # Freshness debug log must include both datetime objects + UTC forms.
        age_logs = [
            msg for msg in log_capture.messages if msg.startswith("Listing timestamp |")
        ]
        assert len(age_logs) >= len(expected_reasons), age_logs
        for msg in age_logs:
            assert "published=" in msg and "now=" in msg, msg
            assert "offset=" in msg, msg
            if "age_seconds=None" not in msg:
                assert "published_utc=" in msg and "now_utc=" in msg, msg

        print(
            "PASS: blacklist / no-storage / unknown-model / swap / zero-price / "
            "no-photos / business / accessory / below-min-profit / stale-age ignored "
            "(with rejection + Listing decision logs)"
        )
    finally:
        await server.stop()


async def test_priming_suppresses_first_cycle() -> None:
    server = FakeServer()
    await server.start()
    try:
        monitor = DealMonitor(_build_config(server, prime=True))
        log_capture = _LogCapture()
        main_logger = logging.getLogger("phonedealbot")
        main_logger.addHandler(log_capture)
        previous_level = main_logger.level
        main_logger.setLevel(logging.INFO)
        try:
            # Cycle 0 primes; cycle 1 sees the same catalogue — still no notify.
            await _run_cycles(monitor, cycles=2, priming_first_cycle=True)
        finally:
            main_logger.removeHandler(log_capture)
            main_logger.setLevel(previous_level)

        assert server.webhook_payloads == [], server.webhook_payloads
        assert server.last_offer_params is not None
        assert server.last_offer_params.get("search[order]") == "created_at:desc"
        assert (
            "/elektronika/telefony/smartfony-telefony-komorkowe/q-iphone/"
            in server.last_request_path
        )
        assert any("0 unseen listings" in msg for msg in log_capture.messages), (
            log_capture.messages
        )
        assert any(
            "decided_at=_process_listings:all_ids_already_in_sqlite" in msg
            for msg in log_capture.messages
        ), log_capture.messages
        assert any(
            "first10_id DB check (pre-insert)" in msg for msg in log_capture.messages
        ), log_capture.messages
        assert any(
            "unseen_computed_before_insert=True" in msg for msg in log_capture.messages
        ), log_capture.messages
        print("PASS: priming suppresses notifications on first + later cycles")
    finally:
        await server.stop()


async def test_only_post_prime_new_listings_notify() -> None:
    """After priming, only a listing that appears in a later poll notifies."""
    server = FakeServer()
    await server.start()
    try:
        monitor = DealMonitor(_build_config(server, prime=True))
        log_capture = _LogCapture()
        main_logger = logging.getLogger("phonedealbot")
        main_logger.addHandler(log_capture)
        previous_level = main_logger.level
        main_logger.setLevel(logging.INFO)

        async def _inject_new(_cycle: int) -> None:
            server.offers = list(server.offers) + [
                _offer(
                    2099,
                    "iPhone 13 128GB brand new after prime",
                    1000,
                    model_label="iPhone 13",
                    storage_label="128GB",
                    photos=3,
                    seller="Anna",
                )
            ]

        try:
            await _run_cycles(
                monitor,
                cycles=2,
                priming_first_cycle=True,
                between_cycles=_inject_new,
            )
        finally:
            main_logger.removeHandler(log_capture)
            main_logger.setLevel(previous_level)

        assert len(server.webhook_payloads) == 1, server.webhook_payloads
        embed = server.webhook_payloads[0]["embeds"][0]
        assert "brand new after prime" in (embed.get("description") or "")
        pre = [
            msg
            for msg in log_capture.messages
            if "Unseen listing (pre-filter)" in msg and "id=2099" in msg
        ]
        assert pre, log_capture.messages
        assert "title=" in pre[0] and "created_at=" in pre[0] and "price=" in pre[0]
        post = [
            msg
            for msg in log_capture.messages
            if msg.startswith("Unseen listing |")
            and "id=2099" in msg
            and "inserted=True" in msg
        ]
        assert post, log_capture.messages
        print("PASS: only listings first seen after priming notify")
    finally:
        await server.stop()


async def _main() -> None:
    await test_blacklist_and_unknowns_are_ignored()
    await test_full_matching_pipeline()
    await test_priming_suppresses_first_cycle()
    await test_only_post_prime_new_listings_notify()
    print("\nALL TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(_main())
