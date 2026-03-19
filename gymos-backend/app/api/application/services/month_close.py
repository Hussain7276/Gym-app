"""
app/application/services/month_close.py
─────────────────────────────────────────
MonthCloseService — period-end accounting engine.

Responsibilities:
  1. Aggregate all invoices, expenses, and salaries for the month.
  2. Write a MonthlyClose snapshot row.
  3. Set status = CLOSED → billing engine will reject further mutations.
  4. Provide a preview (dry-run) without committing.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import InvoiceStatus, MonthCloseStatus
from app.domain.models.billing import BillingInvoice
from app.domain.models.finance import MonthlyClose
from app.infrastructure.repositories.gym import (
    ExpenseRepository,
    MemberRepository,
    MonthlyCloseRepository,
    SalaryRepository,
)


@dataclass
class MonthCloseSummary:
    billing_month: str
    total_revenue: Decimal
    total_expenses: Decimal
    total_salaries: Decimal
    net_profit: Decimal
    active_members_count: int
    invoice_count: int
    is_preview: bool = False


class MonthCloseService:
    """
    Stateless service for computing and committing month-end close.
    Call `preview()` to see numbers without writing, `execute()` to lock the month.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._close_repo   = MonthlyCloseRepository(db)
        self._expense_repo = ExpenseRepository(db)
        self._salary_repo  = SalaryRepository(db)
        self._member_repo  = MemberRepository(db)

    async def preview(self, billing_month: str) -> MonthCloseSummary:
        """Compute summary without writing to DB."""
        return await self._compute(billing_month, preview=True)

    async def execute(
        self, billing_month: str, closed_by_user_id: str, notes: str | None = None
    ) -> MonthlyClose:
        """Lock the month and persist the snapshot."""
        existing = await self._close_repo.get_by_month(billing_month)
        if existing and existing.status == MonthCloseStatus.CLOSED:
            raise ValueError(f"Month {billing_month} is already closed.")

        summary = await self._compute(billing_month, preview=False)

        if existing:
            # Re-close (e.g. after correction) — update the existing row
            existing.status = MonthCloseStatus.CLOSED
            existing.total_revenue = summary.total_revenue
            existing.total_expenses = summary.total_expenses
            existing.total_salaries = summary.total_salaries
            existing.net_profit = summary.net_profit
            existing.active_members_count = summary.active_members_count
            existing.closed_by = closed_by_user_id
            existing.closed_at = date.today()
            existing.notes = notes
            await self.db.flush()
            return existing

        close_record = MonthlyClose(
            billing_month=billing_month,
            status=MonthCloseStatus.CLOSED,
            total_revenue=summary.total_revenue,
            total_expenses=summary.total_expenses,
            total_salaries=summary.total_salaries,
            net_profit=summary.net_profit,
            active_members_count=summary.active_members_count,
            closed_by=closed_by_user_id,
            closed_at=date.today(),
            notes=notes,
        )
        self.db.add(close_record)
        await self.db.flush()
        await self.db.refresh(close_record)
        return close_record

    async def reopen(self, billing_month: str) -> MonthlyClose:
        """Admin-only: reopen a closed month for corrections."""
        record = await self._close_repo.get_by_month(billing_month)
        if not record:
            raise ValueError(f"No close record for month {billing_month}.")
        if record.status != MonthCloseStatus.CLOSED:
            raise ValueError(f"Month {billing_month} is not closed.")
        record.status = MonthCloseStatus.OPEN
        record.closed_at = None
        await self.db.flush()
        return record

    # ── Private ────────────────────────────────────────────────────

    async def _compute(self, billing_month: str, preview: bool) -> MonthCloseSummary:
        # Revenue = sum of paid/issued invoice totals
        revenue = await self._sum_revenue(billing_month)

        # Expenses
        expenses = Decimal(str(await self._expense_repo.sum_by_month(billing_month)))

        # Salaries
        staff_salaries    = Decimal(str(await self._salary_repo.sum_staff_for_month(billing_month)))
        trainer_salaries  = Decimal(str(await self._salary_repo.sum_trainer_for_month(billing_month)))
        total_salaries    = staff_salaries + trainer_salaries

        net_profit = revenue - expenses - total_salaries
        active_members = await self._member_repo.get_active_count()
        invoice_count = await self._count_invoices(billing_month)

        return MonthCloseSummary(
            billing_month=billing_month,
            total_revenue=revenue,
            total_expenses=expenses,
            total_salaries=total_salaries,
            net_profit=net_profit,
            active_members_count=active_members,
            invoice_count=invoice_count,
            is_preview=preview,
        )

    async def _sum_revenue(self, billing_month: str) -> Decimal:
        from sqlalchemy import func
        stmt = select(func.sum(BillingInvoice.total_due)).where(
            BillingInvoice.billing_month == billing_month,
            BillingInvoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PAID]),
            BillingInvoice.is_deleted == False,  # noqa
        )
        result = (await self.db.execute(stmt)).scalar_one_or_none()
        return Decimal(str(result or "0"))

    async def _count_invoices(self, billing_month: str) -> int:
        from sqlalchemy import func
        stmt = select(func.count()).select_from(BillingInvoice).where(
            BillingInvoice.billing_month == billing_month,
            BillingInvoice.is_deleted == False,  # noqa
        )
        return (await self.db.execute(stmt)).scalar_one()
