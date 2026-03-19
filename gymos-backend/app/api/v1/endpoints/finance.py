"""
app/api/v1/endpoints/finance.py
────────────────────────────────
Finance endpoints: billing, expenses, salaries, reports, dashboard,
month-close, and billing rule/discount configuration.
"""

from __future__ import annotations

import math
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, Pagination, require_roles
from app.api.application.schemas import (
    BillingRuleRead,
    BillingRuleUpdate,
    CreateInvoiceRequest,
    DashboardStatsResponse,
    DiscountOptionCreate,
    DiscountOptionRead,
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
    InvoiceRead,
    KpiData,
    MemberRead,
    MembershipBreakdownItem,
    MonthlyCloseRead,
    MonthlyCloseRequest,
    MonthlyReportRow,
    PaginatedResponse,
    RevenueHistoryPoint,
    SalarySummaryResponse,
    SalaryRecordRead,
    SuccessResponse,
    CategoryRevenueItem,
)
from app.api.application.services.billing_engine import BillingEngine, ComputedInvoice
from app.api.application.services.month_close import MonthCloseService
from app.domain.enums import InvoiceStatus, RecordStatus, UserRole
from app.domain.models.billing import BillingInvoice, BillingRuleConfig, DiscountOption
from app.domain.models.finance import Expense
from app.infrastructure.database import get_db
from app.infrastructure.repositories.gym import (
    BillingRuleRepository,
    DiscountOptionRepository,
    ExpenseRepository,
    MemberRepository,
    MonthlyCloseRepository,
    SalaryRepository,
    StaffRepository,
    TrainerRepository,
)

# ════════════════════════════════════════════════
#  BILLING RULES  —  /billing/rules
# ════════════════════════════════════════════════

billing_rules_router = APIRouter(prefix="/billing/rules", tags=["Billing Config"])


@billing_rules_router.get("", response_model=list[BillingRuleRead])
async def list_billing_rules(user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    return await BillingRuleRepository(db).get_all_active()


@billing_rules_router.put("/{rule_key}",
                          response_model=BillingRuleRead,
                          dependencies=[require_roles(UserRole.ADMIN)])
async def update_billing_rule(
    rule_key: str, body: BillingRuleUpdate, db: AsyncSession = Depends(get_db)
) -> Any:
    repo = BillingRuleRepository(db)
    rule = await repo.get_by_key(rule_key)
    if not rule:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_key}' not found")
    return await repo.update(rule, body.model_dump(exclude_none=True))


# ════════════════════════════════════════════════
#  DISCOUNT OPTIONS  —  /billing/discounts
# ════════════════════════════════════════════════

discounts_router = APIRouter(prefix="/billing/discounts", tags=["Billing Config"])


