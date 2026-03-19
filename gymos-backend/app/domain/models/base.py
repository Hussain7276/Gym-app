"""
app/domain/models/base.py
──────────────────────────
Abstract base for every SQLAlchemy model.
Provides: UUID PK, timestamps, soft-delete, JSONB extra_data.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


class Base(DeclarativeBase):
    """Declarative base — all models inherit from this."""
    pass


class TimestampMixin:
    """Adds created_at / updated_at to any model."""
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """Adds is_deleted / deleted_at soft-delete columns."""
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ExtraDataMixin:
    """
    JSONB column for schema evolution — store arbitrary key/value pairs
    without migrations. Use for experimental or module-specific fields.
    """
    extra_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class BaseModel(Base, TimestampMixin, SoftDeleteMixin, ExtraDataMixin):
    """
    Concrete base for all GymOS domain entities.
    UUID primary key generated client-side for offline-friendliness.
    """
    __abstract__ = True

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
