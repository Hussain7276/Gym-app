"""
app/domain/models/finance.py
──────────────────────────────
Finance domain: Expense, StaffSalaryRecord, TrainerSalaryRecord, MonthlyClose.
MonthlyClose is the "lock" that prevents edits after period-end.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.enums import ExpenseCategory, MonthCloseStatus, RecordStatus
from app.domain.models.base import BaseModel


# ══════════════════════════════════════════════════════════════
#  EXPENSE
# ══════════════════════════════════════════════════════════════

class Expense(BaseModel):
    __tablename__ = "expenses"

    description: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[ExpenseCategory] = mapped_column(
        Enum(ExpenseCategory, name="expense_category_enum"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    expense_date: Mapped[Date] = mapped_column(Date, nullable=False, index=True)
    vendor: Mapped[str | None] = mapped_column(String(150), nullable=True)
    billing_month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    status: Mapped[RecordStatus] = mapped_column(
        Enum(RecordStatus, name="record_status_enum"),
        default=RecordStatus.ACTIVE,
        nullable=False,
    )
    receipt_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


# ══════════════════════════════════════════════════════════════
#  SALARY RECORDS
# ══════════════════════════════════════════════════════════════

class StaffSalaryRecord(BaseModel):
    """Monthly salary snapshot for a staff member."""
    __tablename__ = "staff_salary_records"

    staff_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("staff.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    billing_month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    base_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    bonus: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    deduction: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    net_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    paid: Mapped[bool] = mapped_column(default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    staff_member: Mapped["Staff"] = relationship(back_populates="salary_records")


class TrainerSalaryRecord(BaseModel):
    """Monthly earnings snapshot for a trainer — calculated from sessions."""
    __tablename__ = "trainer_salary_records"

    trainer_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trainers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    billing_month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    hourly_rate_snapshot: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    sessions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trainer_multiplier_snapshot: Mapped[Decimal] = mapped_column(Numeric(5, 3), default=Decimal("1.000"), nullable=False)
    gross_earnings: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    bonus: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    deduction: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    net_earnings: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid: Mapped[bool] = mapped_column(default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    trainer: Mapped["Trainer"] = relationship(back_populates="salary_records")


# ══════════════════════════════════════════════════════════════
#  MONTHLY CLOSE
# ══════════════════════════════════════════════════════════════

class MonthlyClose(BaseModel):
    """
    Represents a closed accounting period. Once status = CLOSED,
    the billing engine rejects new invoices / expense mutations for that month.
    """
    __tablename__ = "monthly_closes"

    billing_month: Mapped[str] = mapped_column(
        String(7), unique=True, nullable=False, index=True
    )
    status: Mapped[MonthCloseStatus] = mapped_column(
        Enum(MonthCloseStatus, name="month_close_status_enum"),
        default=MonthCloseStatus.OPEN,
        nullable=False,
    )
    closed_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    closed_at: Mapped[Date | None] = mapped_column(Date, nullable=True)

    # ── Snapshot totals written at close time ─────────────────────
    total_revenue: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    total_expenses: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    total_salaries: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    net_profit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    active_members_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
