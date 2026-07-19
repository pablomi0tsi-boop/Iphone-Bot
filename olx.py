"""OLX marketplace client.

OLX exposes a JSON API used by its own web front-end, for example::

    https://www.olx.pl/api/v1/offers/?query=iphone&limit=40&sort_by=created_at%3Adesc

This module wraps that endpoint with a small, typed, asynchronous client that
returns normalised :class:`Listing` objects. The base URL is configurable so the
same code works across OLX country domains (``olx.pl``, ``olx.ro``,
``olx.bg`` ...), all of which share the same API shape.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

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
        request_timeout: float = 20.0,
        region_id: Optional[int] = None,
        extra_params: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Create the client.

        :param session: A shared :class:`aiohttp.ClientSession`.
        :param base_url: OLX offers API endpoint for the target country domain.
        :param user_agent: ``User-Agent`` header sent with every request. OLX
            rejects requests without a browser-like UA.
        :param request_timeout: Per-request timeout in seconds.
        :param region_id: Optional OLX region id to narrow the search.
        :param extra_params: Optional extra query parameters merged into every
            request (e.g. category id or a custom sort).
        """
        self._session = session
        self._base_url = base_url
        self._request_timeout = request_timeout
        self._region_id = region_id
        self._extra_params = dict(extra_params or {})
        self._headers = {
            "User-Agent": user_agent,
            "Accept": "application/json",
        }

    async def search(self, query: str, *, limit: int = 40) -> List[Listing]:
        """Search OLX for ``query`` and return the newest listings first.

        Network and decoding errors are logged and swallowed (an empty list is
        returned) so a transient failure never crashes the polling loop.

        :param query: Free-text search term, e.g. ``"iphone 13"``.
        :param limit: Maximum number of offers to request (OLX caps at 40).
        """
        params: Dict[str, Any] = {
            "query": query,
            "limit": max(1, min(limit, 40)),
            "offset": 0,
            "sort_by": "created_at:desc",
        }
        if self._region_id is not None:
            params["region_id"] = self._region_id
        params.update(self._extra_params)

        timeout = aiohttp.ClientTimeout(total=self._request_timeout)
        try:
            async with self._session.get(
                self._base_url,
                params=params,
                headers=self._headers,
                timeout=timeout,
            ) as response:
                response.raise_for_status()
                payload = await response.json(content_type=None)
        except aiohttp.ClientError as exc:
            logger.warning("OLX request failed for query %r: %s", query, exc)
            return []
        except Exception as exc:  # noqa: BLE001 - defensive: never crash the loop
            logger.warning("Unexpected error parsing OLX response for %r: %s", query, exc)
            return []

        offers = payload.get("data", []) if isinstance(payload, dict) else []
        listings: List[Listing] = []
        for offer in offers:
            listing = self._parse_offer(offer)
            if listing is not None:
                listings.append(listing)
        logger.debug("OLX query %r returned %d listings", query, len(listings))
        return listings

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
    def _extract_price(params: Any) -> tuple[Optional[float], str]:
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
