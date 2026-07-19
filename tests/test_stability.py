"""Stability / production-readiness tests.

Covers behaviour that is not about business logic but about the app surviving
real-world failure modes: database auto-creation & corruption recovery, config
validation, graceful empty-webhook handling, and Discord timeout retries.

Run directly::

    python tests/test_stability.py
"""

from __future__ import annotations

import asyncio
import json
import sys
import tempfile
from pathlib import Path

import aiohttp

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import ListingDatabase  # noqa: E402
from discord import DiscordNotifier  # noqa: E402
from main import load_config  # noqa: E402
from olx import Listing  # noqa: E402


# --------------------------------------------------------------------------- #
# Database: auto-create + corruption recovery
# --------------------------------------------------------------------------- #
async def test_db_creates_nested_path() -> None:
    """The database file (and any missing parent dirs) is created on connect."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "nested" / "dir" / "listings.db"
        db = ListingDatabase(str(path))
        await db.connect()
        try:
            assert path.exists(), "database file should be created automatically"
            assert await db.count() == 0
        finally:
            await db.close()
    print("PASS: database + parent directories created automatically")


async def test_db_recovers_from_corruption() -> None:
    """A corrupt database file is quarantined and recreated instead of crashing."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "listings.db"
        path.write_bytes(b"this is not a valid sqlite database at all")
        db = ListingDatabase(str(path))
        await db.connect()  # must not raise
        try:
            assert await db.count() == 0  # fresh, usable database
            await db.mark_seen_many([("1", "olx", "t", 1.0, "u", False)])
            assert await db.count() == 1
        finally:
            await db.close()
        corrupt = list(Path(tmp).glob("listings.db.corrupt-*"))
        assert corrupt, "corrupt file should have been quarantined"
    print("PASS: corrupt database is quarantined and recreated")


# --------------------------------------------------------------------------- #
# Config validation
# --------------------------------------------------------------------------- #
_VALID_CONFIG = {
    "olx": {"search_queries": ["iphone 13"]},
    "resale_prices": {"iPhone 13": {"128": 900}},
}


def _write_config(tmp: str, data: dict) -> str:
    path = Path(tmp) / "config.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return str(path)


def test_config_defaults() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cfg = load_config(_write_config(tmp, _VALID_CONFIG))
        assert not hasattr(cfg, "minimum_profit")  # filter removed by design
        assert cfg.poll_interval_seconds == 10
        assert cfg.stats_interval_seconds == 600
        assert cfg.price_book.lookup("iPhone 13", 128) == 900.0
    print("PASS: config defaults (no minimum-profit filter)")


def test_config_rejects_invalid_json() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "config.json"
        path.write_text("{ not valid json", encoding="utf-8")
        try:
            load_config(str(path))
        except ValueError as exc:
            assert "valid JSON" in str(exc), exc
        else:
            raise AssertionError("invalid JSON should raise ValueError")
    print("PASS: invalid JSON raises a clear ValueError")


def test_config_rejects_bad_values() -> None:
    checks = [
        ({**_VALID_CONFIG, "olx": {"search_queries": ["x"], "poll_interval_seconds": 0}},
         "poll_interval_seconds"),
        ({**_VALID_CONFIG, "resale_prices": {}}, "resale_prices"),
        ({"resale_prices": {"iPhone 13": {"128": 900}}, "olx": {"search_queries": []}},
         "search_queries"),
        ({**_VALID_CONFIG, "olx": {"search_queries": ["x"], "request_timeout_seconds": -5}},
         "request_timeout_seconds"),
    ]
    with tempfile.TemporaryDirectory() as tmp:
        for data, needle in checks:
            try:
                load_config(_write_config(tmp, data))
            except ValueError as exc:
                assert needle in str(exc), f"{needle} not in {exc}"
            else:
                raise AssertionError(f"expected ValueError mentioning {needle}")
    print("PASS: invalid config values raise clear ValueErrors")


def test_config_rejects_bad_resale_prices() -> None:
    bad = {"olx": {"search_queries": ["x"]},
           "resale_prices": {"iPhone 13": {"999": 900}}}  # 999 not a valid capacity
    with tempfile.TemporaryDirectory() as tmp:
        try:
            load_config(_write_config(tmp, bad))
        except ValueError as exc:
            assert "resale_prices" in str(exc) or "storage" in str(exc), exc
        else:
            raise AssertionError("bad resale storage should raise ValueError")
    print("PASS: malformed resale_prices raises ValueError")


# --------------------------------------------------------------------------- #
# Discord: empty webhook + timeout retry
# --------------------------------------------------------------------------- #
def _listing() -> Listing:
    return Listing(id="1", title="iPhone 13", price=1200.0, currency="PLN",
                   url="https://olx.pl/x", photo_count=3)


async def test_discord_dry_run_when_empty_webhook() -> None:
    async with aiohttp.ClientSession() as session:
        notifier = DiscordNotifier(session, webhook_url="")
        assert notifier.enabled is False
        ok = await notifier.send_deal(
            _listing(), resale_price=1900, profit=700, model="iPhone 13", storage_gb=128
        )
        assert ok is True  # dry-run counts as success, never raises
    print("PASS: empty webhook -> graceful dry-run, no crash")


async def test_discord_retries_on_timeout() -> None:
    """A timeout is retried (not fatal); after 3 failures send_deal returns False."""
    attempts = 0

    class _TimeoutSession:
        def post(self, *args, **kwargs):
            raise asyncio.TimeoutError("simulated timeout")

    # Patch the notifier's session with one whose post() times out.
    async with aiohttp.ClientSession() as real:
        notifier = DiscordNotifier(
            real, webhook_url="https://example.com/webhook", rate_limit_seconds=0.0
        )

        def _post(*args, **kwargs):
            nonlocal attempts
            attempts += 1
            raise asyncio.TimeoutError("simulated timeout")

        notifier._session = type("S", (), {"post": staticmethod(_post)})()
        ok = await notifier.send_deal(
            _listing(), resale_price=1900, profit=700, model="iPhone 13", storage_gb=128
        )
        assert ok is False, "should give up gracefully after retries"
        assert attempts == 3, f"expected 3 attempts, got {attempts}"
    print("PASS: Discord timeouts are retried then fail gracefully")


async def _main() -> None:
    await test_db_creates_nested_path()
    await test_db_recovers_from_corruption()
    test_config_defaults()
    test_config_rejects_invalid_json()
    test_config_rejects_bad_values()
    test_config_rejects_bad_resale_prices()
    await test_discord_dry_run_when_empty_webhook()
    await test_discord_retries_on_timeout()
    print("\nALL STABILITY TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(_main())
