"""Unit tests for :func:`main._compile_keyword_patterns` /
:meth:`main.DealMonitor.has_filtered_keyword`.

These cover the root-cause bug that silently blocked the vast majority of
real, profitable OLX listings: accessory keywords (``etui``, ``bateria``,
``kabel``, ...) were checked against the full description, which routinely
contains ordinary phrases like "bateria 89%" or "dorzucam etui" on genuine
phone sales. A second, related bug let a blacklist keyword match inside a
negated/prefixed word, e.g. ``"uszkodzony"`` (damaged) matching inside
``"nieuszkodzony"`` (**not** damaged), or ``"locked"`` inside ``"unlocked"``.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import AppConfig, DealMonitor  # noqa: E402
from olx import Listing  # noqa: E402
from pricing import PriceBook  # noqa: E402


def _listing(title: str, description: str = "") -> Listing:
    return Listing(
        id="1",
        title=title,
        price=1000.0,
        currency="PLN",
        url="https://olx.pl/o/1",
        description=description,
        photo_count=1,
    )


def _monitor() -> DealMonitor:
    config = AppConfig(
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
        database_path=":memory:",
        minimum_profit=300.0,
        stats_interval_seconds=0.0,
        blacklist_keywords=["icloud", "uszkodzony", "locked", "zamiana"],
        accessory_keywords=["etui", "bateria", "kabel", "case"],
        prime_on_start=True,
        price_book=PriceBook({"iPhone 13": {"128": 1900}}),
    )
    return DealMonitor(config)


def test_accessory_keywords_ignored_in_description() -> None:
    """A normal phone sale mentioning battery health / bundled extras in the
    DESCRIPTION must not be treated as an accessory-only listing."""
    monitor = _monitor()
    listing = _listing(
        "iPhone 13 128GB super stan",
        description="Bateria 89% kondycji. Dorzucam etui i kabel w zestawie.",
    )
    assert monitor.has_filtered_keyword(listing) is False
    print("PASS: accessory keywords in the description do not block a real sale")


def test_accessory_keyword_in_title_still_filtered() -> None:
    """A genuine accessory-only ad names the accessory in the title."""
    monitor = _monitor()
    listing = _listing("Etui iPhone 13 128GB oryginalne")
    assert monitor.has_filtered_keyword(listing) is True
    print("PASS: accessory keyword in the title is still filtered")


def test_blacklist_keyword_checked_in_description_too() -> None:
    """Blacklist keywords (real disqualifiers) are still checked everywhere."""
    monitor = _monitor()
    listing = _listing("iPhone 13 128GB", description="Telefon zablokowany, icloud")
    assert monitor.has_filtered_keyword(listing) is True
    print("PASS: blacklist keywords still checked against the description")


def test_negated_word_does_not_false_match() -> None:
    """"nieuszkodzony" (undamaged) must not match "uszkodzony" (damaged);
    "unlocked" must not match "locked"."""
    monitor = _monitor()
    ok_pl = _listing("iPhone 13 128GB", description="Telefon nieuszkodzony, wszystko dziala")
    assert monitor.has_filtered_keyword(ok_pl) is False

    ok_en = _listing("iPhone 13 128GB unlocked, no icloud lock issues here")
    # NOTE: this title deliberately avoids the "icloud" keyword itself; only
    # "unlocked" vs. the blacklisted "locked" is under test.
    assert monitor.has_filtered_keyword(
        _listing("iPhone 13 128GB factory unlocked")
    ) is False

    # Sanity check: the real (non-negated) keyword still matches.
    assert monitor.has_filtered_keyword(_listing("iPhone 13 128GB uszkodzony")) is True
    assert monitor.has_filtered_keyword(_listing("iPhone 13 128GB locked")) is True
    print("PASS: negated/prefixed words no longer false-match the opposite keyword")


def test_polish_suffix_inflections_still_match() -> None:
    """Word-boundary protection is start-only: suffix inflections (Polish
    declension) must still be caught, e.g. "ekranu" for keyword "ekran"."""
    monitor = _monitor()
    config = monitor._config
    config.accessory_keywords.append("ekran")
    monitor = DealMonitor(config)
    listing = _listing("iPhone 13 128GB", description="rysa na ekranie, drobna")
    assert monitor.has_filtered_keyword(listing) is False  # in description -> ignored
    listing_title = _listing("Ekranu do iPhone 13 128GB")
    assert monitor.has_filtered_keyword(listing_title) is True  # inflected, in title
    print("PASS: Polish suffix inflections still match in the title")


def _main() -> None:
    test_accessory_keywords_ignored_in_description()
    test_accessory_keyword_in_title_still_filtered()
    test_blacklist_keyword_checked_in_description_too()
    test_negated_word_does_not_false_match()
    test_polish_suffix_inflections_still_match()
    print("\nALL KEYWORD-FILTER TESTS PASSED")


if __name__ == "__main__":
    _main()
