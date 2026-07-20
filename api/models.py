"""SQLAlchemy ORM models for the web API (PostgreSQL).

These tables are independent of the bot's SQLite ``seen_listings`` store.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from api.database import Base


class Offer(Base):
    """A marketplace offer surfaced by the monitor for the web UI / API."""

    __tablename__ = "offers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # OLX (or other source) listing id — unique so the same offer is not stored twice.
    listing_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    source: Mapped[str] = mapped_column(String(32), default="olx")
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="PLN")
    url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    storage_gb: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    resale_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    profit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
