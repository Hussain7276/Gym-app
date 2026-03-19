"""
app/domain/models/gym.py
─────────────────────────
Core gym domain entities: Member, Trainer, Staff, Exercise.
Each model uses enums for typed fields and JSONB (via extra_data)
for future extension without migrations.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.enums import (
    DifficultyLevel,
    ExerciseCategory,
    MembershipTierId,
    RecordStatus,
    StaffRole,
    TrainerSpecialization,
)
from app.domain.models.base import BaseModel


# ══════════════════════════════════════════════════════════════
#  MEMBERSHIP CONFIG (stored in DB — not hardcoded)
# ══════════════════════════════════════════════════════════════

class MembershipTier(BaseModel):
    """
    Configurable membership tiers. Monthly fees, feature lists,
    and display config all live in the database.
    """
    __tablename__ = "membership_tiers"

    tier_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    monthly_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    badge: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Feature list stored as JSONB array via extra_data["features"]
    # e.g. {"features": ["Gym Floor", "Pool", ...], "is_popular": true}

    members: Mapped[list["Member"]] = relationship(back_populates="membership_tier")


# ══════════════════════════════════════════════════════════════
#  MEMBER
# ══════════════════════════════════════════════════════════════

class Member(BaseModel):
    __tablename__ = "members"

    # Human-readable sequential code (e.g. M001) — separate from UUID PK
    member_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    join_date: Mapped[Date] = mapped_column(Date, nullable=False)
    status: Mapped[RecordStatus] = mapped_column(
        Enum(RecordStatus, name="record_status_enum"),
        default=RecordStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)

    # FK to membership tier
    membership_tier_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("membership_tiers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Linked user account (optional — set when member gets portal access)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    membership_tier: Mapped["MembershipTier | None"] = relationship(back_populates="members")
    invoices: Mapped[list["BillingInvoice"]] = relationship(back_populates="member")
    raw_punches: Mapped[list["RawPunch"]] = relationship(back_populates="member")
    attendance_records: Mapped[list["Attendance"]] = relationship(back_populates="member")
    memberships: Mapped[list["Membership"]] = relationship(back_populates="member", lazy="select")  # ← YEH ADD KI


# ══════════════════════════════════════════════════════════════
#  TRAINER
# ══════════════════════════════════════════════════════════════

class Trainer(BaseModel):
    __tablename__ = "trainers"

    trainer_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    specialization: Mapped[TrainerSpecialization] = mapped_column(
        Enum(TrainerSpecialization, name="trainer_spec_enum"), nullable=False
    )
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    client_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating: Mapped[Decimal] = mapped_column(Numeric(3, 1), default=Decimal("5.0"), nullable=False)
    status: Mapped[RecordStatus] = mapped_column(
        Enum(RecordStatus, name="record_status_enum"),
        default=RecordStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    salary_records: Mapped[list["TrainerSalaryRecord"]] = relationship(back_populates="trainer")


# ══════════════════════════════════════════════════════════════
#  STAFF
# ══════════════════════════════════════════════════════════════

class Staff(BaseModel):
    __tablename__ = "staff"

    staff_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    role: Mapped[StaffRole] = mapped_column(
        Enum(StaffRole, name="staff_role_enum"), nullable=False
    )
    monthly_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    hire_date: Mapped[Date] = mapped_column(Date, nullable=False)
    status: Mapped[RecordStatus] = mapped_column(
        Enum(RecordStatus, name="record_status_enum"),
        default=RecordStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    salary_records: Mapped[list["StaffSalaryRecord"]] = relationship(back_populates="staff_member")


# ══════════════════════════════════════════════════════════════
#  EXERCISE
# ══════════════════════════════════════════════════════════════

class Exercise(BaseModel):
    __tablename__ = "exercises"

    exercise_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[ExerciseCategory] = mapped_column(
        Enum(ExerciseCategory, name="exercise_category_enum"), nullable=False, index=True
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    price_per_session: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    calories_burned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    difficulty: Mapped[DifficultyLevel] = mapped_column(
        Enum(DifficultyLevel, name="difficulty_level_enum"),
        default=DifficultyLevel.MEDIUM,
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[RecordStatus] = mapped_column(
        Enum(RecordStatus, name="record_status_enum"),
        default=RecordStatus.ACTIVE,
        nullable=False,
        index=True,
    )