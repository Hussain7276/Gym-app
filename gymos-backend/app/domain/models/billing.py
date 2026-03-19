"""
app/domain/models/billing.py
──────────────────────────────
Billing domain: BillingRuleConfig, DiscountOption, BillingInvoice,
InvoiceLineItem. All pricing rules are rows in the DB — zero hardcoding.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.enums import DiscountType, InvoiceStatus, RecordStatus
from app.domain.models.base import BaseModel


# ══════════════════════════════════════════════════════════════
#  BILLING RULE CONFIG (replaces hardcoded constants)
# ══════════════════════════════════════════════════════════════

class BillingRuleConfig(BaseModel):
    """
    Key-value store for billing formula parameters.
    Keys: tax_rate, late_fee, trainer_multiplier, etc.
    Operators read these at runtime — never hardcoded.
    """
    __tablename__ = "billing_rule_configs"

    rule_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    rule_value: Mapped[str] = mapped_column(String(255), nullable=False)  # stored as string, cast at use
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_type: Mapped[str] = mapped_column(String(20), default="float", nullable=False)  # float|int|string|bool
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# ══════════════════════════════════════════════════════════════
#  DISCOUNT OPTIONS
# ══════════════════════════════════════════════════════════════

class DiscountOption(BaseModel):
    """
    Configurable discount catalogue. Add new discount types via admin UI
    or seeder — no code changes required.
    """
    __tablename__ = "discount_options"

    discount_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    discount_type: Mapped[DiscountType] = mapped_column(
        Enum(DiscountType, name="discount_type_enum"), nullable=False
    )
    value: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)  # % or flat $
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    requires_note: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_stackable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[RecordStatus] = mapped_column(
        Enum(RecordStatus, name="record_status_enum"),
        default=RecordStatus.ACTIVE,
        nullable=False,
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


# ══════════════════════════════════════════════════════════════
#  INVOICE
# ══════════════════════════════════════════════════════════════

class BillingInvoice(BaseModel):
    """
    One invoice per billing event. Links to a member and stores
    computed totals for auditing. Line items are separately stored.
    """
    __tablename__ = "billing_invoices"

    invoice_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    member_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("members.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    billing_month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status_enum"),
        default=InvoiceStatus.DRAFT,
        nullable=False,
        index=True,
    )

    # ── Financial summary (denormalised for fast reporting) ───────
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    total_discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    taxable_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    total_due: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))

    # Snapshot of the tax rate used at time of invoice
    tax_rate_snapshot: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.08"))

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    member: Mapped["Member"] = relationship(back_populates="invoices")
    line_items: Mapped[list["InvoiceLineItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )
    applied_discounts: Mapped[list["InvoiceDiscount"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )


class InvoiceLineItem(BaseModel):
    """
    One row per charge component (membership, exercise, trainer).
    Stores a snapshot of the price at time of billing.
    """
    __tablename__ = "invoice_line_items"

    invoice_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("billing_invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    line_type: Mapped[str] = mapped_column(String(50), nullable=False)  # membership|exercise|trainer
    reference_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # exercise/trainer FK
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    invoice: Mapped["BillingInvoice"] = relationship(back_populates="line_items")


class InvoiceDiscount(BaseModel):
    """Applied discount snapshot per invoice."""
    __tablename__ = "invoice_discounts"

    invoice_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("billing_invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    discount_option_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("discount_options.id", ondelete="RESTRICT"), nullable=False
    )
    discount_type_snapshot: Mapped[str] = mapped_column(String(20), nullable=False)
    value_snapshot: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    invoice: Mapped["BillingInvoice"] = relationship(back_populates="applied_discounts")
    discount_option: Mapped["DiscountOption"] = relationship()
