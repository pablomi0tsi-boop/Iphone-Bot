#!/usr/bin/env python3
"""One-shot debug: resolve an OLX offer URL and explain unseen status.

Example::

    python debug_listing.py \\
        'https://www.olx.pl/d/oferta/iphone-12-czerwony-64gb-CID99-ID1bwL8v.html'

Prints:
  * public URL id (``ID…``) and internal numeric OLX id
  * whether that numeric id appears in the current website-poll results
  * ``database.contains(id)`` before any insert
  * why the listing is / is not considered unseen
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import aiohttp

from database import ListingDatabase
from main import load_config
from olx import OlxClient

_PRERENDERED_ASSIGN_RE = re.compile(r"window\.__PRERENDERED_STATE__\s*=\s*")
_PRERENDERED_STRING_RE = re.compile(r'^("(?:\\.|[^"\\])*")\s*;', re.S)
_PUBLIC_ID_RE = re.compile(r"-ID([A-Za-z0-9]+)\.html", re.IGNORECASE)
_SKU_RE = re.compile(r'"sku"\s*:\s*"(\d+)"')

DEFAULT_URL = (
    "https://www.olx.pl/d/oferta/iphone-12-czerwony-64gb-CID99-ID1bwL8v.html"
)


def _extract_prerendered_state(html: str) -> Dict[str, Any]:
    assign = _PRERENDERED_ASSIGN_RE.search(html)
    if not assign:
        raise ValueError("window.__PRERENDERED_STATE__ not found on offer page")
    match = _PRERENDERED_STRING_RE.match(html[assign.end() :])
    if not match:
        raise ValueError("Could not parse __PRERENDERED_STATE__ string literal")
    return json.loads(json.loads(match.group(1)))


def _public_id_from_url(url: str) -> Optional[str]:
    match = _PUBLIC_ID_RE.search(url)
    return match.group(1) if match else None


async def resolve_numeric_id(
    session: aiohttp.ClientSession,
    url: str,
    *,
    user_agent: str,
    timeout: float,
) -> Tuple[str, Optional[str], Optional[str], Optional[str]]:
    """Fetch the offer page and return ``(numeric_id, public_id, title, created_at)``."""
    public_id = _public_id_from_url(url)
    client_timeout = aiohttp.ClientTimeout(total=timeout)
    headers = {
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
    }
    async with session.get(url, headers=headers, timeout=client_timeout) as response:
        response.raise_for_status()
        html = await response.text()
        final_url = str(response.url)

    if public_id is None:
        public_id = _public_id_from_url(final_url)

    numeric: Optional[str] = None
    title: Optional[str] = None
    created_at: Optional[str] = None

    try:
        state = _extract_prerendered_state(html)
        ad = (state.get("ad") or {}).get("ad") if isinstance(state, dict) else None
        if isinstance(ad, dict) and ad.get("id") is not None:
            numeric = str(ad["id"])
            title = ad.get("title")
            created_at = ad.get("createdTime") or ad.get("created_time")
    except ValueError:
        pass

    if numeric is None:
        sku = _SKU_RE.search(html)
        if sku:
            numeric = sku.group(1)

    if numeric is None:
        raise RuntimeError(
            f"Could not resolve numeric OLX id from offer page: {final_url}"
        )
    return numeric, public_id, title, created_at


def _explain_unseen(
    *,
    in_poll: bool,
    in_db: bool,
    priming_would_suppress: bool,
) -> str:
    """Human-readable reason the listing is / is not unseen right now."""
    if in_db and in_poll:
        return (
            "NOT unseen: database.contains(id)=True (already recorded from a "
            "previous prime/poll), even though it appears in the current poll "
            "results. first10_ids can still show it when OLX reorders ads."
        )
    if in_db and not in_poll:
        return (
            "NOT unseen: database.contains(id)=True and it is also absent from "
            "the current poll page(s). It will not notify again unless the DB "
            "row is deleted."
        )
    if not in_db and in_poll:
        if priming_would_suppress:
            return (
                "WOULD be unseen (not in SQLite, present in poll) — but a "
                "startup prime pass would record it without notifying."
            )
        return (
            "UNSEEN: database.contains(id)=False and the id appears in the "
            "current poll results, so _process_listings would treat it as new "
            "before deal filters."
        )
    return (
        "NOT in poll and NOT in DB: the website search pages we fetched do "
        "not currently include this listing, so this poll cannot mark it "
        "unseen. It may be on a later page, a different query, or not yet "
        "indexed in search."
    )


async def run(
    url: str,
    config_path: str,
    *,
    pages: Optional[int] = None,
    queries: Optional[List[str]] = None,
) -> int:
    config = load_config(config_path)
    search_queries = queries or list(config.search_queries)
    page_count = (
        pages
        if pages is not None
        else max(config.pages_per_poll, config.prime_pages_per_query)
    )
    print(f"Config: {config_path}")
    print(f"Offer URL: {url}")
    print(f"DB path: {config.database_path}")
    print(f"Search queries: {search_queries}")
    print(f"Pages per query: {page_count}")
    print(f"prime_on_start: {config.prime_on_start}")
    print()

    connector = aiohttp.TCPConnector(limit=10, ttl_dns_cache=300)
    async with aiohttp.ClientSession(connector=connector) as session:
        numeric_id, public_id, title, created_at = await resolve_numeric_id(
            session,
            url,
            user_agent=config.olx_user_agent,
            timeout=config.request_timeout_seconds,
        )
        print("--- ID resolution ---")
        print(f"public_id (URL): {public_id or '(none)'}")
        print(f"numeric_id (internal): {numeric_id}")
        print(f"title: {title or '(unknown)'}")
        print(f"created_at: {created_at or '(unknown)'}")
        print()

        db = ListingDatabase(config.database_path)
        await db.connect()
        try:
            # contains check BEFORE any insert from this command.
            in_db = await db.contains(numeric_id)
            print("--- database.contains (pre-insert) ---")
            print(f"database.contains({numeric_id!r}) = {in_db}")
            print(f"db_row_count = {await db.count()}")
            print()

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
            )

            print("--- Current poll results ---")
            poll_hits: List[Tuple[str, int, Optional[str]]] = []
            for query in search_queries:
                listings = await client.search(
                    query,
                    limit=config.results_per_query,
                    pages=page_count,
                )
                ids = [listing.id for listing in listings]
                first10 = ids[:10]
                present = numeric_id in set(ids)
                print(
                    f"query={query!r} pages={page_count} organic={len(ids)} "
                    f"first10_ids={first10} contains_target={present}"
                )
                if present:
                    listing = next(item for item in listings if item.id == numeric_id)
                    idx = ids.index(numeric_id)
                    poll_hits.append((query, idx, listing.created_at))
                    print(
                        f"  -> FOUND at index={idx} title={listing.title!r} "
                        f"created_at={listing.created_at} price={listing.price}"
                    )

            in_poll = bool(poll_hits)
            # Re-check contains after polls (polls are read-only; should match).
            in_db_after_poll = await db.contains(numeric_id)
            print()
            print("--- Verdict ---")
            print(f"appears_in_current_poll = {in_poll}")
            print(f"database.contains(id) = {in_db_after_poll}")
            print(
                "unseen_would_be = "
                f"{(not in_db_after_poll) and in_poll}"
            )
            print(
                "reason: "
                + _explain_unseen(
                    in_poll=in_poll,
                    in_db=in_db_after_poll,
                    priming_would_suppress=False,
                )
            )
            if in_db != in_db_after_poll:
                print(
                    "WARNING: database.contains changed during this command "
                    f"({in_db} -> {in_db_after_poll}); unexpected for a "
                    "read-only debug run."
                )
            print()
            print(
                "Note: unseen is computed in DealMonitor._process_listings "
                "BEFORE any SQLite insert. This command does not insert."
            )
        finally:
            await db.close()
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Resolve an OLX offer URL and explain poll/DB unseen status."
    )
    parser.add_argument(
        "url",
        nargs="?",
        default=DEFAULT_URL,
        help=f"OLX offer URL (default: {DEFAULT_URL})",
    )
    parser.add_argument(
        "--config",
        default="config.json",
        help="Path to config.json (default: config.json)",
    )
    parser.add_argument(
        "--pages",
        type=int,
        default=None,
        help="Search pages per query (default: max(pages_per_poll, prime_pages))",
    )
    parser.add_argument(
        "--query",
        action="append",
        dest="queries",
        default=None,
        help="Only poll this search query (repeatable). Default: all config queries.",
    )
    args = parser.parse_args()
    try:
        raise SystemExit(
            asyncio.run(
                run(
                    args.url,
                    args.config,
                    pages=args.pages,
                    queries=args.queries,
                )
            )
        )
    except (FileNotFoundError, ValueError, RuntimeError, aiohttp.ClientError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
