"""FastAPI web backend for the OLX iPhone deal monitor.

This package is separate from the asyncio bot (``main.py`` / SQLite
``database.py``). It talks to PostgreSQL via SQLAlchemy and does not replace
the bot's de-duplication store.
"""

from __future__ import annotations

__all__ = ["app"]
