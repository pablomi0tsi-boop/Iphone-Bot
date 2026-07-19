"""Entry point for the OLX iPhone resale-deal monitor.

The monitor continuously polls OLX for iPhone listings, parses each listing's
model and storage capacity (from OLX's structured attributes and/or the title and
description), matches it against the user's expected **resale price list** in
``config.json``, and pushes an instant Discord webhook notification whenever::

    profit = resale_price - listing_price

is at least ``minimum_profit`` (default: 300 PLN).

Listings are ignored when they contain a blacklisted/accessory keyword, have no
price or a price of ``0``, have no photos, come from a business seller, or when
the model/storage cannot be determined confidently (or has no configured resale
price).

Run it with::

    python main.py            # uses ./config.json
    python main.py my.json    # custom config path

Architecture (tuned for low detection latency + stability):

* Each search query runs its **own** independent polling loop with jitter and
  exponential back-off, so a slow/failing query never blocks the others.
* Detected deals are delivered by a dedicated notifier worker via an
  :class:`asyncio.Queue`, decoupling detection latency from Discord latency.
* De-duplication is batched (one query + one commit per poll).
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import signal
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import aiohttp

from database import ListingDatabase
from discord import DiscordNotifier
from olx import (
    Listing,
    OlxClient,
    DEFAULT_SMARTPHONES_CATEGORY_ID,
    DEFAULT_SMARTPHONES_CATEGORY_NAME,
    DEFAULT_SMARTPHONES_CATEGORY_PATH,
)
from pricing import PriceBook, detect_phone

logger = logging.getLogger("phonedealbot")

# Item pushed onto the notification queue:
#   (listing, model, storage_gb, resale_price, profit, query)
# model / storage / resale / profit may be None in debug_notify_all mode.
DealItem = Tuple[
    Listing, Optional[str], Optional[int], Optional[float], Optional[float], str
]

# Default: only notify listings published within the last 2 minutes.
DEFAULT_MAX_LISTING_AGE_SECONDS = 120.0


def parse_listing_published_at(raw: Optional[str]) -> Optional[datetime]:
    """Parse an OLX ``created_time`` string into an aware :class:`datetime`.

    OLX returns ISO-8601 values such as ``2026-07-19T13:01:35+02:00``. Returns
    ``None`` when ``raw`` is missing or unparseable. The returned datetime
    always carries an explicit ``tzinfo`` (UTC assumed only if the input had
    no offset).
    """
    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        # OLX normally includes an offset; treat bare timestamps as UTC.
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def listing_age_seconds(published: datetime, now: datetime) -> float:
    """Return how many seconds ``published`` is before ``now``.

    Both arguments must be timezone-aware. Each is converted to UTC **before**
    subtraction so a Warsaw ``+02:00`` publication time is never compared as if
    it were a UTC wall clock (which would skew age by ~2 hours in summer).
    """
    if published.tzinfo is None or now.tzinfo is None:
        raise ValueError(
            "listing_age_seconds requires timezone-aware datetimes "
            f"(published.tzinfo={published.tzinfo!r}, now.tzinfo={now.tzinfo!r})"
        )
    published_utc = published.astimezone(timezone.utc)
    now_utc = now.astimezone(timezone.utc)
    return (now_utc - published_utc).total_seconds()


# --------------------------------------------------------------------------- #
# Configuration model
# --------------------------------------------------------------------------- #
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
    olx_search_path_prefix: str
    olx_category_id: int
    olx_category_name: str
    poll_interval_seconds: float
    jitter_seconds: float
    max_backoff_seconds: float
    request_timeout_seconds: float
    results_per_query: int
    pages_per_poll: int
    prime_pages_per_query: int
    search_queries: List[str]
    database_path: str
    minimum_profit: float
    stats_interval_seconds: float
    blacklist_keywords: List[str]
    accessory_keywords: List[str]
    prime_on_start: bool
    price_book: PriceBook
    # TEMPORARY DEBUG: when True, skip all deal filters and notify on every
    # new listing (model/storage/profit included when detectable).
    debug_notify_all: bool = False
    # Reject listings whose OLX created_time is older than this many seconds.
    max_listing_age_seconds: float = DEFAULT_MAX_LISTING_AGE_SECONDS


@dataclass
class Stats:
    """Rolling counters logged periodically for operational visibility."""

    listings_checked: int = 0
    deals_found: int = 0
    notifications_sent: int = 0
    total_profit: float = 0.0

    @property
    def average_profit(self) -> float:
        """Mean expected profit across deals found (0 when none)."""
        return self.total_profit / self.deals_found if self.deals_found else 0.0


def load_config(path: str | Path) -> AppConfig:
    """Load and validate ``config.json`` into an :class:`AppConfig`.

    :raises FileNotFoundError: if the config file does not exist.
    :raises ValueError: if required fields are missing or malformed.
    """
    config_path = Path(path)
    if not config_path.is_file():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    try:
        with config_path.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)
    except json.JSONDecodeError as exc:
        raise ValueError(f"config.json is not valid JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise ValueError("config.json must contain a JSON object at the top level")

    def _number(container: Dict[str, Any], key: str, default: float, *,
                minimum: Optional[float] = None,
                allow_zero: bool = True) -> float:
        """Parse a numeric config value with a clear, field-specific error."""
        try:
            value = float(container.get(key, default))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"'{key}' must be a number (got {container.get(key)!r})") from exc
        if minimum is not None and value < minimum:
            raise ValueError(f"'{key}' must be >= {minimum} (got {value})")
        if not allow_zero and value == 0:
            raise ValueError(f"'{key}' must not be 0")
        return value

    olx = raw.get("olx", {})
    discord_cfg = raw.get("discord", {})
    db_cfg = raw.get("database", {})

    resale_prices = raw.get("resale_prices")
    if not isinstance(resale_prices, dict) or not resale_prices:
        raise ValueError(
            "config.json must define a non-empty 'resale_prices' object"
        )
    try:
        price_book = PriceBook(resale_prices)
    except ValueError as exc:
        raise ValueError(f"Invalid 'resale_prices': {exc}") from exc

    search_queries = [str(q) for q in olx.get("search_queries", []) if str(q).strip()]
    if not search_queries:
        raise ValueError("config.json must define a non-empty 'olx.search_queries'")

    return AppConfig(
        webhook_url=discord_cfg.get("webhook_url", ""),
        discord_username=discord_cfg.get("username", "Phone Deal Bot"),
        discord_rate_limit_seconds=_number(
            discord_cfg, "rate_limit_seconds", 0.5, minimum=0
        ),
        olx_base_url=olx.get("base_url", "https://www.olx.pl/"),
        olx_user_agent=olx.get(
            "user_agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36",
        ),
        olx_region_id=olx.get("region_id"),
        # Requested order on the website search URL (search[order]=...).
        olx_sort_by=(olx.get("sort_by") or "created_at:desc"),
        olx_include_promoted=bool(olx.get("include_promoted", False)),
        olx_extra_params=dict(olx.get("extra_params", {})),
        olx_search_path_prefix=str(
            olx.get("search_path_prefix", DEFAULT_SMARTPHONES_CATEGORY_PATH)
            or DEFAULT_SMARTPHONES_CATEGORY_PATH
        ).strip().strip("/")
        or DEFAULT_SMARTPHONES_CATEGORY_PATH,
        olx_category_id=int(
            olx.get("category_id", DEFAULT_SMARTPHONES_CATEGORY_ID)
            or DEFAULT_SMARTPHONES_CATEGORY_ID
        ),
        olx_category_name=str(
            olx.get("category_name", DEFAULT_SMARTPHONES_CATEGORY_NAME)
            or DEFAULT_SMARTPHONES_CATEGORY_NAME
        ),
        poll_interval_seconds=_number(olx, "poll_interval_seconds", 10, minimum=1),
        jitter_seconds=_number(olx, "jitter_seconds", 2, minimum=0),
        max_backoff_seconds=_number(olx, "max_backoff_seconds", 300, minimum=1),
        request_timeout_seconds=_number(
            olx, "request_timeout_seconds", 15, minimum=1
        ),
        results_per_query=max(1, int(_number(olx, "results_per_query", 40, minimum=1))),
        pages_per_poll=max(1, int(_number(olx, "pages_per_poll", 1, minimum=1))),
        prime_pages_per_query=max(
            1,
            int(
                _number(
                    olx,
                    "prime_pages_per_query",
                    max(5, float(olx.get("pages_per_poll", 1) or 1)),
                    minimum=1,
                )
            ),
        ),
        search_queries=search_queries,
        database_path=db_cfg.get("path", "listings.db"),
        minimum_profit=_number(
            raw, "minimum_profit", float(raw.get("min_profit", 300))
        ),
        stats_interval_seconds=_number(
            raw, "stats_interval_seconds", 600, minimum=0
        ),
        blacklist_keywords=[
            str(k).lower() for k in raw.get("blacklist_keywords", [])
        ],
        accessory_keywords=[
            str(k).lower() for k in raw.get("accessory_keywords", [])
        ],
        prime_on_start=bool(raw.get("prime_on_start", True)),
        price_book=price_book,
        debug_notify_all=bool(raw.get("debug_notify_all", False)),
        max_listing_age_seconds=_number(
            raw,
            "max_listing_age_seconds",
            DEFAULT_MAX_LISTING_AGE_SECONDS,
            minimum=0,
        ),
    )


# --------------------------------------------------------------------------- #
# Monitor
# --------------------------------------------------------------------------- #
class DealMonitor:
    """Coordinates OLX polling, matching, de-duplication and notifications."""

    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._db = ListingDatabase(config.database_path)
        self._stop_event = asyncio.Event()
        self._queue: asyncio.Queue[DealItem] = asyncio.Queue()
        self._stats = Stats()
        # Serialize unseen-calc → INSERT so concurrent query loops cannot
        # insert IDs before another poll finishes its unseen snapshot.
        self._db_poll_lock = asyncio.Lock()

    def request_stop(self) -> None:
        """Signal every polling loop to finish promptly and exit."""
        logger.info("Shutdown requested; stopping...")
        self._stop_event.set()

    # -- matching ----------------------------------------------------------- #
    def matching_accessory_reason(self, listing: Listing) -> Optional[str]:
        """Return ``\"accessory filter\"`` when title/description looks like an accessory."""
        text = listing.search_text
        for keyword in self._config.accessory_keywords:
            if keyword and keyword in text:
                return "accessory filter"
        return None

    def matching_filter_reason(self, listing: Listing) -> Optional[str]:
        """Return the exact blacklist/accessory rejection reason, if any."""
        text = listing.search_text
        for keyword in self._config.blacklist_keywords:
            if keyword in text:
                return f"blacklist keyword: {keyword!r}"
        accessory_reason = self.matching_accessory_reason(listing)
        if accessory_reason is not None:
            return accessory_reason
        return None

    def has_filtered_keyword(self, listing: Listing) -> bool:
        """Return ``True`` if the listing text contains a blacklisted or
        accessory keyword (checked against both title and description)."""
        return self.matching_filter_reason(listing) is not None

    @staticmethod
    def decision_code_for_reason(reason: str) -> str:
        """Map an exact rejection reason to a stable decision code.

        Diagnostics only — does not affect filtering. Codes::

            REJECT_ACCESSORY, REJECT_MODEL, REJECT_PROFIT,
            REJECT_PRICE, REJECT_DUPLICATE, REJECT_OTHER

        ``SENT`` is logged explicitly on the accept path, not via this mapper.
        """
        text = (reason or "").strip()
        lower = text.lower()
        if (
            text == "accessory filter"
            or lower.startswith("accessory keyword")
            or "accessory filter" in lower
        ):
            return "REJECT_ACCESSORY"
        if text in {
            "unknown model",
            "unsupported storage",
            "no configured resale price",
        }:
            return "REJECT_MODEL"
        if lower.startswith("profit below threshold"):
            return "REJECT_PROFIT"
        if text in {"no price", "price <= 0"}:
            return "REJECT_PRICE"
        if "duplicate" in lower:
            return "REJECT_DUPLICATE"
        return "REJECT_OTHER"

    def _log_decision(
        self,
        listing: Listing,
        *,
        decision: str,
        reason: str,
        model: Optional[str],
        storage_gb: Optional[int],
        profit: Optional[float],
    ) -> None:
        """Log exactly one decision code for an unseen listing (diagnostics)."""
        logger.info(
            "Listing decision | decision=%s | id=%s | title=%r | price=%s | "
            "model=%s | storage=%s | profit=%s | reason=%s",
            decision,
            listing.id,
            listing.title,
            listing.price,
            model,
            storage_gb,
            profit,
            reason,
        )

    def _log_rejection(
        self,
        listing: Listing,
        *,
        reason: str,
        model: Optional[str],
        storage_gb: Optional[int],
        resale: Optional[float],
        profit: Optional[float],
    ) -> None:
        """Log a filtered-out listing with full context (never silent)."""
        logger.info(
            "Rejected listing | id=%s | title=%r | price=%s | model=%s | "
            "storage=%s | resale=%s | profit=%s | reason=%s",
            listing.id,
            listing.title,
            listing.price,
            model,
            storage_gb,
            resale,
            profit,
            reason,
        )
        self._log_decision(
            listing,
            decision=self.decision_code_for_reason(reason),
            reason=reason,
            model=model,
            storage_gb=storage_gb,
            profit=profit,
        )

    def evaluate(self, listing: Listing) -> Optional[DealItem]:
        """Evaluate a listing; return a :data:`DealItem` if it is a deal.

        Returns ``None`` (and the caller records it as seen) when the listing is
        filtered out. A listing is ignored when it:

        * was published more than ``max_listing_age_seconds`` ago (default 2
          minutes) based on OLX ``created_time``,
        * contains a blacklisted or accessory keyword (swap terms, ``etui``,
          ``bateria``, ``airpods``, ...),
        * has no price or a price of ``0`` (swap/trade offers),
        * has no photos attached,
        * is posted by a business account (when OLX reports the seller type),
        * cannot be identified (model/storage) confidently,
        * has no configured resale price, or
        * profit is below ``minimum_profit``.

        When ``debug_notify_all`` is enabled, deal-quality filters are skipped
        but the publication-age gate and accessory filter still apply (only
        freshly published non-accessory listings notify). Model/storage/profit
        may be ``None`` when undetectable.

        Otherwise every rejection is logged (never a silent ``return None``)
        with OLX id, title, price, detected model/storage, calculated
        resale/profit, and the exact reason.

        Promoted ads are already excluded upstream by :class:`OlxClient`.
        """
        # Detect early so rejection/debug logs can include model/storage/resale/
        # profit even when an earlier filter would normally reject the ad.
        spec = detect_phone(
            listing.title,
            listing.description,
            model_hint=listing.model_hint,
            storage_hint=listing.storage_hint,
        )
        model = spec.model
        storage_gb = spec.storage_gb
        resale = self._config.price_book.lookup(model, storage_gb)
        price = listing.price
        profit: Optional[float] = (
            resale - price if resale is not None and price is not None else None
        )

        def reject(reason: str) -> None:
            self._log_rejection(
                listing,
                reason=reason,
                model=model,
                storage_gb=storage_gb,
                resale=resale,
                profit=profit,
            )

        # Always enforce freshness from OLX created_time (even in debug mode).
        # Normalise both sides to UTC before subtracting — OLX timestamps carry
        # a local offset (e.g. +02:00) while ``now`` is taken in UTC, and a
        # naive wall-clock subtract would skew age by that offset (~2h).
        now = datetime.now(timezone.utc)
        published = parse_listing_published_at(listing.created_at)
        age_seconds: Optional[float] = None
        published_utc: Optional[datetime] = None
        now_utc = now.astimezone(timezone.utc)
        if published is not None:
            published_utc = published.astimezone(timezone.utc)
            logger.info(
                "Listing timestamp | id=%s | published=%r tz=%s offset=%s | "
                "now=%r tz=%s offset=%s | published_utc=%s | now_utc=%s",
                listing.id,
                published,
                published.tzinfo,
                published.utcoffset(),
                now,
                now.tzinfo,
                now.utcoffset(),
                published_utc.isoformat(),
                now_utc.isoformat(),
            )
            age_seconds = listing_age_seconds(published, now)
            logger.info(
                "Listing age | id=%s | age_seconds=%s",
                listing.id,
                round(age_seconds, 3),
            )
        else:
            logger.info(
                "Listing timestamp | id=%s | published=%r | now=%r tz=%s "
                "offset=%s | now_utc=%s | age_seconds=None",
                listing.id,
                listing.created_at,
                now,
                now.tzinfo,
                now.utcoffset(),
                now_utc.isoformat(),
            )
        if published is None:
            reject("missing publication timestamp")
            return None
        max_age = self._config.max_listing_age_seconds
        if age_seconds is not None and age_seconds > max_age:
            reject(
                f"listing older than {max_age:.0f}s "
                f"(age={age_seconds:.1f}s)"
            )
            return None

        # Always reject accessories before any Discord notify (including
        # debug_notify_all) — only listings that look like actual phones.
        accessory_reason = self.matching_accessory_reason(listing)
        if accessory_reason is not None:
            reject(accessory_reason)
            return None

        # TEMPORARY DEBUG: notify on every fresh non-accessory listing;
        # remaining deal-quality filters are skipped.
        if self._config.debug_notify_all:
            logger.info(
                "DEBUG notify-all | id=%s | title=%r | price=%s | model=%s | "
                "storage=%s | resale=%s | profit=%s | published_utc=%s | url=%s",
                listing.id,
                listing.title,
                listing.price,
                model,
                storage_gb,
                resale,
                profit,
                published_utc.isoformat() if published_utc else None,
                listing.url,
            )
            self._log_decision(
                listing,
                decision="SENT",
                reason="debug_notify_all",
                model=model,
                storage_gb=storage_gb,
                profit=profit,
            )
            return (listing, model, storage_gb, resale, profit, "")

        filter_reason = self.matching_filter_reason(listing)
        if filter_reason is not None:
            reject(filter_reason)
            return None
        if price is None or price <= 0:
            reject("no price" if price is None else "price <= 0")
            return None
        if listing.photo_count <= 0:
            reject("no photos")
            return None
        if listing.is_business is True:
            reject("business seller")
            return None
        if model is None:
            reject("unknown model")
            return None
        if storage_gb is None:
            reject("unsupported storage")
            return None
        if resale is None:
            reject("no configured resale price")
            return None
        assert profit is not None
        if profit < self._config.minimum_profit:
            reject(
                "profit below threshold "
                f"({profit:.2f} < {self._config.minimum_profit:.2f})"
            )
            return None
        self._log_decision(
            listing,
            decision="SENT",
            reason=(
                "profit meets threshold "
                f"({profit:.2f} >= {self._config.minimum_profit:.2f})"
            ),
            model=model,
            storage_gb=storage_gb,
            profit=profit,
        )
        return (listing, model, storage_gb, resale, profit, "")

    # -- lifecycle ---------------------------------------------------------- #
    async def run(self) -> None:
        """Run the monitor until a stop is requested."""
        logger.info(
            "Starting OLX iPhone deal monitor | minimum_profit=%.2f PLN | "
            "webhook=%s | db=%s | debug_notify_all=%s | max_listing_age=%ss | "
            "category_id=%s | category_path=%s | category_name=%s | "
            "search_queries=%s | sort_by=%s",
            self._config.minimum_profit,
            "configured" if self._config.webhook_url else "dry-run",
            self._config.database_path,
            self._config.debug_notify_all,
            self._config.max_listing_age_seconds,
            self._config.olx_category_id,
            self._config.olx_search_path_prefix,
            self._config.olx_category_name,
            self._config.search_queries,
            self._config.olx_sort_by,
        )
        if self._config.debug_notify_all:
            logger.warning(
                "debug_notify_all is ENABLED — deal-quality filters are disabled "
                "(age + accessory filter still apply); every new non-accessory "
                "listing will trigger a Discord notification"
            )
        await self._db.connect()

        # Always run a silent prime pass on startup when configured — even if
        # the DB already has rows from a previous run. Every listing currently
        # returned by OLX is recorded as seen so it can never notify later
        # (the age threshold alone is not enough for listings that were already
        # live before this process started).
        start_primed = not self._config.prime_on_start
        if not start_primed:
            logger.info(
                "Startup priming enabled: first poll per query will record all "
                "current listings without notifying"
            )
        else:
            logger.info("Startup priming disabled (prime_on_start=false)")

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
                search_path_prefix=self._config.olx_search_path_prefix,
                category_id=self._config.olx_category_id,
                category_name=self._config.olx_category_name,
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
                "Monitoring %d query(ies), %d resale price point(s) on %s | "
                "sort_by=%s | base interval %.0fs (+<=%.0fs jitter)%s",
                len(self._config.search_queries),
                len(self._config.price_book),
                self._config.olx_base_url,
                self._config.olx_sort_by,
                self._config.poll_interval_seconds,
                self._config.jitter_seconds,
                "" if start_primed else " | priming first cycle",
            )

            worker = asyncio.create_task(self._notifier_worker(notifier))
            stats_task = asyncio.create_task(self._stats_loop())
            loops = [
                asyncio.create_task(
                    self._run_query_loop(query, olx_client, primed=start_primed)
                )
                for query in self._config.search_queries
            ]
            try:
                await self._stop_event.wait()
            finally:
                for task in loops:
                    task.cancel()
                await asyncio.gather(*loops, return_exceptions=True)
                # Drain queued notifications, but never let a slow/unreachable
                # Discord hang shutdown indefinitely.
                try:
                    await asyncio.wait_for(self._queue.join(), timeout=15)
                except asyncio.TimeoutError:
                    logger.warning(
                        "Timed out draining %d pending notification(s) on shutdown",
                        self._queue.qsize(),
                    )
                worker.cancel()
                stats_task.cancel()
                await asyncio.gather(worker, stats_task, return_exceptions=True)
                self._log_stats()  # final summary on shutdown
                await self._db.close()
                logger.info("Shutdown complete.")

    async def _run_query_loop(
        self, query: str, olx_client: OlxClient, *, primed: bool
    ) -> None:
        """Independently poll a single query forever with jitter + back-off."""
        base = self._config.poll_interval_seconds
        backoff = 0.0
        consecutive_failures = 0
        local_primed = primed

        while not self._stop_event.is_set():
            try:
                # Wider coverage while priming so more of the live catalogue is
                # recorded before notifications start.
                pages = (
                    self._config.prime_pages_per_query
                    if not local_primed
                    else self._config.pages_per_poll
                )
                listings = await olx_client.search(
                    query,
                    limit=self._config.results_per_query,
                    pages=pages,
                )
                await self._process_listings(
                    query, listings, priming=not local_primed
                )
                if not local_primed:
                    local_primed = True
                    logger.info(
                        "[%s] priming complete; notifying only listings not seen "
                        "in previous poll cycles",
                        query,
                    )
                if consecutive_failures:
                    logger.info(
                        "[%s] recovered after %d failed poll(s)",
                        query,
                        consecutive_failures,
                    )
                consecutive_failures = 0
                backoff = 0.0
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                consecutive_failures += 1
                backoff = min(
                    base if backoff == 0 else backoff * 2,
                    self._config.max_backoff_seconds,
                )
                logger.warning(
                    "[%s] poll failed (attempt %d): %s (retrying in %.0fs)",
                    query,
                    consecutive_failures,
                    exc,
                    backoff,
                )

            delay = (backoff if backoff else base) + random.uniform(
                0, self._config.jitter_seconds
            )
            await self._sleep_or_stop(delay)

    async def _process_listings(
        self, query: str, listings: List[Listing], *, priming: bool
    ) -> None:
        """Match, cost and enqueue new listings for a single poll result.

        Only listings whose ids were **not** already in the DB (i.e. not seen
        during startup priming or any earlier poll) are considered. During
        priming every new id is recorded with ``notified=False`` and no Discord
        message is sent.

        The unseen set is always computed **before** any SQLite insert. After
        priming, every poll logs ``database.contains(id)`` for each first-10 id
        and either per-unseen details or ``0 unseen listings`` with the decision
        site — so a rotating ``first10_ids`` that are all already primed is
        distinguishable from a parser that finds nothing new.

        Concurrent query loops share one lock around unseen→insert so another
        loop cannot INSERT mid-snapshot (which would make ``contains=True`` for
        an ID that was still unseen at the start of this poll).
        """
        async with self._db_poll_lock:
            await self._process_listings_locked(
                query, listings, priming=priming
            )

    async def _process_listings_locked(
        self, query: str, listings: List[Listing], *, priming: bool
    ) -> None:
        """Unseen-calc → evaluate → INSERT body (caller holds ``_db_poll_lock``)."""
        self._db.begin_poll(query)
        try:
            await self._process_listings_body(
                query, listings, priming=priming
            )
        finally:
            self._db.end_poll()

    async def _process_listings_body(
        self, query: str, listings: List[Listing], *, priming: bool
    ) -> None:
        # --- Empty fetch --------------------------------------------------- #
        if not listings:
            # No IDs to check; mark unseen computed with empty baseline so any
            # accidental INSERT still goes through the gate cleanly.
            self._db.mark_unseen_computed(set())
            if not priming:
                logger.info(
                    "[%s] 0 unseen listings | "
                    "decided_at=_process_listings:empty_fetch | "
                    "fetched=0 | unseen=0 | "
                    "unseen_computed_before_insert=True",
                    query,
                )
            return

        # --- Unseen computation MUST happen before any insert -------------- #
        # INSERT is gated (begin_poll) until mark_unseen_computed below.
        ids = [listing.id for listing in listings]
        already_seen = await self._db.seen_subset(ids)
        new_listings = [
            listing for listing in listings if listing.id not in already_seen
        ]
        unseen_count = len(new_listings)  # frozen before any mark_seen_* call
        # Unlock INSERT and freeze the pre-poll baseline used by contains().
        self._db.mark_unseen_computed(already_seen)

        # Correlate with the poll's first10_ids: contains? after unseen freeze,
        # still before any INSERT for this poll.
        first10 = listings[:10]
        for listing in first10:
            contains = await self._db.contains(listing.id)
            in_subset = listing.id in already_seen
            logger.info(
                "first10_id DB check (pre-insert) | query=%s | id=%s | "
                "database.contains=%s | in_seen_subset=%s | agree=%s | "
                "db_path=%s",
                query,
                listing.id,
                contains,
                in_subset,
                contains == in_subset,
                self._db.path,
            )
            if contains != in_subset:
                logger.error(
                    "first10_id DB mismatch | query=%s | id=%s | "
                    "contains=%s | in_seen_subset=%s | "
                    "note=baseline and live contains disagree — possible "
                    "INSERT from another writer during this poll",
                    query,
                    listing.id,
                    contains,
                    in_subset,
                )

        logger.info(
            "Unseen count (pre-insert) | query=%s | fetched=%d | "
            "already_in_db=%d | unseen=%d | priming=%s | "
            "unseen_computed_before_insert=True | db_path=%s",
            query,
            len(listings),
            len(already_seen),
            unseen_count,
            priming,
            self._db.path,
        )

        # Post-prime: explain 0-unseen vs rotating first10_ids.
        if not priming and unseen_count == 0:
            logger.info(
                "[%s] 0 unseen listings | "
                "decided_at=_process_listings:all_ids_already_in_sqlite | "
                "fetched=%d | already_in_db=%d | unseen=0 | "
                "unseen_computed_before_insert=True | "
                "note=first10_ids may still change when OLX reorders "
                "already-seen ads by last_refresh",
                query,
                len(listings),
                len(already_seen),
            )
            return

        if not priming:
            for listing in new_listings:
                logger.info(
                    "Unseen listing (pre-filter) | id=%s | title=%r | "
                    "created_at=%s | price=%s",
                    listing.id,
                    listing.title,
                    listing.created_at,
                    listing.price,
                )

        if not new_listings:
            # Priming path with nothing new (already covered for post-prime).
            return

        self._stats.listings_checked += len(new_listings)

        # Startup / configured priming: record the live catalogue, never notify.
        # Inserts happen ONLY after unseen_count was computed above.
        if priming:
            records = [
                (
                    listing.id,
                    listing.source,
                    listing.title,
                    listing.price,
                    listing.url,
                    False,
                )
                for listing in new_listings
            ]
            await self._db.mark_seen_many(records)
            logger.info(
                "[%s] primed %d listing(s) into DB (%d already known) — "
                "no notifications | inserts_after_unseen_count=True",
                query,
                len(new_listings),
                len(already_seen),
            )
            return

        records = []
        deals: List[DealItem] = []
        for listing in new_listings:
            deal = self.evaluate(listing)
            notified = deal is not None
            if notified:
                assert deal is not None
                self._stats.deals_found += 1
                if deal[4] is not None:
                    self._stats.total_profit += deal[4]
                # Attach the originating query for logging.
                deals.append(deal[:5] + (query,))
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

        # Inserts happen ONLY after unseen_count / pre-filter logs above.
        await self._db.mark_seen_many(records)
        confirmed = await self._db.seen_subset(
            [listing.id for listing in new_listings]
        )
        for listing in new_listings:
            logger.info(
                "Unseen listing | id=%s | title=%r | created_at=%s | price=%s | "
                "inserted=%s",
                listing.id,
                listing.title,
                listing.created_at,
                listing.price,
                listing.id in confirmed,
            )

        # Deliver the most profitable deals first for lowest time-to-alert.
        # Listings without a calculable profit sort last.
        deals.sort(
            key=lambda item: item[4] if item[4] is not None else float("-inf"),
            reverse=True,
        )
        for deal in deals:
            await self._queue.put(deal)

        logger.info(
            "[%s] %d new listing(s) since previous cycle, %d deal(s)",
            query,
            len(new_listings),
            len(deals),
        )

    async def _notifier_worker(self, notifier: DiscordNotifier) -> None:
        """Drain the deal queue and deliver notifications, one at a time."""
        while True:
            listing, model, storage_gb, resale, profit, query = await self._queue.get()
            try:
                sent = await notifier.send_deal(
                    listing,
                    resale_price=resale,
                    profit=profit,
                    model=model,
                    storage_gb=storage_gb,
                )
                if sent:
                    self._stats.notifications_sent += 1
                    logger.info(
                        "NOTIFY [%s] id=%s | model=%s | storage=%s | price=%s | "
                        "resale=%s | profit=%s | %s",
                        query,
                        listing.id,
                        model,
                        storage_gb,
                        listing.price,
                        resale,
                        profit,
                        listing.url,
                    )
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - never let one send kill worker
                logger.warning("Notification delivery failed: %s", exc)
            finally:
                self._queue.task_done()

    async def _stats_loop(self) -> None:
        """Log rolling statistics every ``stats_interval_seconds``."""
        interval = self._config.stats_interval_seconds
        if interval <= 0:
            return
        while not self._stop_event.is_set():
            await self._sleep_or_stop(interval)
            if self._stop_event.is_set():
                break
            self._log_stats()

    def _log_stats(self) -> None:
        """Emit a single cumulative statistics line."""
        stats = self._stats
        logger.info(
            "STATS (cumulative) | listings checked: %d | deals found: %d | "
            "notifications sent: %d | average profit: %.2f PLN",
            stats.listings_checked,
            stats.deals_found,
            stats.notifications_sent,
            stats.average_profit,
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
