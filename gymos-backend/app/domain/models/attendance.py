"""
app/domain/models/attendance.py
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.models.base import Base


class RawPunch(Base):
    __tablename__ = "raw_punches"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    member_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # DB trigger fills this automatically from members.member_code on INSERT
    member_code: Mapped[str | None] = mapped_column(
        String(50), nullable=True, index=True
    )
    punched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    member = relationship("Member", back_populates="raw_punches", lazy="select")

    __table_args__ = (
        Index("ix_raw_punches_member_punched", "member_id", "punched_at"),
    )


class Attendance(Base):
    __tablename__ = "attendance"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    member_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # DB trigger fills this automatically from members.member_code on INSERT
    member_code: Mapped[str | None] = mapped_column(
        String(50), nullable=True, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    punch_in: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    punch_out: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_present: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    member = relationship("Member", back_populates="attendance_records", lazy="select")

    __table_args__ = (
        UniqueConstraint("member_id", "date", name="uq_attendance_member_date"),
        Index("ix_attendance_date", "date"),
    )