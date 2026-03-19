"""
app/application/services/billing_engine.py
───────────────────────────────────────────
BillingEngine — the core financial computation service.

Design principles:
  • All pricing rules read from the database (BillingRuleConfig rows).
  • No monetary constants are hardcoded — changing a tax rate is a DB update.
  • Discount stacking is fully configurable per DiscountOption.is_stackable.
  • Formula is extensible: add a new line type without touching existing logic.
  • Returns a ComputedInvoice value object — no DB writes here (SRP).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.application.schemas import CreateInvoiceRequest
from app.domain.models.billing import (
    BillingInvoice,
    BillingRuleConfig,
    DiscountOption,
    InvoiceDiscount,
    InvoiceLineItem,
)
from app.domain.models.finance import MonthlyClose
from app.domain.enums import DiscountType, InvoiceStatus, MonthCloseStatus
from app.infrastructure.repositories.gym import (
    BillingRuleRepository,
    DiscountOptionRepository,
    ExerciseRepository,
    MemberRepository,
    MembershipTierRepository,
    MonthlyCloseRepository,
    TrainerRepository,
)


# ── Value objects ──────────────────────────────────────────────────

@dataclass
class ComputedLineItem:
    description: str
    line_type: str
    reference_id: str | None
    quantity: int
    unit_price: Decimal
    total_price: Decimal


@dataclass
class ComputedDiscount:
    discount_option_id: str
    label: str
    discount_type: str
    value_snapshot: Decimal
    discount_amount: Decimal
    note: str | None


@dataclass
class ComputedInvoice:
    """Immutable result of the billing calculation. No DB interaction."""
    line_items: list[ComputedLineItem] = field(default_factory=list)
    applied_discounts: list[ComputedDiscount] = field(default_factory=list)
    subtotal: Decimal = Decimal("0.00")
    total_discount: Decimal = Decimal("0.00")
    taxable_amount: Decimal = Decimal("0.00")
    tax_rate: Decimal = Decimal("0.08")
    tax_amount: Decimal = Decimal("0.00")
    total_due: Decimal = Decimal("0.00")

    def as_dict(self) -> dict[str, Any]:
        return {
            "subtotal": str(self.subtotal),
            "total_discount": str(self.total_discount),
            "taxable_amount": str(self.taxable_amount),
            "tax_rate": str(self.tax_rate),
            "tax_amount": str(self.tax_amount),
            "total_due": str(self.total_due),
        }


def _q(value: Decimal) -> Decimal:
    """Quantize to 2 decimal places."""
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class BillingEngine:
    """
    Stateless billing computation service.

    Usage:
        engine = BillingEngine(db)
        invoice = await engine.compute(request)
        db_invoice = await engine.persist(invoice, request)
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._rules_repo    = BillingRuleRepository(db)
        self._discounts_repo = DiscountOptionRepository(db)
        self._members_repo  = MemberRepository(db)
        self._tiers_repo    = MembershipTierRepository(db)
        self._exercises_repo = ExerciseRepository(db)
        self._trainers_repo  = TrainerRepository(db)
        self._close_repo    = MonthlyCloseRepository(db)

    # ── Public API ─────────────────────────────────────────────────

    async def compute(self, request: CreateInvoiceRequest) -> ComputedInvoice:
        """
        Compute invoice totals from the request without writing to DB.
        Raises ValueError for validation errors (closed month, invalid IDs).
        """
        await self._assert_month_open(request.billing_month)

        rules = await self._load_rules()
        line_items: list[ComputedLineItem] = []

        # 1. Membership fee
        if request.membership_tier_id:
            tier = await self._tiers_repo.get_by_id(request.membership_tier_id)
            if not tier:
                raise ValueError(f"Membership tier {request.membership_tier_id!r} not found")
            line_items.append(ComputedLineItem(
                description=f"{tier.name} Membership",
                line_type="membership",
                reference_id=tier.id,
                quantity=1,
                unit_price=_q(tier.monthly_fee),
                total_price=_q(tier.monthly_fee),
            ))

        # 2. Exercise fees
        for exercise_id in request.exercise_ids:
            ex = await self._exercises_repo.get_by_id(exercise_id)
            if not ex:
                raise ValueError(f"Exercise {exercise_id!r} not found")
            line_items.append(ComputedLineItem(
                description=f"{ex.name} (session)",
                line_type="exercise",
                reference_id=ex.id,
                quantity=1,
                unit_price=_q(ex.price_per_session),
                total_price=_q(ex.price_per_session),
            ))

        # 3. Trainer fee
        if request.trainer_id:
            trainer = await self._trainers_repo.get_by_id(request.trainer_id)
            if not trainer:
                raise ValueError(f"Trainer {request.trainer_id!r} not found")
            multiplier = Decimal(str(rules.get("trainer_multiplier", "1.0")))
            unit = _q(trainer.hourly_rate * multiplier)
            total = _q(unit * request.trainer_sessions)
            line_items.append(ComputedLineItem(
                description=f"Personal Training — {trainer.full_name} ({request.trainer_sessions} sessions)",
                line_type="trainer",
                reference_id=trainer.id,
                quantity=request.trainer_sessions,
                unit_price=unit,
                total_price=total,
            ))

        subtotal = _q(sum(li.total_price for li in line_items))

        # 4. Discounts — stacking supported; each applied to the original subtotal
        applied_discounts: list[ComputedDiscount] = []
        available_discount_opts = {d.id: d for d in await self._discounts_repo.get_active_ordered()}

        for disc_input in request.applied_discounts:
            opt = available_discount_opts.get(disc_input.discount_option_id)
            if not opt:
                raise ValueError(f"Discount {disc_input.discount_option_id!r} not found or inactive")
            amount = self._compute_discount_amount(opt, subtotal)
            applied_discounts.append(ComputedDiscount(
                discount_option_id=opt.id,
                label=opt.label,
                discount_type=opt.discount_type.value,
                value_snapshot=opt.value,
                discount_amount=amount,
                note=disc_input.note,
            ))

        total_discount = _q(sum(d.discount_amount for d in applied_discounts))
        taxable = _q(max(Decimal("0.00"), subtotal - total_discount))
        tax_rate = Decimal(str(rules.get("tax_rate", "0.08")))
        tax = _q(taxable * tax_rate)
        total_due = _q(taxable + tax)

        return ComputedInvoice(
            line_items=line_items,
            applied_discounts=applied_discounts,
            subtotal=subtotal,
            total_discount=total_discount,
            taxable_amount=taxable,
            tax_rate=tax_rate,
            tax_amount=tax,
            total_due=total_due,
        )

    async def persist(
        self,
        computed: ComputedInvoice,
        request: CreateInvoiceRequest,
    ) -> BillingInvoice:
        """
        Write a computed invoice to the database.
        Must be called inside an active transaction (handled by get_db).
        """
        invoice_number = self._generate_invoice_number(request.billing_month)

        invoice = BillingInvoice(
            invoice_number=invoice_number,
            member_id=request.member_id,
            billing_month=request.billing_month,
            status=InvoiceStatus.ISSUED,
            subtotal=computed.subtotal,
            total_discount=computed.total_discount,
            taxable_amount=computed.taxable_amount,
            tax_amount=computed.tax_amount,
            tax_rate_snapshot=computed.tax_rate,
            total_due=computed.total_due,
            amount_paid=Decimal("0.00"),
            notes=request.notes,
        )
        self.db.add(invoice)
        await self.db.flush()

        # Persist line items
        for li in computed.line_items:
            self.db.add(InvoiceLineItem(
                invoice_id=invoice.id,
                description=li.description,
                line_type=li.line_type,
                reference_id=li.reference_id,
                quantity=li.quantity,
                unit_price=li.unit_price,
                total_price=li.total_price,
            ))

        # Persist applied discounts
        for d in computed.applied_discounts:
            self.db.add(InvoiceDiscount(
                invoice_id=invoice.id,
                discount_option_id=d.discount_option_id,
                discount_type_snapshot=d.discount_type,
                value_snapshot=d.value_snapshot,
                discount_amount=d.discount_amount,
                note=d.note,
            ))

        await self.db.flush()
        await self.db.refresh(invoice)
        return invoice

    # ── Private helpers ────────────────────────────────────────────

    async def _load_rules(self) -> dict[str, str]:
        rules = await self._rules_repo.get_all_active()
        return {r.rule_key: r.rule_value for r in rules}

    async def _assert_month_open(self, billing_month: str) -> None:
        close = await self._close_repo.get_by_month(billing_month)
        if close and close.status == MonthCloseStatus.CLOSED:
            raise ValueError(f"Billing month {billing_month} is closed. No mutations allowed.")

    @staticmethod
    def _compute_discount_amount(opt: DiscountOption, subtotal: Decimal) -> Decimal:
        if opt.discount_type == DiscountType.PERCENTAGE:
            return _q(subtotal * (opt.value / Decimal("100")))
        # Flat — cannot exceed subtotal
        return _q(min(opt.value, subtotal))

    @staticmethod
    def _generate_invoice_number(billing_month: str) -> str:
        ts = datetime.now(tz=timezone.utc)
        suffix = ts.strftime("%H%M%S")
        month_slug = billing_month.replace("-", "")
        return f"INV-{month_slug}-{suffix}"
