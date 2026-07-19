#!/usr/bin/env python3
"""TEMPORARY: poll OLX and notify Discord on first10_id churn (no SQLite).

Ignores the listings database completely. Each poll compares the current
``first10_ids`` for a query with that query's previous poll. Any id that
newly appears in the top 10 is logged as ``NEW ID DETECTED`` and sent to
Discord immediately.

The first poll per query is a silent baseline (no Discord) so startup does
not flood the webhook with the entire first page.

Run::

    python debug_first10_diff.py
    python debug_first10_diff.py --config config.json --max-polls 20
    python debug_first10_diff.py --query 'iphone 12' --interval 5

Stop with Ctrl-C.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys
from typing import Dict, List, Optional, Set

import aiohttp

from discord import DiscordNotifier
from main import load_config
from olx import Listing, OlxClient

logger = logging.getLogger("first10_diff")


async def _notify_new_id(
    notifier: DiscordNotifier,
    listing: Listing,
    *,
    query: str,
    index: int,
    previous_first10: List[str],
    current_first10: List[str],
    accessory_keywords: List[str],
) -> None:
    """Log ``NEW ID DETECTED`` and push the listing to Discord right away.

    Accessories are rejected before Discord with reason ``accessory filter``.
    """
    text = listing.search_text
    for keyword in accessory_keywords:
        if keyword and keyword in text:
            logger.info(
                "Rejected listing | id=%s | title=%r | price=%s | model=%s | "
                "storage=%s | resale=%s | profit=%s | reason=accessory filter",
                listing.id,
                listing.title,
                listing.price,
                None,
                None,
                None,
                None,
            )
            return

    logger.info(
        "NEW ID DETECTED | query=%r | id=%s | index=%d | title=%r | "
        "price=%s | created_at=%s | url=%s | prev_first10=%s | "
        "curr_first10=%s",
        query,
        listing.id,
        index,
        listing.title,
        listing.price,
        listing.created_at,
        listing.url,
        previous_first10,
        current_first10,
    )
    await notifier.send_deal(
        listing,
        resale_price=None,
        profit=None,
        model=None,
        storage_gb=None,
    )


async def run(
    config_path: str,
    *,
    queries: Optional[List[str]] = None,
    interval: Optional[float] = None,
    max_polls: Optional[int] = None,
) -> int:
    config = load_config(config_path)
    search_queries = queries or list(config.search_queries)
    poll_interval = (
        interval if interval is not None else config.poll_interval_seconds
    )

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    logger.info(
        "TEMPORARY first10-diff poller starting | config=%s | queries=%s | "
        "interval=%ss | max_polls=%s | sqlite=DISABLED | webhook=%s",
        config_path,
        search_queries,
        poll_interval,
        max_polls if max_polls is not None else "unlimited",
        "configured" if config.webhook_url else "empty (dry-run)",
    )

    stop = asyncio.Event()

    def _request_stop() -> None:
        if not stop.is_set():
            logger.info("Stop requested; finishing current poll then exiting")
            stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except NotImplementedError:
            # Windows / limited environments: rely on KeyboardInterrupt.
            pass

    # query -> previous poll's first10 id list (order preserved)
    previous_first10: Dict[str, List[str]] = {}
    poll_number = 0

    connector = aiohttp.TCPConnector(limit=10, ttl_dns_cache=300)
    async with aiohttp.ClientSession(connector=connector) as session:
        client = OlxClient(
            session,
            base_url=config.olx_base_url,
            user_agent=config.olx_user_agent,
            request_timeout=config.request_timeout_seconds,
            region_id=config.olx_region_id,
            sort_by=config.olx_sort_by,
            include_promoted=config.olx_include_promoted,
            extra_params=config.olx_extra_params,
            search_path_prefix=config.olx_search_path_prefix,
            category_id=config.olx_category_id,
            category_name=config.olx_category_name,
        )
        notifier = DiscordNotifier(
            session,
            webhook_url=config.webhook_url,
            username=config.discord_username,
            rate_limit_seconds=config.discord_rate_limit_seconds,
            request_timeout=config.request_timeout_seconds,
        )

        while not stop.is_set():
            poll_number += 1
            if max_polls is not None and poll_number > max_polls:
                logger.info("Reached --max-polls=%d; exiting", max_polls)
                break

            logger.info("=== poll #%d (SQLite ignored) ===", poll_number)

            for query in search_queries:
                if stop.is_set():
                    break
                try:
                    # Only page 1 is needed to observe first10 churn.
                    listings = await client.search(
                        query,
                        limit=config.results_per_query,
                        pages=1,
                    )
                except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
                    logger.warning(
                        "Poll fetch failed | query=%r | poll=#%d | error=%s",
                        query,
                        poll_number,
                        exc,
                    )
                    continue

                current = listings[:10]
                current_ids = [item.id for item in current]
                logger.info(
                    "first10 snapshot | query=%r | poll=#%d | first10_ids=%s",
                    query,
                    poll_number,
                    current_ids,
                )

                prev_ids = previous_first10.get(query)
                if prev_ids is None:
                    logger.info(
                        "Baseline first10 stored (no Discord) | query=%r | "
                        "first10_ids=%s",
                        query,
                        current_ids,
                    )
                else:
                    prev_set: Set[str] = set(prev_ids)
                    new_listings = [
                        item for item in current if item.id not in prev_set
                    ]
                    if not new_listings:
                        logger.info(
                            "No first10 churn | query=%r | poll=#%d",
                            query,
                            poll_number,
                        )
                    for item in new_listings:
                        index = current_ids.index(item.id)
                        await _notify_new_id(
                            notifier,
                            item,
                            query=query,
                            index=index,
                            previous_first10=prev_ids,
                            current_first10=current_ids,
                            accessory_keywords=config.accessory_keywords,
                        )

                previous_first10[query] = current_ids

            if stop.is_set():
                break
            if max_polls is not None and poll_number >= max_polls:
                logger.info("Reached --max-polls=%d; exiting", max_polls)
                break

            logger.info("Sleeping %.1fs until next poll", poll_interval)
            try:
                await asyncio.wait_for(stop.wait(), timeout=poll_interval)
            except asyncio.TimeoutError:
                pass

    logger.info("first10-diff poller stopped after %d poll(s)", poll_number)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "TEMPORARY: ignore SQLite; Discord-notify when first10_ids gain "
            "a new id vs the previous poll."
        )
    )
    parser.add_argument(
        "--config",
        default="config.json",
        help="Path to config.json (default: config.json)",
    )
    parser.add_argument(
        "--query",
        action="append",
        dest="queries",
        default=None,
        help="Only poll this search query (repeatable). Default: all config queries.",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=None,
        help="Seconds between polls (default: olx.poll_interval_seconds)",
    )
    parser.add_argument(
        "--max-polls",
        type=int,
        default=None,
        help="Exit after this many poll cycles (default: run until Ctrl-C)",
    )
    args = parser.parse_args()
    try:
        raise SystemExit(
            asyncio.run(
                run(
                    args.config,
                    queries=args.queries,
                    interval=args.interval,
                    max_polls=args.max_polls,
                )
            )
        )
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    except KeyboardInterrupt:
        raise SystemExit(0) from None


if __name__ == "__main__":
    main()
