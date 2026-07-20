"""Entry point for the OLX iPhone resale-deal monitor.

The monitor continuously polls OLX for iPhone listings, parses each listing's
model and storage capacity (from OLX's structured attributes and/or the title and
description), matches it against the user's expected **resale price list** in
``config.json``, and pushes an instant Discord webhook notification for
**every** new, correctly identified listing::

    profit_or_loss = resale_price - listing_price

There is no minimum-profit threshold -- the Discord message always shows the
resulting profit/loss (``+X zł`` or ``-X zł``), even when it is negative.

Listings are ignored when the title/description contains a blacklisted keyword
(``icloud``, ``uszkodzony``, swap terms, ...) or the *title* contains an
accessory keyword (``etui``, ``bateria``, ``kabel``, ...); when there is no
price or a price of ``0``; when there are no photos; when the seller is a
business account; or when the model/storage cannot be determined confidently
(or has no configured resale price, since a profit/loss cannot be computed
without one). Keyword matching is boundary-aware so negated/prefixed words
(``"nieuszkodzony"``, ``"unlocked"``) do not trigger a match meant for the
opposite word (``"uszkodzony"``, ``"locked"``).

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
import re
import signal
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Pattern, Tuple

import aiohttp

from database import ListingDatabase
from discord import DiscordNotifier
from olx import Listing, OlxClient, listing_sort_key
from pricing import PriceBook, detect_phone

logger = logging.getLogger("phonedealbot")

# Item pushed onto the notification queue:
#   (listing, model, storage_gb, resale_price, profit, query, fetched_at)
# ``fetched_at`` is a Unix timestamp (seconds) recorded when the bot first
# saw this listing in an OLX poll response (diagnostic latency logging only).
DealItem = Tuple[Listing, str, int, float, float, str, float]

# Polish letters treated as "word characters" for the keyword-boundary check
# below (spelled out explicitly so the intent is unambiguous regardless of
# locale/``re`` flags).
_PL_WORD_CHARS = "a-ząćęłńóśźż0-9"


def _compile_keyword_patterns(keywords: List[str]) -> List[Pattern[str]]:
    """Compile keyword-match patterns that avoid two classes of false hits:

    * **Negation/prefix gluing**: a bare substring check would match
      ``"uszkodzony"`` (damaged) inside ``"nieuszkodzony"`` (**not** damaged),
      or ``"locked"`` inside ``"unlocked"`` -- inverting the intended meaning.
      A negative look-behind for a preceding letter/digit prevents this while
      still matching the keyword as a normal whole word.
    * Polish noun/adjective *suffix* inflections (e.g. ``"ekran"`` ->
      ``"ekranu"``/``"ekranie"``) are intentionally still matched -- only the
      start of the keyword is boundary-checked, not the end.
    """
    return [
        re.compile(rf"(?<![{_PL_WORD_CHARS}]){re.escape(keyword)}")
        for keyword in keywords
        if keyword
    ]


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
    poll_interval_seconds: float
    jitter_seconds: float
    max_backoff_seconds: float
    request_timeout_seconds: float
    results_per_query: int
    pages_per_poll: int
    search_queries: List[str]
    database_path: str
    stats_interval_seconds: float
    blacklist_keywords: List[str]
    accessory_keywords: List[str]
    prime_on_start: bool
    price_book: PriceBook


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
        olx_base_url=olx.get("base_url", "https://www.olx.pl/api/v1/offers/"),
        olx_user_agent=olx.get(
            "user_agent", "Mozilla/5.0 (compatible; PhoneDealBot/1.0)"
        ),
        olx_region_id=olx.get("region_id"),
        olx_sort_by=(olx.get("sort_by") or None),
        olx_include_promoted=bool(olx.get("include_promoted", False)),
        olx_extra_params=dict(olx.get("extra_params", {})),
        poll_interval_seconds=_number(olx, "poll_interval_seconds", 10, minimum=1),
        jitter_seconds=_number(olx, "jitter_seconds", 2, minimum=0),
        max_backoff_seconds=_number(olx, "max_backoff_seconds", 300, minimum=1),
        request_timeout_seconds=_number(
            olx, "request_timeout_seconds", 15, minimum=1
        ),
        results_per_query=max(1, int(_number(olx, "results_per_query", 40, minimum=1))),
        pages_per_poll=max(1, int(_number(olx, "pages_per_poll", 1, minimum=1))),
        search_queries=search_queries,
        database_path=db_cfg.get("path", "listings.db"),
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
        self._blacklist_patterns = _compile_keyword_patterns(config.blacklist_keywords)
        self._accessory_patterns = _compile_keyword_patterns(config.accessory_keywords)

    def request_stop(self) -> None:
        """Signal every polling loop to finish promptly and exit."""
        logger.info("Shutdown requested; stopping...")
        self._stop_event.set()

    # -- matching ----------------------------------------------------------- #
    def has_filtered_keyword(self, listing: Listing) -> bool:
        """Return ``True`` if the listing is disqualified by a keyword.

        * **Blacklist keywords** (``icloud``, ``uszkodzony``, swap terms, ...)
          describe a problem with the phone itself, which a seller may only
          mention in the description -- so these are checked against the full
          title + description text.
        * **Accessory keywords** (``etui``, ``bateria``, ``kabel``, ...) are
          checked against the **title only**. Genuine accessory-only ads name
          the accessory in the title (e.g. ``"Etui iPhone 13"``,
          ``"Bateria do iPhone 12"``). Checking the description too would
          reject the vast majority of ordinary phone listings, which routinely
          mention battery health, minor cosmetic wear or bundled extras as
          part of a normal sale (e.g. ``"bateria 89%"``, ``"dorzucam etui"``,
          ``"kabel w zestawie"``) -- this previously caused the monitor to
          silently drop the large majority of real, profitable listings.
        """
        full_text = listing.search_text
        if any(pattern.search(full_text) for pattern in self._blacklist_patterns):
            return True
        title_text = listing.title.lower()
        return any(pattern.search(title_text) for pattern in self._accessory_patterns)

    def evaluate(
        self, listing: Listing
    ) -> Optional[Tuple[Listing, str, int, float, float, str]]:
        """Evaluate a listing; return match fields if it should notify.

        There is **no minimum-profit threshold** -- every new, correctly
        identified iPhone listing notifies, whether it would be profitable or
        not (the Discord message shows the resulting profit/loss either way).
        Returns ``None`` (and the caller records it as seen) when the listing
        is filtered out. A listing is ignored when it:

        * contains a blacklisted keyword anywhere (swap terms, ``icloud``,
          ``uszkodzony``, ...) or an accessory keyword in the *title*
          (``etui``, ``bateria``, ``airpods``, ...) -- see
          :meth:`has_filtered_keyword`,
        * has no price or a price of ``0`` (swap/trade offers),
        * has no photos attached,
        * is posted by a business account (when OLX reports the seller type),
        * cannot be identified (model/storage) confidently, or
        * has no configured resale price (needed to compute profit/loss).

        Promoted ads are already excluded upstream by :class:`OlxClient`.
        """
        if self.has_filtered_keyword(listing):
            self._log_rejection(listing, "blacklisted/accessory keyword")
            return None
        if listing.price is None or listing.price <= 0:
            self._log_rejection(listing, f"no/zero price (price={listing.price!r})")
            return None
        if listing.photo_count <= 0:
            self._log_rejection(listing, "no photos attached")
            return None
        if listing.is_business is True:
            self._log_rejection(listing, "business/shop account")
            return None

        spec = detect_phone(
            listing.title,
            listing.description,
            model_hint=listing.model_hint,
            storage_hint=listing.storage_hint,
        )
        if not spec.is_confident:
            self._log_rejection(
                listing,
                f"model/storage not confidently identified "
                f"(model={spec.model!r}, storage_gb={spec.storage_gb!r})",
            )
            return None
        assert spec.model is not None and spec.storage_gb is not None

        resale = self._config.price_book.lookup(spec.model, spec.storage_gb)
        if resale is None:
            self._log_rejection(
                listing,
                f"no configured resale_prices entry for "
                f"{spec.model!r} / {spec.storage_gb}GB",
            )
            return None

        profit = resale - listing.price
        return (listing, spec.model, spec.storage_gb, resale, profit, "")

    @staticmethod
    def _log_rejection(listing: Listing, reason: str) -> None:
        """Log why a listing was filtered out (DEBUG; enable with
        ``logging.getLogger("phonedealbot").setLevel(logging.DEBUG)`` or
        ``PYTHONLOG=DEBUG`` for full per-listing detail)."""
        logger.debug(
            "[reject] id=%s title=%r price=%s -> %s",
            listing.id,
            listing.title,
            listing.price,
            reason,
        )

    # -- lifecycle ---------------------------------------------------------- #
    async def run(self) -> None:
        """Run the monitor until a stop is requested."""
        logger.info(
            "Starting OLX iPhone deal monitor | no minimum-profit filter "
            "(every recognized listing notifies) | webhook=%s | db=%s",
            "configured" if self._config.webhook_url else "dry-run",
            self._config.database_path,
        )
        await self._db.connect()

        # Only prime (silently record the back-catalogue) on a genuinely fresh
        # database. On restart the DB already has history, so newly-appeared
        # listings should notify immediately rather than being suppressed.
        existing = await self._db.count()
        start_primed = existing > 0 or not self._config.prime_on_start

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
                "Monitoring %d query(ies), %d resale price point(s) on %s | base "
                "interval %.0fs (+<=%.0fs jitter)%s",
                len(self._config.search_queries),
                len(self._config.price_book),
                self._config.olx_base_url,
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
            cycle_t0 = time.monotonic()
            fetch_s = 0.0
            process_s = 0.0
            try:
                t_fetch = time.monotonic()
                listings = await olx_client.search(
                    query,
                    limit=self._config.results_per_query,
                    pages=self._config.pages_per_poll,
                )
                fetch_s = time.monotonic() - t_fetch

                t_process = time.monotonic()
                await self._process_listings(
                    query, listings, priming=not local_primed
                )
                process_s = time.monotonic() - t_process

                if not local_primed:
                    local_primed = True
                    logger.info(
                        "[%s] priming complete; new listings will now notify", query
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
            t_sleep = time.monotonic()
            await self._sleep_or_stop(delay)
            sleep_s = time.monotonic() - t_sleep
            cycle_s = time.monotonic() - cycle_t0

            steps = {
                "olx_fetch": fetch_s,
                "process_listings": process_s,
                "poll_sleep": sleep_s,
            }
            slowest_name = max(steps, key=lambda name: steps[name])
            logger.info(
                "[%s] LATENCY poll-cycle: total=%.3fs | olx_fetch=%.3fs | "
                "process_listings=%.3fs | poll_sleep=%.3fs | "
                "slowest_step=%s (%.3fs)",
                query,
                cycle_s,
                fetch_s,
                process_s,
                sleep_s,
                slowest_name,
                steps[slowest_name],
            )

    async def _process_listings(
        self, query: str, listings: List[Listing], *, priming: bool
    ) -> None:
        """Match, cost and enqueue new listings for a single poll result."""
        if not listings:
            logger.info(
                "[%s] OLX returned 0 offers this poll (see OLX request/response "
                "log lines above for URL + HTTP status)",
                query,
            )
            return

        ids = [listing.id for listing in listings]
        already_seen = await self._db.seen_subset(ids)
        # ``listings`` is already sorted newest-first by OlxClient.search()
        # (via listing_sort_key / Listing.created_at); a plain filter here
        # preserves that order, so new_listings[0] is the newest new listing.
        new_listings = [listing for listing in listings if listing.id not in already_seen]
        logger.info(
            "[%s] fetched %d offer(s), %d already seen (deduped), %d new",
            query,
            len(listings),
            len(already_seen),
            len(new_listings),
        )
        if not new_listings:
            return

        logger.info(
            "[%s] processing order (newest-first, by 'created_at'): "
            "first (newest)=%s id=%s title=%r | last (oldest)=%s id=%s title=%r",
            query,
            new_listings[0].created_at,
            new_listings[0].id,
            new_listings[0].title,
            new_listings[-1].created_at,
            new_listings[-1].id,
            new_listings[-1].title,
        )

        self._stats.listings_checked += len(new_listings)

        # Wall-clock moment this poll first observed these listings (after OLX
        # fetch returned). Used only for end-to-end latency diagnostics.
        fetched_at = time.time()

        records = []
        deals: List[DealItem] = []
        for listing in new_listings:
            deal = self.evaluate(listing)
            notified = deal is not None and not priming
            if notified:
                assert deal is not None
                self._stats.deals_found += 1
                self._stats.total_profit += deal[4]
                # Attach the originating query + fetch timestamp for logging.
                deals.append(deal[:5] + (query, fetched_at))
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

        await self._db.mark_seen_many(records)

        # Deliver the newest listing first (matches the processing order
        # above), not API response order or profit size.
        deals.sort(key=lambda item: listing_sort_key(item[0]), reverse=True)
        for deal in deals:
            await self._queue.put(deal)

        logger.info(
            "[%s] %d new listing(s), %d deal(s)%s",
            query,
            len(new_listings),
            len(deals),
            " (priming - not notified)" if priming else "",
        )

    async def _notifier_worker(self, notifier: DiscordNotifier) -> None:
        """Drain the deal queue and deliver notifications, one at a time."""
        while True:
            (
                listing,
                model,
                storage_gb,
                resale,
                profit,
                query,
                fetched_at,
            ) = await self._queue.get()
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
                    sent_at = time.time()
                    logger.info(
                        "DEAL [%s] %s %dGB | price=%s | resale=%.2f | profit=%.2f | %s",
                        query,
                        model,
                        storage_gb,
                        listing.price,
                        resale,
                        profit,
                        listing.url,
                    )
                    self._log_notification_latency(
                        listing, query=query, fetched_at=fetched_at, sent_at=sent_at
                    )
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - never let one send kill worker
                logger.warning("Notification delivery failed: %s", exc)
            finally:
                self._queue.task_done()

    @staticmethod
    def _log_notification_latency(
        listing: Listing, *, query: str, fetched_at: float, sent_at: float
    ) -> None:
        """Log end-to-end latency for a single Discord-notified listing.

        Fields (diagnostic only, no behaviour change):
        * ``olx_created_time`` — listing publication timestamp from OLX
        * ``fetched_at`` — when this bot first observed the listing in a poll
        * ``sent_at`` — when the Discord webhook send completed successfully
        * ``total_latency_s`` — ``sent_at - olx_created_time`` (publication → Discord)
        * ``bot_latency_s`` — ``sent_at - fetched_at`` (first fetch → Discord)
        """
        fetched_iso = datetime.fromtimestamp(fetched_at, tz=timezone.utc).isoformat()
        sent_iso = datetime.fromtimestamp(sent_at, tz=timezone.utc).isoformat()
        bot_latency_s = sent_at - fetched_at

        created_raw = listing.created_at
        total_latency_s: Optional[float] = None
        if created_raw:
            try:
                created_dt = datetime.fromisoformat(created_raw)
                if created_dt.tzinfo is None:
                    created_dt = created_dt.replace(tzinfo=timezone.utc)
                total_latency_s = sent_at - created_dt.timestamp()
            except ValueError:
                total_latency_s = None

        if total_latency_s is not None:
            logger.info(
                "LATENCY notify [%s] id=%s | olx_created_time=%s | "
                "fetched_at=%s | sent_at=%s | total_latency_s=%.3f | "
                "bot_latency_s=%.3f | url=%s",
                query,
                listing.id,
                created_raw,
                fetched_iso,
                sent_iso,
                total_latency_s,
                bot_latency_s,
                listing.url,
            )
        else:
            logger.info(
                "LATENCY notify [%s] id=%s | olx_created_time=%s | "
                "fetched_at=%s | sent_at=%s | total_latency_s=n/a | "
                "bot_latency_s=%.3f | url=%s",
                query,
                listing.id,
                created_raw,
                fetched_iso,
                sent_iso,
                bot_latency_s,
                listing.url,
            )

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
