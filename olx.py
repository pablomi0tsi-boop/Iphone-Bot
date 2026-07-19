"""OLX marketplace client.

Historically this project polled the unofficial JSON endpoint
``/api/v1/offers/``. Empirically that endpoint:

* **Ignores ``sort_by=created_at:*``** — results track ``last_refresh_time``
  (bumps) rather than true publication time, so brand-new listings are easy to
  miss among refreshed older ads.
* Can disagree with what the public website shows for the same query.

The website search HTML embeds the exact listing payload the UI renders inside
``window.__PRERENDERED_STATE__``. This client fetches that page (the same view
users see), parses the prerendered ``ads`` array, drops promoted cards, and
returns normalised :class:`Listing` objects. Detection still relies on SQLite
de-duplication because OLX does not expose a reliable push/newest-first feed.

Raises on transport/HTTP errors so the caller can apply back-off; only
per-offer parsing errors are swallowed.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Set
from urllib.parse import quote, urljoin

import aiohttp

# Matches any HTML tag so OLX descriptions (which contain ``<br />`` etc.) can be
# flattened to plain text before keyword/model/storage parsing.
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_PRERENDERED_ASSIGN_RE = re.compile(
    r"window\.__PRERENDERED_STATE__\s*=\s*",
)
_PRERENDERED_STRING_RE = re.compile(r'^("(?:\\.|[^"\\])*")\s*;', re.S)

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
    """Asynchronous client that reads OLX website search prerendered state."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        *,
        base_url: str = "https://www.olx.pl/",
        user_agent: str = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        request_timeout: float = 15.0,
        region_id: Optional[int] = None,
        sort_by: Optional[str] = None,
        include_promoted: bool = False,
        extra_params: Optional[Dict[str, Any]] = None,
        search_path_prefix: str = "elektronika/telefony",
    ) -> None:
        """Create the client.

        :param session: A shared :class:`aiohttp.ClientSession`.
        :param base_url: OLX website origin (e.g. ``https://www.olx.pl/``).
            Legacy ``.../api/v1/offers/`` values are normalised to the site root.
        :param user_agent: Browser-like ``User-Agent`` (required by OLX).
        :param request_timeout: Per-request timeout in seconds.
        :param region_id: Optional region id appended as a query param when set.
        :param sort_by: Requested order, mapped to ``search[order]`` (default
            ``created_at:desc``). OLX often still ranks by last refresh; we log
            that and rely on DB de-dup.
        :param include_promoted: When ``False`` (default) promoted cards
            (``searchReason == "promoted"`` / ``isPromoted is True``) are dropped.
        :param extra_params: Extra query-string params merged into every request.
        :param search_path_prefix: Optional category path prefix before
            ``q-<query>/`` (default phones category).
        """
        self._session = session
        self._base_url = self._normalize_site_base(base_url)
        self._request_timeout = request_timeout
        self._region_id = region_id
        self._sort_by = sort_by or "created_at:desc"
        self._include_promoted = include_promoted
        self._extra_params = dict(extra_params or {})
        self._search_path_prefix = (search_path_prefix or "").strip().strip("/")
        self._headers = {
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,application/json",
            "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
        }
        self._logged_sort_check = False

    @staticmethod
    def _normalize_site_base(base_url: str) -> str:
        """Accept either a site origin or a legacy API offers URL."""
        text = (base_url or "https://www.olx.pl/").strip()
        if "/api/v1/offers" in text:
            # Legacy config pointed at the incomplete JSON endpoint.
            text = text.split("/api/v1/offers", 1)[0] + "/"
        if not text.endswith("/"):
            text += "/"
        return text

    async def search(
        self, query: str, *, limit: int = 40, pages: int = 1
    ) -> List[Listing]:
        """Search OLX for ``query`` and return de-duplicated organic listings.

        Fetches ``pages`` of website search HTML, parses
        ``window.__PRERENDERED_STATE__``, and drops promoted ads. The caller
        must de-duplicate returned ids against persistent storage.

        :param query: Free-text search term, e.g. ``"iphone 13"``.
        :param limit: Soft per-page cap (website pages are typically ~40 organic).
        :param pages: How many result pages to fetch.
        """
        collected: List[Listing] = []
        seen_ids: Set[str] = set()

        for page in range(max(1, pages)):
            ads = await self._fetch_page_ads(query, page=page)
            page_listings: List[Listing] = []
            for ad in ads:
                if not self._include_promoted and self._is_promoted(ad):
                    continue
                try:
                    listing = self._parse_ad(ad)
                except Exception as exc:  # noqa: BLE001 - skip one bad offer only
                    logger.debug("Skipping malformed OLX ad: %s", exc)
                    continue
                if listing is None or listing.id in seen_ids:
                    continue
                seen_ids.add(listing.id)
                collected.append(listing)

            if page == 0:
                first_ids = [listing.id for listing in collected[:10]]
                logger.info(
                    "OLX poll IDs | query=%r | source=website-prerendered | "
                    "sort_by=%s | first10_ids=%s | organic_total_so_far=%d",
                    query,
                    self._sort_by,
                    first_ids,
                    len(collected),
                )
                self._verify_newest_first(query, collected[:40])

            # Empty page ⇒ stop.
            if not ads:
                break

        logger.debug(
            "OLX query %r returned %d organic listing(s) via website SSR",
            query,
            len(collected),
        )
        return collected

    def _search_url(self, query: str, *, page: int) -> str:
        """Build the public website search URL for ``query`` / ``page``."""
        slug = re.sub(r"\s+", "-", query.strip().lower())
        slug = quote(slug, safe="-")
        if self._search_path_prefix:
            path = f"{self._search_path_prefix}/q-{slug}/"
        else:
            path = f"q-{slug}/"
        return urljoin(self._base_url, path)

    async def _fetch_page_ads(self, query: str, *, page: int) -> List[Dict[str, Any]]:
        """Fetch one website search page and return its prerendered ``ads``."""
        params: Dict[str, Any] = {
            # Website query key; friendly-links maps this to sort_by server-side.
            "search[order]": self._sort_by,
        }
        if page > 0:
            # Website pages are 1-based in the query string.
            params["page"] = page + 1
        if self._region_id is not None:
            params["search[region_id]"] = self._region_id
        params.update(self._extra_params)

        timeout = aiohttp.ClientTimeout(total=self._request_timeout)
        url = self._search_url(query, page=page)
        async with self._session.get(
            url,
            params=params,
            headers=self._headers,
            timeout=timeout,
        ) as response:
            response.raise_for_status()
            html = await response.text()

        state = self._extract_prerendered_state(html)
        listing = (
            (state.get("listing") or {}).get("listing")
            if isinstance(state, dict)
            else None
        )
        if not isinstance(listing, dict):
            logger.warning(
                "OLX prerendered state missing listing payload for query=%r page=%d",
                query,
                page,
            )
            return []
        ads = listing.get("ads") or []
        if not isinstance(ads, list):
            return []
        return [ad for ad in ads if isinstance(ad, dict)]

    @staticmethod
    def _extract_prerendered_state(html: str) -> Dict[str, Any]:
        """Parse ``window.__PRERENDERED_STATE__ = "<json-string>";`` from HTML."""
        assign = _PRERENDERED_ASSIGN_RE.search(html)
        if not assign:
            raise ValueError("window.__PRERENDERED_STATE__ not found in OLX HTML")
        match = _PRERENDERED_STRING_RE.match(html[assign.end() :])
        if not match:
            raise ValueError("Could not parse __PRERENDERED_STATE__ string literal")
        # The page assigns a JSON-encoded string; decode twice.
        return json.loads(json.loads(match.group(1)))

    @staticmethod
    def _is_promoted(ad: Dict[str, Any]) -> bool:
        """Return ``True`` for paid/promoted cards mixed into search results."""
        if ad.get("searchReason") == "promoted":
            return True
        if ad.get("isPromoted") is True:
            return True
        return False

    def _verify_newest_first(self, query: str, listings: List[Listing]) -> None:
        """Log whether organic results are newest-first by ``created_at``."""
        times: List[datetime] = []
        for listing in listings:
            raw = listing.created_at
            if not raw:
                continue
            text = str(raw).strip()
            if text.endswith("Z"):
                text = text[:-1] + "+00:00"
            try:
                times.append(datetime.fromisoformat(text))
            except ValueError:
                continue
        newest_first = (
            all(times[i] >= times[i + 1] for i in range(len(times) - 1))
            if len(times) > 1
            else True
        )
        log = logger.info if not self._logged_sort_check else logger.debug
        log(
            "OLX sort check | query=%r | sort_by=%s | source=website-prerendered | "
            "organic=%d | created_newest_first=%s | first_created=%s | "
            "last_created=%s",
            query,
            self._sort_by,
            len(listings),
            newest_first,
            times[0].isoformat() if times else None,
            times[-1].isoformat() if times else None,
        )
        if not self._logged_sort_check:
            self._logged_sort_check = True
            if not newest_first:
                logger.warning(
                    "OLX website search did not rank by created_at for sort_by=%r "
                    "(typically last_refresh order). New-listing detection relies "
                    "on SQLite de-duplication against the website result set.",
                    self._sort_by,
                )

    def _parse_ad(self, ad: Dict[str, Any]) -> Optional[Listing]:
        """Convert a prerendered website ad dict into a :class:`Listing`."""
        offer_id = ad.get("id")
        if offer_id is None:
            return None

        params = ad.get("params", [])
        price, currency = self._extract_price(ad)
        photos = ad.get("photos")
        business = ad.get("isBusiness")
        if business is None:
            business = ad.get("business")
        user = ad.get("user")
        seller_name = user.get("name") if isinstance(user, dict) else None
        url = ad.get("url") or ad.get("urlPath") or ""
        if url and url.startswith("/"):
            url = urljoin(self._base_url, url.lstrip("/"))

        return Listing(
            id=str(offer_id),
            title=(ad.get("title") or "").strip(),
            price=price,
            currency=currency,
            url=url,
            # Publication time only — never fall back to lastRefreshTime.
            created_at=ad.get("createdTime") or ad.get("created_time"),
            location=self._extract_location(ad.get("location")),
            image_url=self._extract_image(photos),
            description=self._clean_description(ad.get("description")),
            photo_count=len(photos) if isinstance(photos, list) else 0,
            seller_name=(str(seller_name).strip() if seller_name else None),
            is_business=business if isinstance(business, bool) else None,
            model_hint=self._extract_param_label(params, "phonemodel"),
            storage_hint=self._extract_param_label(params, "builtinmemory_phones"),
        )

    @staticmethod
    def _extract_price(ad: Dict[str, Any]) -> tuple[Optional[float], str]:
        """Extract price from SSR ``price.regularPrice`` or legacy params."""
        price_obj = ad.get("price")
        if isinstance(price_obj, dict):
            regular = price_obj.get("regularPrice")
            if isinstance(regular, dict):
                raw = regular.get("value")
                currency = regular.get("currencyCode") or ""
                try:
                    return (
                        float(raw) if raw is not None else None
                    ), str(currency)
                except (TypeError, ValueError):
                    pass
            if price_obj.get("free") or price_obj.get("exchange"):
                return None, ""

        # Legacy /api/v1/offers shape fallback.
        params = ad.get("params")
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
                return (
                    float(raw_price) if raw_price is not None else None
                ), currency
            except (TypeError, ValueError):
                return None, currency
        return None, ""

    @staticmethod
    def _clean_description(description: Any) -> str:
        """Strip HTML tags from an OLX description and normalise whitespace."""
        if not description:
            return ""
        text = _HTML_TAG_RE.sub(" ", str(description))
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def _extract_location(location: Any) -> Optional[str]:
        """Build a short ``City, Region`` label from API or SSR location objects."""
        if not isinstance(location, dict):
            return None
        # Website SSR shape.
        path_name = location.get("pathName")
        if isinstance(path_name, str) and path_name.strip():
            return path_name.strip()
        city = location.get("cityName")
        region = location.get("regionName")
        if city or region:
            return ", ".join(part for part in (city, region) if part)

        # Legacy API shape: location.city.name / location.region.name
        city_obj = location.get("city")
        region_obj = location.get("region")
        city_name = city_obj.get("name") if isinstance(city_obj, dict) else None
        region_name = region_obj.get("name") if isinstance(region_obj, dict) else None
        if city_name or region_name:
            return ", ".join(part for part in (city_name, region_name) if part)
        return None

    @staticmethod
    def _extract_image(photos: Any) -> Optional[str]:
        """Return the first photo URL from SSR string lists or API photo objects."""
        if not isinstance(photos, list) or not photos:
            return None
        first = photos[0]
        if isinstance(first, str) and first.strip():
            # SSR URLs often append ";s=WxH" — strip for a clean asset URL.
            return first.split(";", 1)[0]
        if isinstance(first, dict):
            link = first.get("link") or first.get("url")
            if isinstance(link, str) and link.strip():
                return link.replace("{width}", "1000").replace("{height}", "1000")
        return None

    @staticmethod
    def _extract_param_label(params: Any, key: str) -> Optional[str]:
        """Return the display label for a structured param ``key``, if present."""
        if not isinstance(params, list):
            return None
        for param in params:
            if not isinstance(param, dict) or param.get("key") != key:
                continue
            # Website SSR: label lives directly on ``value`` (string).
            value = param.get("value")
            if isinstance(value, str) and value.strip():
                return value.strip()
            # Legacy API: value is ``{"key": ..., "label": ...}``.
            if isinstance(value, dict):
                label = value.get("label") or value.get("key")
                if label:
                    return str(label).strip()
        return None
