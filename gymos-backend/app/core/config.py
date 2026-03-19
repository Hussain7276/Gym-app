"""
app/core/config.py
──────────────────
Centralised application settings loaded from environment variables.
All configuration is read once at startup — never hardcoded.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Any

from pydantic import BeforeValidator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _parse_cors(value: Any) -> list[str]:
    """Accept either a comma-separated string or a list."""
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    return []


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ────────────────────────────────────────────────
    APP_NAME: str = "GymOS"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # ── Database ───────────────────────────────────────────────────
    # DATABASE_URL must use the async driver, e.g.:
    #   postgresql+asyncpg://user:pass@localhost/dbname
    DATABASE_URL: str
    # DATABASE_URL_SYNC is auto-derived from DATABASE_URL (psycopg2).
    # You can still override it explicitly in .env if needed.
    DATABASE_URL_SYNC: str = ""
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30

    # ── JWT ────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Security ───────────────────────────────────────────────────
    ALLOWED_ORIGINS: Annotated[list[str], BeforeValidator(_parse_cors)] = []
    ALLOWED_HOSTS: Annotated[list[str], BeforeValidator(_parse_cors)] = ["localhost"]

    # ── Pagination ─────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # ── Billing Defaults ───────────────────────────────────────────
    DEFAULT_TAX_RATE: float = 0.08
    DEFAULT_LATE_FEE: float = 15.0
    DEFAULT_TRAINER_MULTIPLIER: float = 1.0

    # ── Logging ────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    @model_validator(mode="after")
    def _derive_sync_url(self) -> "Settings":
        """
        Auto-build DATABASE_URL_SYNC from DATABASE_URL if not explicitly set.
        Replaces 'postgresql+asyncpg' with 'postgresql+psycopg2'.
        Also handles plain 'postgresql://' by inserting the psycopg2 driver.
        """
        if not self.DATABASE_URL_SYNC:
            url = self.DATABASE_URL
            if "+asyncpg" in url:
                self.DATABASE_URL_SYNC = url.replace("+asyncpg", "+psycopg2")
            elif url.startswith("postgresql://"):
                self.DATABASE_URL_SYNC = url.replace(
                    "postgresql://", "postgresql+psycopg2://", 1
                )
            else:
                # Fallback: assume it's already usable as-is
                self.DATABASE_URL_SYNC = url
        return self

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — settings object is created once per process."""
    return Settings()


settings = get_settings()