@discounts_router.get("", response_model=list[DiscountOptionRead])
async def list_discounts(user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    return await DiscountOptionRepository(db).get_active_ordered()


@discounts_router.post("", response_model=DiscountOptionRead, status_code=201,
                       dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def create_discount(body: DiscountOptionCreate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = DiscountOptionRepository(db)
    if await repo.exists(discount_code=body.discount_code):
        raise HTTPException(status_code=409, detail="Discount code already exists")
    opt = DiscountOption(**body.model_dump(), status=RecordStatus.ACTIVE)
    return await repo.create(opt)


@discounts_router.delete("/{discount_id}", response_model=SuccessResponse,
                         dependencies=[require_roles(UserRole.ADMIN)])
async def delete_discount(discount_id: str, db: AsyncSession = Depends(get_db)) -> Any:
    repo = DiscountOptionRepository(db)
    opt = await repo.get_by_id(discount_id)
    if not opt:
        raise HTTPException(status_code=404, detail="Discount not found")
    await repo.soft_delete(opt)
    return SuccessResponse(message="Discount archived")


# ════════════════════════════════════════════════
#  INVOICES  —  /billing/invoices
# ════════════════════════════════════════════════

invoices_router = APIRouter(prefix="/billing/invoices", tags=["Billing"])


@invoices_router.post("/preview", response_model=dict)
async def preview_invoice(
    body: CreateInvoiceRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Compute invoice without persisting — for live UI calculation."""
    engine = BillingEngine(db)
    try:
        computed = await engine.compute(body)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {
        "line_items": [
            {"description": li.description, "line_type": li.line_type,
             "quantity": li.quantity, "unit_price": str(li.unit_price),
             "total_price": str(li.total_price)}
            for li in computed.line_items
        ],
        "applied_discounts": [
            {"label": d.label, "type": d.discount_type, "value": str(d.value_snapshot),
             "discount_amount": str(d.discount_amount)}
            for d in computed.applied_discounts
        ],
        **computed.as_dict(),
    }


@invoices_router.post("", response_model=InvoiceRead, status_code=201,
                      dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)])
async def create_invoice(
    body: CreateInvoiceRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Any:
    engine = BillingEngine(db)
    try:
        computed = await engine.compute(body)
        invoice = await engine.persist(computed, body)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return invoice


@invoices_router.get("", response_model=PaginatedResponse[InvoiceRead])
async def list_invoices(
    user: CurrentUser,
    pagination: Pagination,
    db: AsyncSession = Depends(get_db),
    billing_month: str | None = Query(None),
    member_id: str | None = Query(None),
    status: InvoiceStatus | None = Query(None),
) -> Any:
    from sqlalchemy import select
    from app.infrastructure.repositories.base import BaseRepository

    repo = BaseRepository.__new__(BaseRepository)
    repo.db = db
    repo.model = BillingInvoice

    filters = [BillingInvoice.is_deleted == False]  # noqa
    if billing_month:
        filters.append(BillingInvoice.billing_month == billing_month)
    if member_id:
        filters.append(BillingInvoice.member_id == member_id)
    if status:
        filters.append(BillingInvoice.status == status)

    rows, total = await repo.get_all(
        skip=pagination.skip, limit=pagination.limit,
        filters=filters, order_by=BillingInvoice.created_at.desc()
    )
    pages = math.ceil(total / pagination.size) if total else 1
    return PaginatedResponse(items=rows, total=total, page=pagination.page, size=pagination.size, pages=pages)


@invoices_router.get("/{invoice_id}", response_model=InvoiceRead)
async def get_invoice(invoice_id: str, user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    stmt = (
        select(BillingInvoice)
        .where(BillingInvoice.id == invoice_id, BillingInvoice.is_deleted == False)  # noqa
        .options(
            selectinload(BillingInvoice.line_items),
            selectinload(BillingInvoice.applied_discounts),
        )
    )
    invoice = (await db.execute(stmt)).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@invoices_router.put("/{invoice_id}/mark-paid", response_model=InvoiceRead,
                     dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def mark_invoice_paid(invoice_id: str, db: AsyncSession = Depends(get_db)) -> Any:
    from sqlalchemy import select
    stmt = select(BillingInvoice).where(BillingInvoice.id == invoice_id)
    inv = (await db.execute(stmt)).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv.status = InvoiceStatus.PAID
    inv.amount_paid = inv.total_due
    await db.flush()
    return inv


# ════════════════════════════════════════════════
#  EXPENSES  —  /expenses
# ════════════════════════════════════════════════

expenses_router = APIRouter(prefix="/expenses", tags=["Expenses"])


@expenses_router.get("", response_model=PaginatedResponse[ExpenseRead])
async def list_expenses(
    user: CurrentUser,
    pagination: Pagination,
    db: AsyncSession = Depends(get_db),
    billing_month: str | None = Query(None),
    category: str | None = Query(None),
) -> Any:
    repo = ExpenseRepository(db)
    filters = []
    if billing_month:
        filters.append(Expense.billing_month == billing_month)
    if category:
        filters.append(Expense.category == category)
    rows, total = await repo.get_all(skip=pagination.skip, limit=pagination.limit, filters=filters or None)
    pages = math.ceil(total / pagination.size) if total else 1
    return PaginatedResponse(items=rows, total=total, page=pagination.page, size=pagination.size, pages=pages)


@expenses_router.post("", response_model=ExpenseRead, status_code=201,
                      dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def create_expense(body: ExpenseCreate, user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    repo = ExpenseRepository(db)
    expense = Expense(**body.model_dump(exclude={"extra_data"}), extra_data=body.extra_data, status=RecordStatus.ACTIVE)
    return await repo.create(expense)


@expenses_router.put("/{expense_id}", response_model=ExpenseRead,
                     dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def update_expense(expense_id: str, body: ExpenseUpdate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = ExpenseRepository(db)
    ex = await repo.get_by_id(expense_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Expense not found")
    return await repo.update(ex, body.model_dump(exclude_none=True))


@expenses_router.delete("/{expense_id}", response_model=SuccessResponse,
                        dependencies=[require_roles(UserRole.ADMIN)])
async def delete_expense(expense_id: str, db: AsyncSession = Depends(get_db)) -> Any:
    repo = ExpenseRepository(db)
    ex = await repo.get_by_id(expense_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Expense not found")
    await repo.soft_delete(ex)
    return SuccessResponse(message="Expense archived")


# ════════════════════════════════════════════════
#  SALARIES  —  /salaries
# ════════════════════════════════════════════════

salaries_router = APIRouter(prefix="/salaries", tags=["Salaries"])


@salaries_router.get("/summary", response_model=SalarySummaryResponse)
async def salary_summary(
    user: CurrentUser,
    billing_month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
) -> Any:
    salary_repo  = SalaryRepository(db)
    staff_repo   = StaffRepository(db)
    trainer_repo = TrainerRepository(db)

    staff_rows_raw    = await salary_repo.get_staff_records_for_month(billing_month)
    trainer_rows_raw  = await salary_repo.get_trainer_records_for_month(billing_month)

    # Fallback: if no salary records generated yet, use current salaries as estimate
    if not staff_rows_raw:
        active_staff = await staff_repo.get_active()
        staff_records = [
            SalaryRecordRead(
                id=s.id, name=s.full_name, role_or_spec=s.role.value,
                billing_month=billing_month, gross=s.monthly_salary,
                net=s.monthly_salary, paid=False, record_type="staff",
            )
            for s in active_staff
        ]
    else:
        staff_records = [
            SalaryRecordRead(
                id=r.id, name="", role_or_spec="", billing_month=r.billing_month,
                gross=r.base_salary, net=r.net_salary, paid=r.paid, record_type="staff",
            )
            for r in staff_rows_raw
        ]

    if not trainer_rows_raw:
        active_trainers = await trainer_repo.get_active()
        trainer_records = [
            SalaryRecordRead(
                id=t.id, name=t.full_name, role_or_spec=t.specialization.value,
                billing_month=billing_month,
                gross=t.hourly_rate * t.client_count * 4,
                net=t.hourly_rate * t.client_count * 4,
                paid=False, record_type="trainer",
            )
            for t in active_trainers
        ]
    else:
        trainer_records = [
            SalaryRecordRead(
                id=r.id, name="", role_or_spec="", billing_month=r.billing_month,
                gross=r.gross_earnings, net=r.net_earnings, paid=r.paid, record_type="trainer",
            )
            for r in trainer_rows_raw
        ]

    total_staff    = sum(r.net for r in staff_records)
    total_trainers = sum(r.net for r in trainer_records)

    return SalarySummaryResponse(
        billing_month=billing_month,
        staff_records=staff_records,
        trainer_records=trainer_records,
        total_staff=total_staff,
        total_trainers=total_trainers,
        grand_total=total_staff + total_trainers,
    )


# ════════════════════════════════════════════════
#  REPORTS  —  /reports
# ════════════════════════════════════════════════

reports_router = APIRouter(prefix="/reports", tags=["Reports"])


@reports_router.get("/monthly", response_model=list[MonthlyReportRow])
async def monthly_report(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    months: int = Query(default=6, ge=1, le=24),
) -> Any:
    closes = await MonthlyCloseRepository(db).get_all_ordered()
    rows = []
    for close in closes[:months]:
        margin = (
            float(close.net_profit / close.total_revenue * 100)
            if close.total_revenue > 0 else 0.0
        )
        rows.append(MonthlyReportRow(
            month=close.billing_month,
            revenue=close.total_revenue,
            expenses=close.total_expenses + close.total_salaries,
            profit=close.net_profit,
            margin=round(margin, 1),
            members=close.active_members_count,
        ))
    return rows


# ════════════════════════════════════════════════
#  DASHBOARD  —  /dashboard
# ════════════════════════════════════════════════

dashboard_router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@dashboard_router.get("/stats", response_model=DashboardStatsResponse)
async def dashboard_stats(user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    member_repo  = MemberRepository(db)
    trainer_repo = TrainerRepository(db)
    close_repo   = MonthlyCloseRepository(db)

    closes = await close_repo.get_all_ordered()
    active_members = await member_repo.get_active_count()
    active_trainers = await trainer_repo.get_active_count()
    recent_members = await member_repo.get_recent(limit=4)

    if len(closes) >= 2:
        latest = closes[0]
        prev   = closes[1]
        revenue_change = float((latest.total_revenue - prev.total_revenue) / prev.total_revenue * 100) if prev.total_revenue else 0
        profit_change  = float((latest.net_profit - prev.net_profit) / prev.net_profit * 100) if prev.net_profit else 0
        members_change = float((latest.active_members_count - prev.active_members_count) / max(prev.active_members_count, 1) * 100)
    elif closes:
        latest = closes[0]
        revenue_change = members_change = profit_change = 0.0
    else:
        # No close data yet — return zeroes
        return DashboardStatsResponse(
            kpi=KpiData(revenue=Decimal("0"), expenses=Decimal("0"), members=active_members,
                        profit=Decimal("0"), revenue_change=0, members_change=0, profit_change=0,
                        active_trainers=active_trainers),
            revenue_history=[], membership_breakdown=[], category_revenue=[],
            recent_members=recent_members,
        )

    history = [
        RevenueHistoryPoint(
            month=c.billing_month[-2:] + "/" + c.billing_month[:4],  # MM/YYYY
            revenue=c.total_revenue,
            expenses=c.total_expenses + c.total_salaries,
            members=c.active_members_count,
        )
        for c in reversed(closes[:6])
    ]

    # Membership breakdown from live data
    from sqlalchemy import func, select
    from app.domain.models.gym import Member, MembershipTier
    stmt = (
        select(MembershipTier.name, func.count(Member.id))
        .join(Member, Member.membership_tier_id == MembershipTier.id, isouter=True)
        .where(Member.status == RecordStatus.ACTIVE)
        .group_by(MembershipTier.name)
    )
    tier_counts = (await db.execute(stmt)).all()
    tier_colors = {"Basic": "#38BFFF", "Pro": "#C8FF00", "Elite": "#9B7FFF"}
    breakdown = [
        MembershipBreakdownItem(name=name, value=count, color=tier_colors.get(name, "#9292A8"))
        for name, count in tier_counts
    ]

    return DashboardStatsResponse(
        kpi=KpiData(
            revenue=latest.total_revenue,
            expenses=latest.total_expenses + latest.total_salaries,
            members=active_members,
            profit=latest.net_profit,
            revenue_change=round(revenue_change, 1),
            members_change=round(members_change, 1),
            profit_change=round(profit_change, 1),
            active_trainers=active_trainers,
        ),
        revenue_history=history,
        membership_breakdown=breakdown,
        category_revenue=[],  # extend: aggregate by invoice line type
        recent_members=recent_members,
    )


# ════════════════════════════════════════════════
#  MONTH CLOSE  —  /month-close
# ════════════════════════════════════════════════

month_close_router = APIRouter(prefix="/month-close", tags=["Month Close"])


@month_close_router.get("/preview")
async def preview_close(
    user: CurrentUser,
    billing_month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
) -> Any:
    svc = MonthCloseService(db)
    summary = await svc.preview(billing_month)
    return {
        "billing_month": summary.billing_month,
        "total_revenue": str(summary.total_revenue),
        "total_expenses": str(summary.total_expenses),
        "total_salaries": str(summary.total_salaries),
        "net_profit": str(summary.net_profit),
        "active_members_count": summary.active_members_count,
        "invoice_count": summary.invoice_count,
        "is_preview": True,
    }


@month_close_router.post("", response_model=MonthlyCloseRead,
                         dependencies=[require_roles(UserRole.ADMIN)])
async def execute_close(
    body: MonthlyCloseRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Any:
    svc = MonthCloseService(db)
    try:
        record = await svc.execute(body.billing_month, user.id, body.notes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return record


@month_close_router.get("", response_model=list[MonthlyCloseRead])
async def list_closes(user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    return await MonthlyCloseRepository(db).get_all_ordered()


@month_close_router.post("/{billing_month}/reopen", response_model=MonthlyCloseRead,
                         dependencies=[require_roles(UserRole.ADMIN)])
async def reopen_month(billing_month: str, user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    svc = MonthCloseService(db)
    try:
        return await svc.reopen(billing_month)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
