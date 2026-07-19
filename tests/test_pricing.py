"""Unit tests for the model/storage parser and resale PriceBook."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pricing import (  # noqa: E402
    PriceBook,
    detect_phone,
    parse_models,
    parse_storages,
    storage_label_to_gb,
)


def test_parse_models_specificity() -> None:
    assert parse_models("iPhone 13 Pro Max 256GB") == {"iPhone 13 Pro Max"}
    assert parse_models("iPhone 13 pro") == {"iPhone 13 Pro"}
    assert parse_models("Sprzedam iphone 13 128gb") == {"iPhone 13"}
    assert parse_models("iPhone XS Max") == {"iPhone XS Max"}
    assert parse_models("iPhone SE 2020") == {"iPhone SE"}
    # Two distinct models mentioned -> ambiguous set.
    assert parse_models("etui do iphone 13 oraz iphone 14") == {
        "iPhone 13",
        "iPhone 14",
    }
    # Accessory with no phone model.
    assert parse_models("Ładowarka USB-C") == set()
    print("PASS: parse_models specificity + ambiguity")


def test_parse_storages() -> None:
    assert parse_storages("iPhone 13 128GB") == {128}
    assert parse_storages("pojemność 1 TB") == {1024}
    assert parse_storages("1tb wersja") == {1024}
    assert parse_storages("128gb lub 256gb") == {128, 256}
    assert parse_storages("bez pojemnosci") == set()
    # Bare number without a unit is NOT treated as storage.
    assert parse_storages("iPhone 13") == set()
    print("PASS: parse_storages requires explicit units")


def test_storage_label_to_gb() -> None:
    assert storage_label_to_gb("128GB") == 128
    assert storage_label_to_gb("1TB") == 1024
    assert storage_label_to_gb("256") == 256
    assert storage_label_to_gb("999") is None  # not a valid capacity
    assert storage_label_to_gb(None) is None
    print("PASS: storage_label_to_gb normalisation")


def test_detect_phone_confidence() -> None:
    # Structured hints win.
    spec = detect_phone(
        "iPhone 13 ładny", "opis", model_hint="iPhone 13 Pro", storage_hint="256GB"
    )
    assert spec.model == "iPhone 13 Pro" and spec.storage_gb == 256
    assert spec.is_confident

    # Text-only, unambiguous.
    spec = detect_phone("iPhone 12 mini 128GB")
    assert spec.model == "iPhone 12 mini" and spec.storage_gb == 128

    # Missing storage -> not confident.
    spec = detect_phone("iPhone 12 sprzedam")
    assert spec.storage_gb is None and not spec.is_confident

    # Ambiguous storage in title -> not confident.
    spec = detect_phone("iPhone 13 128GB lub 256GB")
    assert spec.storage_gb is None and not spec.is_confident
    print("PASS: detect_phone confidence rules")


def test_pricebook_lookup() -> None:
    book = PriceBook(
        {
            "iPhone 13": {"128": 1900, "256GB": 2100},
            "iPhone 13 Pro": {"1TB": 3200},
        }
    )
    assert book.lookup("iPhone 13", 128) == 1900
    assert book.lookup("iphone 13", 256) == 2100  # case-insensitive model
    assert book.lookup("iPhone 13 Pro", 1024) == 3200  # 1TB normalised
    assert book.lookup("iPhone 13", 512) is None  # capacity not configured
    assert book.lookup("iPhone 99", 128) is None  # unknown model
    assert len(book) == 3
    print("PASS: PriceBook lookup + normalisation")


def main() -> None:
    test_parse_models_specificity()
    test_parse_storages()
    test_storage_label_to_gb()
    test_detect_phone_confidence()
    test_pricebook_lookup()
    print("\nALL PRICING TESTS PASSED")


if __name__ == "__main__":
    main()
