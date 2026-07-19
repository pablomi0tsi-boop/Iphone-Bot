"""Entry point for the OLX phone-deal monitor.

The monitor continuously polls OLX for newly listed phones (iPhone, Samsung and
Google Pixel by default), filters them against per-model rules loaded from
``config.json``, estimates the resale profit, de-duplicates against a local
SQLite database and pushes instant Discord webhook notifications for the deals
worth acting on.

Run it with::

    python main.py            # uses ./config.json
    python main.py my.json    # custom config path

Everything is asyncio-based: all configured search targets are polled
concurrently every ``poll_interval_seconds``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiohttp

from database import ListingDatabase
from discord import DiscordNotifier
from olx import Listing, OlxClient

logger = logging.getLogger("phonedealbot")


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
    olx_base_url: str
    olx_user_agent: str
    olx_region_id: Optional[int]
    olx_extra_params: Dict[str, Any]
    poll_interval_seconds: float
    request_timeout_seconds: float
    database_path: str
    default_min_expected_profit: float
    fees: FeeConfig
    prime_on_start: bool
    results_per_query: int
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
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Invalid target entry {entry!r}: {exc}") from exc

    return AppConfig(
        webhook_url=discord_cfg.get("webhook_url", ""),
        discord_username=discord_cfg.get("username", "Phone Deal Bot"),
        olx_base_url=olx.get("base_url", "https://www.olx.pl/api/v1/offers/"),
        olx_user_agent=olx.get(
            "user_agent", "Mozilla/5.0 (compatible; PhoneDealBot/1.0)"
        ),
        olx_region_id=olx.get("region_id"),
        olx_extra_params=dict(olx.get("extra_params", {})),
        poll_interval_seconds=float(olx.get("poll_interval_seconds", 60)),
        request_timeout_seconds=float(olx.get("request_timeout_seconds", 20)),
        database_path=db_cfg.get("path", "listings.db"),
        default_min_expected_profit=float(raw.get("min_expected_profit", 0)),
        fees=FeeConfig(
            flat=float(fees_cfg.get("flat", 0)),
            percentage=float(fees_cfg.get("percentage", 0)),
        ),
        prime_on_start=bool(raw.get("prime_on_start", True)),
        results_per_query=int(olx.get("results_per_query", 40)),
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
        self._primed = False

    def request_stop(self) -> None:
        """Signal the polling loop to finish the current cycle and exit."""
        logger.info("Shutdown requested; stopping after current cycle...")
        self._stop_event.set()

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
        if listing.price > target.max_buy_price:
            return False
        threshold = (
            target.min_expected_profit
            if target.min_expected_profit is not None
            else self._config.default_min_expected_profit
        )
        return profit >= threshold

    async def run(self) -> None:
        """Run the monitor until stop is requested."""
        await self._db.connect()
        connector = aiohttp.TCPConnector(limit=10)
        async with aiohttp.ClientSession(connector=connector) as session:
            olx_client = OlxClient(
                session,
                base_url=self._config.olx_base_url,
                user_agent=self._config.olx_user_agent,
                request_timeout=self._config.request_timeout_seconds,
                region_id=self._config.olx_region_id,
                extra_params=self._config.olx_extra_params,
            )
            notifier = DiscordNotifier(
                session,
                webhook_url=self._config.webhook_url,
                username=self._config.discord_username,
            )
            if not notifier.enabled:
                logger.warning(
                    "No Discord webhook configured - running in dry-run mode "
                    "(deals will be logged, not sent)."
                )

            logger.info(
                "Monitoring %d target(s) on %s every %.0fs",
                len(self._config.targets),
                self._config.olx_base_url,
                self._config.poll_interval_seconds,
            )
            try:
                await self._poll_forever(olx_client, notifier)
            finally:
                await self._db.close()

    async def _poll_forever(
        self, olx_client: OlxClient, notifier: DiscordNotifier
    ) -> None:
        """Poll every target concurrently on a fixed interval until stopped."""
        while not self._stop_event.is_set():
            results = await asyncio.gather(
                *(
                    self._poll_target(target, olx_client, notifier)
                    for target in self._config.targets
                ),
                return_exceptions=True,
            )
            for target, result in zip(self._config.targets, results):
                if isinstance(result, Exception):
                    logger.error("Target %r failed: %s", target.name, result)

            # First cycle only records existing listings so we don't spam
            # notifications for the entire back-catalogue on start-up.
            if not self._primed and self._config.prime_on_start:
                self._primed = True
                logger.info("Priming complete; future new listings will notify.")

            await self._sleep_or_stop(self._config.poll_interval_seconds)

    async def _poll_target(
        self, target: Target, olx_client: OlxClient, notifier: DiscordNotifier
    ) -> None:
        """Fetch, filter and act on new listings for a single target."""
        listings = await olx_client.search(
            target.query, limit=self._config.results_per_query
        )
        priming = self._config.prime_on_start and not self._primed
        new_count = 0
        deal_count = 0

        for listing in listings:
            if await self._db.is_seen(listing.id):
                continue
            new_count += 1

            if not target.matches_title(listing.title):
                # Record so we don't re-evaluate it every cycle.
                await self._db.mark_seen(
                    listing.id,
                    source=listing.source,
                    title=listing.title,
                    price=listing.price,
                    url=listing.url,
                    notified=False,
                )
                continue

            profit = self.expected_profit(listing, target)
            good = self.is_good_deal(listing, target, profit)
            should_notify = good and not priming

            if should_notify:
                assert profit is not None
                sent = await notifier.send_deal(
                    listing,
                    expected_profit=profit,
                    max_buy_price=target.max_buy_price,
                )
                if sent:
                    deal_count += 1
                    logger.info(
                        "DEAL [%s] %s | price=%s | profit=%.2f | %s",
                        target.name,
                        listing.title,
                        listing.price,
                        profit,
                        listing.url,
                    )

            await self._db.mark_seen(
                listing.id,
                source=listing.source,
                title=listing.title,
                price=listing.price,
                url=listing.url,
                notified=should_notify,
            )

        if new_count:
            logger.info(
                "[%s] %d new listing(s), %d deal(s)%s",
                target.name,
                new_count,
                deal_count,
                " (priming - not notified)" if priming else "",
            )

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
