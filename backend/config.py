"""Application configuration.

All values can be overridden through environment variables or a local ``.env``
file placed next to this module (see ``.env.example``).

The database layer is intentionally driver-agnostic: SQLite is used for local
development, while PostgreSQL is the target production database. Any SQLAlchemy
URL is accepted, e.g.::

    DATABASE_URL=postgresql+psycopg2://familycrm:secret@localhost:5432/familycrm
"""

from functools import lru_cache
from typing import List

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Insecure placeholder used only for local development. It must never be used
# in production: the application refuses to start with it when ENVIRONMENT=production.
DEV_SECRET_KEY = "dev-insecure-secret-change-me"
MIN_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    project_name: str = "FamilyCRM API"
    environment: str = "development"

    # SQLite by default (local dev), PostgreSQL in production.
    database_url: str = "sqlite:///./family_crm.db"

    # Auth
    secret_key: str = DEV_SECRET_KEY
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Comma separated list of allowed origins, or "*" for local development.
    cors_origins: str = "*"

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """Accept ``postgres://`` and ``postgresql://`` DSNs (as used by hosts)
        and map them to the psycopg2 SQLAlchemy driver."""
        value = value.strip()
        if value.startswith("postgres://"):
            return "postgresql+psycopg2://" + value[len("postgres://"):]
        if value.startswith("postgresql://"):
            return "postgresql+psycopg2://" + value[len("postgresql://"):]
        return value

    @model_validator(mode="after")
    def _validate_production_settings(self) -> "Settings":
        if self.is_production:
            if self.secret_key == DEV_SECRET_KEY:
                raise ValueError(
                    "SECRET_KEY must be set to a strong random value in production"
                )
            if len(self.secret_key) < MIN_SECRET_KEY_LENGTH:
                raise ValueError(
                    f"SECRET_KEY must be at least {MIN_SECRET_KEY_LENGTH} characters"
                )
        return self

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    @property
    def cors_origins_list(self) -> List[str]:
        value = self.cors_origins.strip()
        if not value or value == "*":
            return ["*"]
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    @property
    def uses_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
