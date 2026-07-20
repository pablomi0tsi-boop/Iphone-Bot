"""Pydantic request/response schemas for the web API."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class OfferRead(BaseModel):
    """Public representation of an :class:`api.models.Offer`."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    listing_id: str
    source: str
    title: Optional[str] = None
    price: Optional[float] = None
    currency: str = "PLN"
    url: Optional[str] = None
    model: Optional[str] = None
    storage_gb: Optional[int] = None
    resale_price: Optional[float] = None
    profit: Optional[float] = None
    notified: bool = False
    created_at: datetime
