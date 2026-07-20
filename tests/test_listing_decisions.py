"""Tests for per-listing SENT/SKIPPED decision logging.

Logging only — filter outcomes must match the existing evaluate() behaviour.
Every listing passed to ``_process_listings`` must emit exactly one final
``LISTING … -> SENT|SKIPPED`` line.

Run directly::

    python tests/test_listing_decisions.py
"""

from __future__ import annotations

import asyncio
import logging
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import AppConfig, DealMonitor  # noqa: E402
from olx import Listing  # noqa: E402
from pricing import PriceBook  # noqa: E402

_DECISION_RE = re.compile(
    r'^LISTING (?P<id>\S+) "(?P<title>.*)"\n  -> (?P<decision>SENT|SKIPPED: .+)$',
    re.MULTILINE,
)


def _config(db_path: str) -> AppConfig:
    return AppConfig(
        webhook_url="",
        discord_username="Bot",
        discord_rate_limit_seconds=0.0,
        olx_base_url="https://example.invalid/api/v1/offers/",
        olx_user_agent="test",
        olx_region_id=None,
        olx_sort_by=None,
        olx_include_promoted=False,
        olx_extra_params={},
        poll_interval_seconds=10,
        jitter_seconds=0,
        max_backoff_seconds=60,
        request_timeout_seconds=5,
        results_per_query=40,
        pages_per_poll=1,
        search_queries=["iphone 13"],
        database_path=db_path,
        stats_interval_seconds=0.0,
        blacklist_keywords=["icloud", "uszkodzony", "zamien"],
        accessory_keywords=["etui", "bateria", "kabel"],
        prime_on_start=False,
        price_book=PriceBook({"iPhone 13": {"128": 1600.0, "256": 1800.0}}),
    )


def _listing(
    listing_id: str,
    title: str,
    *,
    price: float | None = 900.0,
    description: str = "",
    photo_count: int = 1,
    is_business: bool | None = False,
    model_hint: str | None = None,
    storage_hint: str | None = None,
) -> Listing:
    return Listing(
        id=listing_id,
        title=title,
        price=price,
        currency="PLN",
        url=f"https://www.olx.pl/oferta/{listing_id}",
        description=description,
        photo_count=photo_count,
        is_business=is_business,
        model_hint=model_hint,
        storage_hint=storage_hint,
    )


class _LogCapture:
    """Minimal context manager that captures phonedealbot INFO+ log messages."""

    def __init__(self) -> None:
        self.records: list[logging.LogRecord] = []
        self._logger = logging.getLogger("phonedealbot")
        self._handler: logging.Handler | None = None
        self._prev_level: int | None = None

    def __enter__(self) -> "_LogCapture":
        self.records.clear()

        class _Handler(logging.Handler):
            def emit(handler_self, record: logging.LogRecord) -> None:
                self.records.append(record)

        self._handler = _Handler()
        self._prev_level = self._logger.level
        self._logger.setLevel(logging.INFO)
        self._logger.addHandler(self._handler)
        return self

    def __exit__(self, *args: object) -> None:
        assert self._handler is not None
        self._logger.removeHandler(self._handler)
        if self._prev_level is not None:
            self._logger.setLevel(self._prev_level)


def _capture_decisions(caplog: _LogCapture) -> dict[str, str]:
    """Map listing id -> 'SENT' or 'SKIPPED: …' from captured phonedealbot logs."""
    text = "\n".join(record.getMessage() for record in caplog.records)
    found: dict[str, str] = {}
    for match in _DECISION_RE.finditer(text):
        listing_id = match.group("id")
        assert listing_id not in found, f"duplicate decision for {listing_id}"
        found[listing_id] = match.group("decision")
    return found


