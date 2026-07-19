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
  there is no reliable "newest first" ordering, detection relies on de-duplicating
  every organic result against the local database rather than trusting order.

This client therefore raises on transport/HTTP errors so the caller can apply
back-off; only per-offer parsing errors are swallowed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple

import aiohttp

logger = logging.getLogger(__name__)

__all__ = ["Listing", "OlxClient"]


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
    source: str = "olx"

    @property
    def has_price(self) -> bool:
        """Return ``True`` when a numeric price is available."""
        return self.price is not None


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
        """Search OLX for ``query`` and return de-duplicated organic listings.

        Fetches ``pages`` sequential pages of ``limit`` organic results each,
        dropping promoted ads. Because the API provides no reliable chronological
        order, the caller is expected to de-duplicate returned ids against
        persistent storage to discover which listings are new.

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

        for page in range(max(1, pages)):
            offers, promoted = await self._fetch_page(query, per_page, page * per_page)
            for index, offer in enumerate(offers):
                if not self._include_promoted and index in promoted:
                    continue
                try:
                    listing = self._parse_offer(offer)
                except Exception as exc:  # noqa: BLE001 - skip one bad offer only
                    logger.debug("Skipping malformed OLX offer: %s", exc)
                    continue
                if listing is None or listing.id in seen_ids:
                    continue
                seen_ids.add(listing.id)
                collected.append(listing)
            # Last page reached (fewer results than requested).
            if len(offers) < per_page:
                break

        logger.debug("OLX query %r returned %d organic listing(s)", query, len(collected))
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
            response.raise_for_status()
            payload = await response.json(content_type=None)

        if not isinstance(payload, dict):
            return [], set()
        offers = payload.get("data", []) or []
        metadata = payload.get("metadata") or {}
        promoted_raw = metadata.get("promoted") or []
        promoted = {int(i) for i in promoted_raw if isinstance(i, (int, float))}
        return offers, promoted

    def _parse_offer(self, offer: Dict[str, Any]) -> Optional[Listing]:
        """Convert a raw OLX offer dict into a :class:`Listing`.

        Returns ``None`` when the offer lacks an id (and is therefore unusable
        for de-duplication).
        """
        offer_id = offer.get("id")
        if offer_id is None:
            return None

        price, currency = self._extract_price(offer.get("params", []))
        return Listing(
            id=str(offer_id),
            title=(offer.get("title") or "").strip(),
            price=price,
            currency=currency,
            url=offer.get("url") or "",
            created_at=offer.get("created_time") or offer.get("last_refresh_time"),
            location=self._extract_location(offer.get("location")),
            image_url=self._extract_image(offer.get("photos")),
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
