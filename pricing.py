"""iPhone model / storage detection and resale-price lookup.

The monitor needs to turn a free-form OLX listing (title + description, plus any
structured OLX attributes) into a concrete ``(model, storage_gb)`` pair so it can
look up the user's expected resale price. Two sources are combined, in order of
confidence:

1. **Structured OLX attributes** (``phonemodel`` / ``builtinmemory_phones``) when
   present -- these are picker values chosen by the seller and are the most
   reliable signal.
2. **Text parsing** of the title first, then the description, as a fallback.

Confidence rules (deliberately conservative, per requirements):

* Storage is only accepted when a **single, unambiguous** capacity can be
  determined. Text capacities must carry an explicit ``GB``/``TB`` unit, and if
  the title mentions two different capacities the listing is treated as
  ambiguous and rejected by the caller.
* Likewise a single model must be identifiable.

:class:`PriceBook` normalises model/storage keys so config authors can write
``"iPhone 13 Pro"`` / ``"128"`` (or ``"128GB"`` / ``"1TB"``) naturally.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Optional, Set

__all__ = ["PhoneSpec", "PriceBook", "parse_models", "parse_storages", "detect_phone"]

# Capacities we consider valid iPhone storage sizes (GB). 1 TB == 1024 GB.
VALID_STORAGE_GB = {16, 32, 64, 128, 256, 512, 1024}

# Model detection patterns, ordered MOST specific first. As each pattern matches
# it is blanked from the working text so a more general pattern (e.g. bare
# "iphone 13") cannot also match the same phrase ("iphone 13 pro max").
# Each regex runs against normalised text (lower-case, non-alphanumerics -> space).
_MODEL_PATTERNS = [
    (r"iphone 11 pro max", "iPhone 11 Pro Max"),
    (r"iphone 11 pro", "iPhone 11 Pro"),
    (r"iphone 11", "iPhone 11"),
    (r"iphone 12 pro max", "iPhone 12 Pro Max"),
    (r"iphone 12 pro", "iPhone 12 Pro"),
    (r"iphone 12 mini", "iPhone 12 mini"),
    (r"iphone 12", "iPhone 12"),
    (r"iphone 13 pro max", "iPhone 13 Pro Max"),
    (r"iphone 13 pro", "iPhone 13 Pro"),
    (r"iphone 13 mini", "iPhone 13 mini"),
    (r"iphone 13", "iPhone 13"),
    (r"iphone 14 pro max", "iPhone 14 Pro Max"),
    (r"iphone 14 pro", "iPhone 14 Pro"),
    (r"iphone 14 plus", "iPhone 14 Plus"),
    (r"iphone 14", "iPhone 14"),
    (r"iphone 15 pro max", "iPhone 15 Pro Max"),
    (r"iphone 15 pro", "iPhone 15 Pro"),
    (r"iphone 15 plus", "iPhone 15 Plus"),
    (r"iphone 15", "iPhone 15"),
    (r"iphone 16 pro max", "iPhone 16 Pro Max"),
    (r"iphone 16 pro", "iPhone 16 Pro"),
    (r"iphone 16 plus", "iPhone 16 Plus"),
    (r"iphone 16", "iPhone 16"),
    (r"iphone xs max", "iPhone XS Max"),
    (r"iphone xs", "iPhone XS"),
    (r"iphone xr", "iPhone XR"),
    (r"iphone x", "iPhone X"),
    (r"iphone se", "iPhone SE"),
    (r"iphone 8 plus", "iPhone 8 Plus"),
    (r"iphone 8", "iPhone 8"),
    (r"iphone 7 plus", "iPhone 7 Plus"),
    (r"iphone 7", "iPhone 7"),
]
# Order patterns so the longest phrase is tried first regardless of list order.
_MODEL_PATTERNS.sort(key=lambda item: len(item[0]), reverse=True)

# Capacities that may appear as a *bare* number (no unit), e.g. "iPhone 13 128".
# Deliberately excludes 16/32/64 so model numbers like "iPhone 16" are never
# misread as a 16 GB capacity.
_BARE_STORAGE_GB = {128, 256, 512, 1024}

# Unit-qualified capacities: "128 gb", "256gb", "128g", "1 tb", "1tb", "1024gb".
_STORAGE_UNIT_RE = re.compile(r"(\d{1,4})\s*(tb|gb|g)\b", re.IGNORECASE)
# Bare capacities (standalone token), e.g. "128", "256", "512", "1024".
_STORAGE_BARE_RE = re.compile(r"\b(128|256|512|1024)\b")


@dataclass(slots=True)
class PhoneSpec:
    """Outcome of parsing a listing.

    ``model`` and ``storage_gb`` are ``None`` when they could not be determined
    confidently; the caller ignores such listings.
    """

    model: Optional[str]
    storage_gb: Optional[int]

    @property
    def is_confident(self) -> bool:
        """Both model and storage were determined unambiguously."""
        return self.model is not None and self.storage_gb is not None


def _normalize_text(text: str) -> str:
    """Lower-case and collapse non-alphanumerics to single spaces."""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def storage_label_to_gb(label: Optional[str]) -> Optional[int]:
    """Convert a storage label/key (``"128GB"``, ``"1TB"``, ``"128"``) to GB.

    Returns ``None`` if it cannot be interpreted as a valid capacity.
    """
    if label is None:
        return None
    text = str(label).strip().lower()
    match = re.fullmatch(r"(\d{1,4})\s*(gb|tb)?", text)
    if not match:
        return None
    value = int(match.group(1))
    if match.group(2) == "tb":
        value *= 1024
    return value if value in VALID_STORAGE_GB else None


def parse_models(text: str) -> Set[str]:
    """Return the set of distinct iPhone models mentioned in ``text``."""
    working = f" {_normalize_text(text)} "
    found: Set[str] = set()
    for pattern, label in _MODEL_PATTERNS:
        spaced = f" {pattern} "
        if spaced in working:
            found.add(label)
            working = working.replace(spaced, "  ")
    return found


def parse_storages(text: str) -> Set[int]:
    """Return the set of distinct valid storage capacities (GB) in ``text``.

    Recognises unit-qualified capacities (``128gb``, ``128 gb``, ``128g``,
    ``1tb``, ``1 tb``, ``1024gb``) and bare capacities (``128``, ``256``,
    ``512``, ``1024``). Bare ``16``/``32``/``64`` are intentionally NOT matched
    so a model number such as "iPhone 16" is never read as 16 GB.
    """
    found: Set[int] = set()
    for match in _STORAGE_UNIT_RE.finditer(text):
        value = int(match.group(1))
        if match.group(2).lower() == "tb":
            value *= 1024
        if value in VALID_STORAGE_GB:
            found.add(value)
    for match in _STORAGE_BARE_RE.finditer(text):
        value = int(match.group(1))
        if value in _BARE_STORAGE_GB:
            found.add(value)
    return found


def _first_unambiguous(title: str, description: str, parser) -> Optional[object]:
    """Apply ``parser`` to the title, then the description, returning the value
    only when exactly one candidate is found (i.e. unambiguous)."""
    for source in (title, description):
        if not source:
            continue
        candidates = parser(source)
        if len(candidates) == 1:
            return next(iter(candidates))
        if len(candidates) > 1:
            # Ambiguous in this source -> do not guess.
            return None
    return None


def detect_phone(
    title: str,
    description: str = "",
    *,
    model_hint: Optional[str] = None,
    storage_hint: Optional[str] = None,
) -> PhoneSpec:
    """Determine ``(model, storage_gb)`` for a listing.

    Prefers OLX's structured hints, then falls back to unambiguous text parsing
    of the title and finally the description.
    """
    # -- model --
    model: Optional[str] = model_hint.strip() if model_hint else None
    if not model:
        result = _first_unambiguous(title, description, parse_models)
        model = result if isinstance(result, str) else None

    # -- storage --
    storage = storage_label_to_gb(storage_hint) if storage_hint else None
    if storage is None:
        result = _first_unambiguous(title, description, parse_storages)
        storage = result if isinstance(result, int) else None

    return PhoneSpec(model=model, storage_gb=storage)


class PriceBook:
    """Case/format-insensitive lookup of resale prices by model + storage."""

    def __init__(self, prices: Dict[str, Dict[str, float]]) -> None:
        """Build the book from a ``{model: {storage: price}}`` mapping.

        Storage keys may be written as ``"128"``, ``"128GB"`` or ``"1TB"``.

        :raises ValueError: if a price entry is malformed.
        """
        self._prices: Dict[str, Dict[int, float]] = {}
        for model, capacities in prices.items():
            model_key = self._normalize_model(model)
            if not isinstance(capacities, dict):
                raise ValueError(f"Resale prices for {model!r} must be an object")
            by_gb: Dict[int, float] = {}
            for storage, price in capacities.items():
                gb = storage_label_to_gb(storage)
                if gb is None:
                    raise ValueError(
                        f"Invalid storage {storage!r} for model {model!r}"
                    )
                by_gb[gb] = float(price)
            self._prices[model_key] = by_gb

    @staticmethod
    def _normalize_model(model: str) -> str:
        """Normalise a model name for matching (case/spacing insensitive)."""
        return re.sub(r"\s+", " ", str(model).strip().lower())

    def lookup(self, model: Optional[str], storage_gb: Optional[int]) -> Optional[float]:
        """Return the resale price for ``model`` + ``storage_gb`` or ``None``."""
        if not model or storage_gb is None:
            return None
        by_gb = self._prices.get(self._normalize_model(model))
        if not by_gb:
            return None
        return by_gb.get(int(storage_gb))

    def __len__(self) -> int:
        """Total number of (model, storage) price points configured."""
        return sum(len(caps) for caps in self._prices.values())