async def test_every_listing_gets_exactly_one_decision() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "listings.db")
        monitor = DealMonitor(_config(db_path))
        await monitor._db.connect()

        listings = [
            _listing("1", "iPhone 13 128GB", price=900.0),  # already_seen after seed
            _listing("2", "iPhone 13 128GB icloud lock"),  # blacklisted
            _listing("3", "Etui iPhone 13"),  # accessory
            _listing("4", "iPhone 13", price=900.0),  # missing_storage
            _listing("5", "Samsung Galaxy", price=900.0),  # model_not_recognized
            _listing("6", "iPhone 13 128GB", price=None),  # price_not_numeric
            _listing("7", "iPhone 13 128GB", price=0.0),  # invalid_price
            _listing("8", "iPhone 13 128GB", photo_count=0),  # other photos
            _listing("9", "iPhone 13 128GB", is_business=True),  # other business
            _listing("10", "iPhone SE 128GB", price=500.0),  # profit_calculation_failed
        ]

        # Seed id=1 as already seen so the second pass logs already_seen.
        first = [_listing("1", "iPhone 13 128GB", price=900.0)]
        with _LogCapture() as caplog:
            await monitor._process_listings("iphone 13", first, priming=False)
        first_decisions = _capture_decisions(caplog)
        assert first_decisions == {"1": "SENT"}, first_decisions

        with _LogCapture() as caplog2:
            await monitor._process_listings("iphone 13", listings, priming=False)
        decisions = _capture_decisions(caplog2)

        assert set(decisions) == {listing.id for listing in listings}, decisions
        assert decisions["1"] == "SKIPPED: already_seen"
        assert decisions["2"] == "SKIPPED: blacklisted"
        assert decisions["3"] == "SKIPPED: accessory"
        assert decisions["4"] == "SKIPPED: missing_storage"
        assert decisions["5"] == "SKIPPED: model_not_recognized"
        assert decisions["6"] == "SKIPPED: price_not_numeric"
        assert decisions["7"] == "SKIPPED: invalid_price"
        assert decisions["8"] == "SKIPPED: other (no photos attached)"
        assert decisions["9"] == "SKIPPED: other (business/shop account)"
        assert decisions["10"] == "SKIPPED: profit_calculation_failed"
        sent = [lid for lid, decision in decisions.items() if decision == "SENT"]
        assert sent == [], sent

        await monitor._db.close()
        print(
            "PASS: every API listing gets exactly one LISTING decision; "
            "reason codes match filter outcomes"
        )


async def test_sent_and_priming_skip() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "listings.db")
        monitor = DealMonitor(_config(db_path))
        await monitor._db.connect()

        good = _listing("100", "iPhone 13 128GB", price=900.0)

        with _LogCapture() as caplog:
            await monitor._process_listings("iphone 13", [good], priming=True)
        decisions = _capture_decisions(caplog)
        assert decisions == {
            "100": "SKIPPED: other (priming - first cycle, not notified)"
        }, decisions
        assert monitor._queue.empty()

        # After priming mark, same id is already_seen (not re-evaluated as SENT).
        with _LogCapture() as caplog2:
            await monitor._process_listings("iphone 13", [good], priming=False)
        assert _capture_decisions(caplog2) == {"100": "SKIPPED: already_seen"}

        await monitor._db.close()

        # Fresh DB: non-priming notifies and logs SENT.
        db_path2 = str(Path(tmp) / "listings2.db")
        monitor2 = DealMonitor(_config(db_path2))
        await monitor2._db.connect()
        with _LogCapture() as caplog3:
            await monitor2._process_listings("iphone 13", [good], priming=False)
        assert _capture_decisions(caplog3) == {"100": "SENT"}
        assert monitor2._queue.qsize() == 1
        await monitor2._db.close()
        print("PASS: priming logs SKIPPED other(…); normal path logs SENT")


async def test_evaluate_behaviour_unchanged() -> None:
    """Public evaluate() still returns deal/None with the same outcomes."""
    with tempfile.TemporaryDirectory() as tmp:
        monitor = DealMonitor(_config(str(Path(tmp) / "x.db")))
        assert monitor.evaluate(_listing("a", "iPhone 13 128GB", price=900.0)) is not None
        assert monitor.evaluate(_listing("b", "iPhone 13 icloud")) is None
        assert monitor.evaluate(_listing("c", "Etui na iPhone 13")) is None
        assert monitor.evaluate(_listing("d", "iPhone 13", price=900.0)) is None
        assert monitor.evaluate(_listing("e", "iPhone 13 128GB", price=None)) is None
        assert monitor.evaluate(_listing("f", "iPhone 13 128GB", price=0)) is None
        print("PASS: evaluate() outcomes unchanged")


async def _main() -> None:
    await test_evaluate_behaviour_unchanged()
    await test_sent_and_priming_skip()
    await test_every_listing_gets_exactly_one_decision()
    print("\nALL LISTING-DECISION TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(_main())
