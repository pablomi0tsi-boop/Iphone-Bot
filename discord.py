"""Discord webhook notifier.

Sends rich embed notifications about profitable listings to a Discord channel
via an incoming webhook URL. Uses :mod:`aiohttp` directly (no heavyweight
Discord library needed for webhooks) and cooperates with Discord's rate limits.

Note: this module is intentionally named ``discord.py`` to match the requested
project layout. It does **not** depend on the third-party ``discord.py``
package; everything here is plain webhook HTTP.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Optional

import aiohttp

if TYPE_CHECKING:  # avoid import cost / any risk of cycles at runtime
    from olx import Listing

logger = logging.getLogger(__name__)

__all__ = ["DiscordNotifier"]

# Discord green for "good deal" embeds.
_EMBED_COLOR = 0x2ECC71


class DiscordNotifier:
    """Post profitable-deal notifications to a Discord webhook."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        *,
        webhook_url: str,
        username: str = "Phone Deal Bot",
        avatar_url: Optional[str] = None,
        rate_limit_seconds: float = 1.0,
        request_timeout: float = 15.0,
    ) -> None:
        """Create the notifier.

        :param session: Shared :class:`aiohttp.ClientSession`.
        :param webhook_url: Discord webhook URL. If empty, notifications are
            logged instead of sent (useful for dry runs / local testing).
        :param username: Display name shown for the webhook message.
        :param avatar_url: Optional avatar override for the webhook message.
        :param rate_limit_seconds: Minimum delay enforced between messages to
            stay well under Discord's webhook rate limits.
        :param request_timeout: Per-request timeout in seconds.
        """
        self._session = session
        self._webhook_url = webhook_url
        self._username = username
        self._avatar_url = avatar_url
        self._rate_limit_seconds = rate_limit_seconds
        self._request_timeout = request_timeout
        self._send_lock = asyncio.Lock()
        self._last_sent_at = 0.0

    @property
    def enabled(self) -> bool:
        """Return ``True`` when a webhook URL is configured."""
        return bool(self._webhook_url)

    async def send_deal(
        self,
        listing: "Listing",
        *,
        expected_profit: float,
        max_buy_price: float,
    ) -> bool:
        """Send a formatted notification for a profitable ``listing``.

        :param listing: The listing that matched.
        :param expected_profit: Estimated profit computed by the monitor.
        :param max_buy_price: Configured maximum buy price for this target.
        :returns: ``True`` if the message was accepted by Discord, else
            ``False``. Dry-run (no webhook configured) counts as success.
        """
        payload = self._build_payload(listing, expected_profit, max_buy_price)

        if not self.enabled:
            logger.info(
                "[dry-run] Would notify: %s | price=%s%s | profit=%.2f | %s",
                listing.title,
                listing.price,
                listing.currency,
                expected_profit,
                listing.url,
            )
            return True

        return await self._post(payload)

    def _build_payload(
        self,
        listing: "Listing",
        expected_profit: float,
        max_buy_price: float,
    ) -> dict:
        """Construct the Discord webhook JSON payload with a rich embed."""
        currency = f" {listing.currency}" if listing.currency else ""
        price_text = (
            f"{listing.price:.2f}{currency}" if listing.has_price else "n/a"
        )
        fields = [
            {"name": "Price", "value": price_text, "inline": True},
            {
                "name": "Max buy",
                "value": f"{max_buy_price:.2f}{currency}",
                "inline": True,
            },
            {
                "name": "Est. profit",
                "value": f"{expected_profit:.2f}{currency}",
                "inline": True,
            },
        ]
        if listing.location:
            fields.append(
                {"name": "Location", "value": listing.location, "inline": False}
            )

        embed: dict = {
            "title": listing.title or "New listing",
            "url": listing.url or None,
            "color": _EMBED_COLOR,
            "fields": fields,
            "footer": {"text": f"Source: {listing.source.upper()}"},
        }
        if listing.image_url:
            embed["thumbnail"] = {"url": listing.image_url}
        if listing.created_at:
            embed["timestamp"] = listing.created_at

        payload: dict = {
            "username": self._username,
            "embeds": [embed],
        }
        if self._avatar_url:
            payload["avatar_url"] = self._avatar_url
        return payload

    async def _post(self, payload: dict) -> bool:
        """POST ``payload`` to the webhook, honouring rate limits and 429s."""
        timeout = aiohttp.ClientTimeout(total=self._request_timeout)
        # Serialise sends and enforce a minimum gap between them.
        async with self._send_lock:
            await self._respect_rate_limit()
            for attempt in range(3):
                try:
                    async with self._session.post(
                        self._webhook_url,
                        json=payload,
                        timeout=timeout,
                    ) as response:
                        if response.status == 429:
                            retry_after = await self._retry_after(response)
                            logger.warning(
                                "Discord rate limited; retrying in %.2fs", retry_after
                            )
                            await asyncio.sleep(retry_after)
                            continue
                        response.raise_for_status()
                        self._last_sent_at = asyncio.get_event_loop().time()
                        return True
                except aiohttp.ClientError as exc:
                    logger.warning(
                        "Discord webhook post failed (attempt %d/3): %s",
                        attempt + 1,
                        exc,
                    )
                    await asyncio.sleep(2 ** attempt)
            logger.error("Giving up on Discord notification after 3 attempts")
            return False

    async def _respect_rate_limit(self) -> None:
        """Sleep just long enough to honour ``rate_limit_seconds``."""
        if self._rate_limit_seconds <= 0:
            return
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_sent_at
        if elapsed < self._rate_limit_seconds:
            await asyncio.sleep(self._rate_limit_seconds - elapsed)

    @staticmethod
    async def _retry_after(response: aiohttp.ClientResponse) -> float:
        """Extract Discord's suggested retry delay from a 429 response."""
        try:
            body = await response.json(content_type=None)
            if isinstance(body, dict) and "retry_after" in body:
                return float(body["retry_after"])
        except Exception:  # noqa: BLE001 - fall back to header/default
            pass
        header = response.headers.get("Retry-After")
        if header:
            try:
                return float(header)
            except ValueError:
                pass
        return 1.0
