"""FastAPI application entrypoint for the web backend.

Run (from the repository root)::

    uvicorn api.app:app --reload --host 0.0.0.0 --port 8000

Requires ``DATABASE_URL`` pointing at PostgreSQL (see ``api.database``).
This service does not start or modify the asyncio OLX bot.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, List

from fastapi import Depends, FastAPI
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.database import Base, engine, get_db
from api.models import Offer
from api.schemas import OfferRead


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Create API tables if they do not exist yet (scaffold only)."""
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="iPhone Deal Bot API",
    description=(
        "Web API for OLX iPhone deal offers. Separate from the asyncio bot; "
        "uses PostgreSQL via SQLAlchemy. Bot SQLite de-dup is unchanged."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/offers", response_model=List[OfferRead])
def list_offers(db: Session = Depends(get_db)) -> List[Offer]:
    """Return all stored offers, newest first."""
    return list(
        db.scalars(
            select(Offer).order_by(Offer.created_at.desc(), Offer.id.desc())
        ).all()
    )


@app.get("/health")
def health() -> dict[str, str]:
    """Lightweight liveness probe (does not hit the database)."""
    return {"status": "ok"}
