"""
app/domain/models/membership.py
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.models.base import Base


class Membership(Base):
    __tablename__ = "memberships"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    member_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tier: Mapped[str] = mapped_column(
        Enum("basic", "silver", "gold", "platinum", name="membership_tier"),
        nullable=False,
        default="basic",
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    fee: Mapped[int] = mapped_column(Integer, nullable=False)

    member = relationship("Member", back_populates="memberships", lazy="select")

    __table_args__ = (
        UniqueConstraint("member_id", "tier", "start_date", name="uq_membership_member_tier_start"),
        Index("ix_membership_member_id", "member_id"),
        Index("ix_membership_tier", "tier"),
    )