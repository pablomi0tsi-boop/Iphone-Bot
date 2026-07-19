"""Entry point for the OLX phone-deal monitor.

The monitor continuously polls OLX for newly listed phones (iPhone, Samsung and
Google Pixel by default), filters them against per-model rules loaded from
``config.json``, estimates the resale profit, de-duplicates against a local
SQLite database and pushes instant Discord webhook notifications for the deals
worth acting on.

Run it with::

    python main.py            # uses ./config.json
    python main.py my.json    # custom config path

Architecture (tuned for low detection latency + stability):

* Each search target runs its **own** independent polling loop, so a slow or
  failing target never delays the others.
* Each loop polls on a short base interval plus a small random **jitter**, and
  applies **exponential back-off** on errors to stay stable if OLX throttles.
* Detected deals are pushed onto an :class:`asyncio.Queue` and sent by a
  dedicated notifier worker, so Discord latency/rate-limits never slow down
  OLX polling (i.e. detection latency is decoupled from delivery latency).
* De-duplication is batched (one query + one commit per poll).
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import signal
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import aiohttp

from database import ListingDatabase
from discord import DiscordNotifier
from olx import Listing, OlxClient

logger = logging.getLogger("phonedealbot")

# Item pushed onto the notification queue.
DealItem = Tuple[Listing, float, float, str]  # (listing, profit, max_buy, target_name)


# --------------------------------------------------------------------------- #
# Configuration model
# --------------------------------------------------------------------------- #
@dataclass(slots=True)
class FeeConfig:
    """Selling fees used when estimating profit."""

    flat: float = 0.0
    percentage: float = 0.0  # percent of the resale/market value, e.g. 10 == 10%


@dataclass(slots=True)
class Target:
    """A single search target loaded from ``config.json``.

    A target maps a search query to the economic rules used to decide whether a
    matching listing is a good deal.
    """

    name: str
    query: str
    max_buy_price: float
    market_value: float
    keywords_any: List[str] = field(default_factory=list)
    keywords_exclude: List[str] = field(default_factory=list)
    min_expected_profit: Optional[float] = None
    min_price: Optional[float] = None

    def matches_title(self, title: str) -> bool:
        """Return ``True`` if ``title`` passes the include/exclude keyword rules.

        - If ``keywords_any`` is set, at least one must appear in the title.
        - If any ``keywords_exclude`` term appears, the listing is rejected
          (filters out cases, chargers, cracked screens, etc.).
        """
        lowered = title.lower()
        if self.keywords_any and not any(k.lower() in lowered for k in self.keywords_any):
            return False
        if any(k.lower() in lowered for k in self.keywords_exclude):
            return False
        return True


@dataclass(slots=True)
class AppConfig:
    """Fully parsed application configuration."""

    webhook_url: str
    discord_username: str
    discord_rate_limit_seconds: float
    olx_base_url: str
    olx_user_agent: str
    olx_region_id: Optional[int]
    olx_sort_by: Optional[str]
    olx_include_promoted: bool
    olx_extra_params: Dict[str, Any]
    poll_interval_seconds: float
    jitter_seconds: float
    max_backoff_seconds: float
    request_timeout_seconds: float
    results_per_query: int
    pages_per_poll: int
    database_path: str
    default_min_expected_profit: float
    default_min_listing_price: float
    fees: FeeConfig
    prime_on_start: bool
    targets: List[Target]


def load_config(path: str | Path) -> AppConfig:
    """Load and validate ``config.json`` into an :class:`AppConfig`.

    :raises FileNotFoundError: if the config file does not exist.
    :raises ValueError: if required fields are missing or malformed.
    """
    config_path = Path(path)
    if not config_path.is_file():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)

    olx = raw.get("olx", {})
    discord_cfg = raw.get("discord", {})
    db_cfg = raw.get("database", {})
    fees_cfg = raw.get("fees", {})

    raw_targets = raw.get("targets", [])
    if not raw_targets:
        raise ValueError("config.json must define at least one entry in 'targets'")

    targets: List[Target] = []
    for entry in raw_targets:
        try:
            targets.append(
                Target(
                    name=entry["name"],
                    query=entry["query"],
                    max_buy_price=float(entry["max_buy_price"]),
                    market_value=float(entry["market_value"]),
                    keywords_any=list(entry.get("keywords_any", [])),
                    keywords_exclude=list(entry.get("keywords_exclude", [])),
                    min_expected_profit=(
                        float(entry["min_expected_profit"])
                        if "min_expected_profit" in entry
                        else None
                    ),
                    min_price=(
                        float(entry["min_price"]) if "min_price" in entry else None
                    ),
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Invalid target entry {entry!r}: {exc}") from exc

    return AppConfig(
        webhook_url=discord_cfg.get("webhook_url", ""),
        discord_username=discord_cfg.get("username", "Phone Deal Bot"),
        discord_rate_limit_seconds=float(discord_cfg.get("rate_limit_seconds", 0.5)),
        olx_base_url=olx.get("base_url", "https://www.olx.pl/api/v1/offers/"),
        olx_user_agent=olx.get(
            "user_agent", "Mozilla/5.0 (compatible; PhoneDealBot/1.0)"
        ),
        olx_region_id=olx.get("region_id"),
        olx_sort_by=(olx.get("sort_by") or None),
        olx_include_promoted=bool(olx.get("include_promoted", False)),
        olx_extra_params=dict(olx.get("extra_params", {})),
        poll_interval_seconds=float(olx.get("poll_interval_seconds", 10)),
        jitter_seconds=float(olx.get("jitter_seconds", 2)),
        max_backoff_seconds=float(olx.get("max_backoff_seconds", 300)),
        request_timeout_seconds=float(olx.get("request_timeout_seconds", 15)),
        results_per_query=int(olx.get("results_per_query", 40)),
        pages_per_poll=max(1, int(olx.get("pages_per_poll", 1))),
        database_path=db_cfg.get("path", "listings.db"),
        default_min_expected_profit=float(raw.get("min_expected_profit", 0)),
        default_min_listing_price=float(raw.get("min_listing_price", 0)),
        fees=FeeConfig(
            flat=float(fees_cfg.get("flat", 0)),
            percentage=float(fees_cfg.get("percentage", 0)),
        ),
        prime_on_start=bool(raw.get("prime_on_start", True)),
        targets=targets,
    )


# --------------------------------------------------------------------------- #
# Monitor
# --------------------------------------------------------------------------- #
class DealMonitor:
    """Coordinates OLX polling, filtering, de-duplication and notifications."""

    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._db = ListingDatabase(config.database_path)
        self._stop_event = asyncio.Event()
        self._queue: asyncio.Queue[DealItem] = asyncio.Queue()

    def request_stop(self) -> None:
        """Signal every polling loop to finish promptly and exit."""
        logger.info("Shutdown requested; stopping...")
        self._stop_event.set()

    # -- economics ---------------------------------------------------------- #
    def expected_profit(self, listing: Listing, target: Target) -> Optional[float]:
        """Estimate resale profit for ``listing`` under ``target``'s economics.

        ``profit = market_value - price - flat_fee - market_value * pct_fee``

        Returns ``None`` when the listing has no numeric price (can't evaluate).
        """
        if listing.price is None:
            return None
        fees = self._config.fees
        percentage_fee = target.market_value * (fees.percentage / 100.0)
        return target.market_value - listing.price - fees.flat - percentage_fee

    def is_good_deal(
        self, listing: Listing, target: Target, profit: Optional[float]
    ) -> bool:
        """Return ``True`` when a listing meets the buy/profit thresholds."""
        if listing.price is None or profit is None:
            return False
        # Guard against "swap"/parts listings priced at 0 (or suspiciously low),
        # which would otherwise look like enormous fake profits.
        min_price = (
            target.min_price
            if target.min_price is not None
            else self._config.default_min_listing_price
        )
        if listing.price < min_price:
            return False
        if listing.price > target.max_buy_price:
            return False
        threshold = (
            target.min_expected_profit
            if target.min_expected_profit is not None
            else self._config.default_min_expected_profit
        )
        return profit >= threshold

    # -- lifecycle ---------------------------------------------------------- #
    async def run(self) -> None:
        """Run the monitor until a stop is requested."""
        await self._db.connect()

        # Only prime (silently record the back-catalogue) on a genuinely fresh
        # database. On restart the DB already has history, so newly-appeared
        # listings should notify immediately rather than being suppressed.
        existing = await self._db.count()
        start_primed = existing > 0 or not self._config.prime_on_start

        # Connection tuning: reuse sockets and cache DNS to shave per-request
        # latency across the many polls this app makes.
        connector = aiohttp.TCPConnector(
            limit=20,
            limit_per_host=10,
            ttl_dns_cache=300,
            keepalive_timeout=30,
            enable_cleanup_closed=True,
        )
        async with aiohttp.ClientSession(connector=connector) as session:
            olx_client = OlxClient(
                session,
                base_url=self._config.olx_base_url,
                user_agent=self._config.olx_user_agent,
                request_timeout=self._config.request_timeout_seconds,
                region_id=self._config.olx_region_id,
                sort_by=self._config.olx_sort_by,
                include_promoted=self._config.olx_include_promoted,
                extra_params=self._config.olx_extra_params,
            )
            notifier = DiscordNotifier(
                session,
                webhook_url=self._config.webhook_url,
                username=self._config.discord_username,
                rate_limit_seconds=self._config.discord_rate_limit_seconds,
            )
            if not notifier.enabled:
                logger.warning(
                    "No Discord webhook configured - running in dry-run mode "
                    "(deals will be logged, not sent)."
                )

            logger.info(
                "Monitoring %d target(s) on %s | base interval %.0fs (+<=%.0fs jitter)"
                "%s",
                len(self._config.targets),
                self._config.olx_base_url,
                self._config.poll_interval_seconds,
                self._config.jitter_seconds,
                "" if start_primed else " | priming first cycle",
            )

            worker = asyncio.create_task(self._notifier_worker(notifier))
            loops = [
                asyncio.create_task(
                    self._run_target_loop(target, olx_client, primed=start_primed)
                )
                for target in self._config.targets
            ]
            try:
                await self._stop_event.wait()
            finally:
                for task in loops:
                    task.cancel()
                await asyncio.gather(*loops, return_exceptions=True)
                # Let any queued notifications drain before shutting the worker.
                await self._queue.join()
                worker.cancel()
                await asyncio.gather(worker, return_exceptions=True)
                await self._db.close()

    async def _run_target_loop(
        self, target: Target, olx_client: OlxClient, *, primed: bool
    ) -> None:
        """Independently poll a single target forever with jitter + back-off."""
        base = self._config.poll_interval_seconds
        backoff = 0.0
        local_primed = primed

        while not self._stop_event.is_set():
            try:
                listings = await olx_client.search(
                    target.query,
                    limit=self._config.results_per_query,
                    pages=self._config.pages_per_poll,
                )
                await self._process_listings(
                    target, listings, priming=not local_primed
                )
                if not local_primed:
                    local_primed = True
                    logger.info(
                        "[%s] priming complete; new listings will now notify",
                        target.name,
                    )
                backoff = 0.0
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                backoff = min(
                    base if backoff == 0 else backoff * 2,
                    self._config.max_backoff_seconds,
                )
                logger.warning(
                    "[%s] poll failed: %s (backing off %.0fs)",
                    target.name,
                    exc,
                    backoff,
                )

            delay = (backoff if backoff else base) + random.uniform(
                0, self._config.jitter_seconds
            )
            await self._sleep_or_stop(delay)

    async def _process_listings(
        self, target: Target, listings: List[Listing], *, priming: bool
    ) -> None:
        """Filter, cost and enqueue new listings for a single poll result.

        De-duplication is done in one batch query; all newly seen listings are
        persisted in one commit; qualifying deals are queued (best profit first)
        for the notifier worker to deliver.
        """
        if not listings:
            return

        ids = [listing.id for listing in listings]
        already_seen = await self._db.seen_subset(ids)
        new_listings = [listing for listing in listings if listing.id not in already_seen]
        if not new_listings:
            return

        records = []
        deals: List[Tuple[Listing, float]] = []
        for listing in new_listings:
            notified = False
            if target.matches_title(listing.title):
                profit = self.expected_profit(listing, target)
                if not priming and self.is_good_deal(listing, target, profit):
                    assert profit is not None
                    deals.append((listing, profit))
                    notified = True
            records.append(
                (
                    listing.id,
                    listing.source,
                    listing.title,
                    listing.price,
                    listing.url,
                    notified,
                )
            )

        # Persist first so a crash can't cause the same deal to be re-notified.
        await self._db.mark_seen_many(records)

        # Deliver the most profitable deals first for lowest time-to-alert.
        deals.sort(key=lambda item: item[1], reverse=True)
        for listing, profit in deals:
            await self._queue.put((listing, profit, target.max_buy_price, target.name))

        logger.info(
            "[%s] %d new listing(s), %d deal(s)%s",
            target.name,
            len(new_listings),
            len(deals),
            " (priming - not notified)" if priming else "",
        )

    async def _notifier_worker(self, notifier: DiscordNotifier) -> None:
        """Drain the deal queue and deliver notifications, one at a time."""
        while True:
            listing, profit, max_buy, target_name = await self._queue.get()
            try:
                sent = await notifier.send_deal(
                    listing, expected_profit=profit, max_buy_price=max_buy
                )
                if sent:
                    logger.info(
                        "DEAL [%s] %s | price=%s | profit=%.2f | %s",
                        target_name,
                        listing.title,
                        listing.price,
                        profit,
                        listing.url,
                    )
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - never let one send kill worker
                logger.warning("Notification delivery failed: %s", exc)
            finally:
                self._queue.task_done()

    async def _sleep_or_stop(self, seconds: float) -> None:
        """Sleep for ``seconds`` unless a stop is requested first."""
        try:
            await asyncio.wait_for(self._stop_event.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            pass


def _configure_logging() -> None:
    """Configure root logging with a concise, timestamped format."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


async def _amain(config_path: str) -> None:
    """Async entry point: build the monitor and wire up signal handlers."""
    config = load_config(config_path)
    monitor = DealMonitor(config)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, monitor.request_stop)
        except NotImplementedError:  # pragma: no cover - e.g. on Windows
            pass

    await monitor.run()


def main() -> None:
    """Synchronous wrapper suitable for ``python main.py``."""
    _configure_logging()
    config_path = sys.argv[1] if len(sys.argv) > 1 else "config.json"
    try:
        asyncio.run(_amain(config_path))
    except KeyboardInterrupt:  # pragma: no cover - defensive
        pass
    except (FileNotFoundError, ValueError) as exc:
        logger.error("Configuration error: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
