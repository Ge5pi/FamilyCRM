"""Database engine and session management.

The module works with SQLite (local development) and PostgreSQL (production).
Only ``DATABASE_URL`` needs to change to switch databases; migrations are
managed by Alembic (see ``alembic/env.py``).

Note: ``create_all`` is intentionally *not* called here. Schema changes must go
through Alembic migrations (``alembic upgrade head``).
"""

from typing import Any, Dict

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from config import settings


def build_engine_kwargs(url: str) -> Dict[str, Any]:
    """Return engine options tailored to the configured database."""
    kwargs: Dict[str, Any] = {"pool_pre_ping": True}

    if url.startswith("sqlite"):
        # SQLite connections are bound to the creating thread by default.
        kwargs["connect_args"] = {"check_same_thread": False}
        # In-memory databases must share a single connection across sessions.
        if url in {"sqlite://", "sqlite:///:memory:"} or ":memory:" in url:
            from sqlalchemy.pool import StaticPool

            kwargs["poolclass"] = StaticPool
    else:
        # Sensible defaults for PostgreSQL and other server databases.
        kwargs.update(
            pool_size=5,
            max_overflow=10,
            pool_recycle=1800,
        )

    return kwargs


engine = create_engine(settings.database_url, **build_engine_kwargs(settings.database_url))


def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
    """SQLite ignores foreign keys unless the pragma is enabled per connection."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def enable_sqlite_foreign_keys(target_engine) -> None:
    """Enable FK enforcement for a SQLite engine (also used by the tests)."""
    if target_engine.dialect.name == "sqlite":
        event.listen(target_engine, "connect", _enable_sqlite_foreign_keys)


enable_sqlite_foreign_keys(engine)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

Base = declarative_base()


def get_db():
    """FastAPI dependency yielding a scoped database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
