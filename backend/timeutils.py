"""Datetime helpers.

The database stores naive UTC timestamps (portable between SQLite and
PostgreSQL). The API accepts and returns timezone-aware UTC values, so clients
always know which zone a timestamp belongs to.
"""

from datetime import datetime, timezone
from typing import Optional


def ensure_utc_naive(value: Optional[datetime]) -> Optional[datetime]:
    """Convert any datetime to naive UTC for storage."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Attach UTC to a naive timestamp coming from the database."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
