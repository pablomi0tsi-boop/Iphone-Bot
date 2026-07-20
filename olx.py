"""OLX marketplace client.

OLX exposes the JSON API that powers its own web front-end, for example::

    https://www.olx.pl/api/v1/offers/?query=iphone&limit=40&offset=0

This module wraps that endpoint with a small, typed, asynchronous client that
returns normalised :class:`Listing` objects. The base URL is configurable so the
same code works across OLX country domains (``olx.pl``, ``olx.ro``,
``olx.bg`` ...), all of which share the same API shape.

Important real-world behaviours this client accounts for (verified empirically
against the live API):

* **Promoted ads are injected.** Every page mixes paid "promoted"/``top_ad``
  listings into the results at fixed positions. The API reports their indices in
  ``metadata.promoted``; this client drops them by default so the monitor only
  reacts to genuine organic listings and does not waste its page budget on the
  same recycled shop ads.
* **``sort_by=created_at`` is NOT honoured.** The endpoint accepts
  ``sort_by=filter_float_price:asc|desc`` (verified working) but silently ignores
  ``created_at`` ordering and can even surface very old listings first. Because
  there is no reliable server-side "newest first" ordering, this client
  re-sorts every page of results **client-side** by publication timestamp
  (see :func:`listing_sort_key`) before returning, so callers always process
  the newest listing first regardless of API response order. New-listing
  *detection* still relies on de-duplicating every organic result against the
  local database (not on order) -- sorting only affects *processing order*
  within a single poll.

This client therefore raises on transport/HTTP errors so the caller can apply
back-off; only per-offer parsing errors are swallowed.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import aiohttp

# Matches any HTML tag so OLX descriptions (which contain ``<br />`` etc.) can be
# flattened to plain text before keyword/model parsing.
_HTML_TAG_RE = re.compile(r"<[^>]+>")

logger = logging.getLogger(__name__)

__all__ = ["Listing", "OlxClient", "listing_sort_key"]

# Sentinel for listings with a missing/unparseable timestamp: treat them as
# the OLDEST possible listing so they sort to the end, never mistaken for the
# newest (which would happen with, say, ``datetime.max`` or ``None``).
_UNKNOWN_TIMESTAMP = datetime.min.replace(tzinfo=timezone.utc)


def listing_sort_key(listing: "Listing") -> datetime:
    """Parse :attr:`Listing.created_at` into a timezone-aware ``datetime`` for
    newest-first sorting.

    ``created_at`` is populated (see :meth:`OlxClient._parse_offer`) from
    OLX's own ``created_time`` field (the listing's true publication
    timestamp), falling back to ``last_refresh_time`` only when
    ``created_time`` is absent. Both are ISO-8601 strings, e.g.
    ``"2026-07-19T10:00:00+02:00"``.

    Returns :data:`_UNKNOWN_TIMESTAMP` (the oldest possible value) when the
    field is missing or fails to parse, so such listings are never mistaken
    for the newest one.
    """
    value = listing.created_at
    if not value:
        return _UNKNOWN_TIMESTAMP
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return _UNKNOWN_TIMESTAMP
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


@dataclass(slots=True)
class Listing:
    """A single normalised marketplace listing.

    Only the fields the monitor actually needs are kept; the raw OLX payload is
    much larger.
    """

    id: str
    title: str
    price: Optional[float]
    currency: str
    url: str
    created_at: Optional[str] = None
    location: Optional[str] = None
    image_url: Optional[str] = None
    description: str = ""
    photo_count: int = 0
    seller_name: Optional[str] = None
    # ``True``/``False`` when OLX reports the seller type, ``None`` when unknown.
    is_business: Optional[bool] = None
    # High-confidence structured attributes provided by OLX's phone category
    # (may be absent on many listings, in which case they are ``None``).
    model_hint: Optional[str] = None
    storage_hint: Optional[str] = None
    source: str = "olx"

    @property
    def has_price(self) -> bool:
        """Return ``True`` when a numeric price is available."""
        return self.price is not None

    @property
    def search_text(self) -> str:
        """Title + description, lower-cased, for keyword/model/storage parsing."""
        return f"{self.title}\n{self.description}".lower()


class OlxClient:
    """Asynchronous client for the public OLX offers API."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        *,
        base_url: str = "https://www.olx.pl/api/v1/offers/",
        user_agent: str = "Mozilla/5.0 (compatible; PhoneDealBot/1.0)",
        request_timeout: float = 15.0,
        region_id: Optional[int] = None,
        sort_by: Optional[str] = None,
        include_promoted: bool = False,
        extra_params: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Create the client.

        :param session: A shared :class:`aiohttp.ClientSession`.
        :param base_url: OLX offers API endpoint for the target country domain.
        :param user_agent: ``User-Agent`` header sent with every request. OLX
            rejects requests without a browser-like UA.
        :param request_timeout: Per-request timeout in seconds.
        :param region_id: Optional OLX region id to narrow the search.
        :param sort_by: Optional OLX sort key. Only price sorting is honoured by
            the API (``filter_float_price:asc`` / ``filter_float_price:desc``);
            ``created_at`` ordering is ignored server-side. Leave ``None`` to use
            OLX's default ordering, which surfaces fresh listings best.
        :param include_promoted: When ``False`` (default) paid/promoted ads
            reported in ``metadata.promoted`` are filtered out.
        :param extra_params: Optional extra query parameters merged into every
            request (e.g. a category id).
        """
        self._session = session
        self._base_url = base_url
        self._request_timeout = request_timeout
        self._region_id = region_id
        self._sort_by = sort_by or None
        self._include_promoted = include_promoted
        self._extra_params = dict(extra_params or {})
        self._headers = {
            "User-Agent": user_agent,
            "Accept": "application/json",
        }

    async def search(
        self, query: str, *, limit: int = 40, pages: int = 1
    ) -> List[Listing]:
        """Search OLX for ``query`` and return de-duplicated organic listings,
        **sorted newest-first** by publication timestamp.

        Fetches ``pages`` sequential pages of ``limit`` organic results each,
        dropping promoted ads. The API's own response order is NOT
        chronological (``sort_by=created_at`` is ignored server-side -- see
        the module docstring), so this method re-sorts the collected listings
        client-side using :func:`listing_sort_key` (``Listing.created_at``,
        i.e. OLX's ``created_time``/``last_refresh_time``) before returning,
        so callers always process/notify the newest listing first regardless
        of the raw API ordering. The caller is still expected to de-duplicate
        returned ids against persistent storage to discover which are new.

        Raises on transport/HTTP errors (so the caller can back off); individual
        malformed offers are skipped.

        :param query: Free-text search term, e.g. ``"iphone 13"``.
        :param limit: Organic results per page (OLX caps at 40).
        :param pages: How many pages to fetch. More pages widen coverage of new
            listings at the cost of extra requests.
        """
        per_page = max(1, min(limit, 40))
        collected: List[Listing] = []
        seen_ids: Set[str] = set()
        promoted_skipped = 0
        parse_errors = 0
        raw_total = 0

        for page in range(max(1, pages)):
            offers, promoted = await self._fetch_page(query, per_page, page * per_page)
            raw_total += len(offers)
            for index, offer in enumerate(offers):
                if not self._include_promoted and index in promoted:
                    promoted_skipped += 1
                    continue
                try:
                    listing = self._parse_offer(offer)
                except Exception as exc:  # noqa: BLE001 - skip one bad offer only
                    parse_errors += 1
                    logger.warning(
                        "[%s] parse error on OLX offer id=%s: %s",
                        query,
                        offer.get("id") if isinstance(offer, dict) else "?",
                        exc,
                    )
                    continue
                if listing is None:
                    parse_errors += 1
                    logger.warning(
                        "[%s] OLX offer missing an id, skipped: %r",
                        query,
                        offer if isinstance(offer, dict) else offer,
                    )
                    continue
                if listing.id in seen_ids:
                    continue
                seen_ids.add(listing.id)
                collected.append(listing)
            # Last page reached (fewer results than requested).
            if len(offers) < per_page:
                break

        logger.info(
            "[%s] OLX search summary: %d raw offer(s), %d promoted skipped, "
            "%d parse error(s), %d organic listing(s) returned",
            query,
            raw_total,
            promoted_skipped,
            parse_errors,
            len(collected),
        )

        # OLX's response order is not chronological, so impose our own
        # newest-first order using each listing's publication timestamp
        # rather than relying on API response order.
        collected.sort(key=listing_sort_key, reverse=True)
        if collected:
            newest, oldest = collected[0], collected[-1]
            logger.info(
                "[%s] sorted %d listing(s) newest-first by 'created_at' "
                "(OLX 'created_time', falling back to 'last_refresh_time') "
                "-- first=%s id=%s title=%r | last=%s id=%s title=%r",
                query,
                len(collected),
                newest.created_at,
                newest.id,
                newest.title,
                oldest.created_at,
                oldest.id,
                oldest.title,
            )
        return collected

    async def _fetch_page(
        self, query: str, limit: int, offset: int
    ) -> Tuple[List[Dict[str, Any]], Set[int]]:
        """Fetch one raw page, returning ``(offers, promoted_indices)``.

        :raises aiohttp.ClientError: on any transport/HTTP failure.
        """
        params: Dict[str, Any] = {"query": query, "limit": limit, "offset": offset}
        if self._sort_by is not None:
            params["sort_by"] = self._sort_by
        if self._region_id is not None:
            params["region_id"] = self._region_id
        params.update(self._extra_params)

        timeout = aiohttp.ClientTimeout(total=self._request_timeout)
        async with self._session.get(
            self._base_url,
            params=params,
            headers=self._headers,
            timeout=timeout,
        ) as response:
            request_url = response.request_info.url
            logger.info(
                "[%s] OLX request: GET %s -> HTTP %d",
                query,
                request_url,
                response.status,
            )
            response.raise_for_status()
            payload = await response.json(content_type=None)

        if not isinstance(payload, dict):
            # Treat as a hard poll failure so the query loop applies back-off
            # instead of silently recording an empty page.
            raise ValueError(
                f"OLX response was not a JSON object (got {type(payload).__name__})"
            )
        offers = payload.get("data", []) or []
        metadata = payload.get("metadata") or {}
        promoted_raw = metadata.get("promoted") or []
        promoted = {int(i) for i in promoted_raw if isinstance(i, (int, float))}
        logger.info(
            "[%s] OLX page offset=%d: %d offer(s) in response, %d flagged promoted",
            query,
            offset,
            len(offers),
            len(promoted),
        )
        return offers, promoted

    def _parse_offer(self, offer: Dict[str, Any]) -> Optional[Listing]:
        """Convert a raw OLX offer dict into a :class:`Listing`.

        Returns ``None`` when the offer lacks an id (and is therefore unusable
        for de-duplication).
        """
        offer_id = offer.get("id")
        if offer_id is None:
            return None

        params = offer.get("params", [])
        price, currency = self._extract_price(params)
        photos = offer.get("photos")
        business = offer.get("business")
        user = offer.get("user")
        seller_name = user.get("name") if isinstance(user, dict) else None
        return Listing(
            id=str(offer_id),
            title=(offer.get("title") or "").strip(),
            price=price,
            currency=currency,
            url=offer.get("url") or "",
            created_at=offer.get("created_time") or offer.get("last_refresh_time"),
            location=self._extract_location(offer.get("location")),
            image_url=self._extract_image(photos),
            description=self._clean_description(offer.get("description")),
            photo_count=len(photos) if isinstance(photos, list) else 0,
            seller_name=(str(seller_name).strip() if seller_name else None),
            is_business=business if isinstance(business, bool) else None,
            model_hint=self._extract_param_label(params, "phonemodel"),
            storage_hint=self._extract_param_label(params, "builtinmemory_phones"),
        )

    @staticmethod
    def _extract_price(params: Any) -> Tuple[Optional[float], str]:
        """Pull the numeric price and currency out of the OLX ``params`` list.

        OLX represents price as one entry in ``params`` shaped like::

            {"key": "price", "value": {"value": 1500, "currency": "PLN", ...}}

        Free/"swap" listings omit a numeric value, in which case ``(None, "")``
        is returned.
        """
        if not isinstance(params, list):
            return None, ""
        for param in params:
            if not isinstance(param, dict) or param.get("key") != "price":
                continue
            value = param.get("value")
            if not isinstance(value, dict):
                return None, ""
            raw_price = value.get("value")
            currency = value.get("currency") or ""
            try:
                return (float(raw_price) if raw_price is not None else None), currency
            except (TypeError, ValueError):
                return None, currency
        return None, ""

    @staticmethod
    def _clean_description(description: Any) -> str:
        """Flatten an OLX HTML description to plain, single-spaced text."""
        if not isinstance(description, str):
            return ""
        text = _HTML_TAG_RE.sub(" ", description)
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def _extract_param_label(params: Any, key: str) -> Optional[str]:
        """Return the human label of a structured OLX ``select`` param.

        OLX phone listings expose attributes such as ``phonemodel`` and
        ``builtinmemory_phones`` shaped like
        ``{"key": "...", "value": {"key": "128gb", "label": "128GB"}}``.
        These are far more reliable than free-text parsing when present.
        """
        if not isinstance(params, list):
            return None
        for param in params:
            if not isinstance(param, dict) or param.get("key") != key:
                continue
            value = param.get("value")
            if isinstance(value, dict):
                label = value.get("label")
                return str(label) if label else None
            return None
        return None

    @staticmethod
    def _extract_location(location: Any) -> Optional[str]:
        """Build a human-readable ``"City, Region"`` string when possible."""
        if not isinstance(location, dict):
            return None
        parts: List[str] = []
        for key in ("city", "region"):
            node = location.get(key)
            if isinstance(node, dict) and node.get("name"):
                parts.append(str(node["name"]))
        return ", ".join(parts) or None

    @staticmethod
    def _extract_image(photos: Any) -> Optional[str]:
        """Return a usable image URL from the first OLX photo, if any.

        OLX photo links contain ``{width}x{height}`` placeholders which are
        substituted with a sensible default size.
        """
        if not isinstance(photos, list) or not photos:
            return None
        first = photos[0]
        if not isinstance(first, dict):
            return None
        link = first.get("link") or first.get("url")
        if not isinstance(link, str):
            return None
        return link.replace("{width}", "800").replace("{height}", "600")
