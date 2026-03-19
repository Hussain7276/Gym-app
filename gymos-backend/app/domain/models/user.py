"""
app/domain/models/user.py
──────────────────────────
User authentication model. Decoupled from domain-specific member/trainer
records so a user account can map to any role without changing the schema.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.enums import UserRole
from app.domain.models.base import BaseModel

class User(BaseModel):
    """
    Authentication entity. One user ↔ one role. The `profile_id` links to the
    domain table (Member, Trainer, Staff) for the role's specific data.
    """
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role_enum"), nullable=False, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Optional FK to domain profile — null until profile is linked
    profile_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # ── Relationships ──────────────────────────────────────────────
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="user")

    def __repr__(self) -> str:
        return f"<User id={self.id!r} email={self.email!r} role={self.role}>"


class RefreshToken(BaseModel):
    """Persisted refresh tokens — allows revocation."""
    __tablename__ = "refresh_tokens"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(256), unique=True, nullable=False)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")


class AuditLog(BaseModel):
    """
    Immutable audit trail. Every create / update / delete writes a row here.
    Soft-delete is intentionally disabled — audit rows are never removed.
    """
    __tablename__ = "audit_logs"

    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    table_name: Mapped[str] = mapped_column(String(100), nullable=False)
    record_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    before_data: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    after_data: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    user: Mapped["User | None"] = relationship(back_populates="audit_logs")