"""
app/application/schemas/
─────────────────────────
All Pydantic v2 schemas for request validation and response serialisation.
Grouped into: common, auth, gym, billing, finance.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.domain.enums import (
    DifficultyLevel,
    DiscountType,
    ExerciseCategory,
    ExpenseCategory,
    InvoiceStatus,
    MembershipTierId,
    MonthCloseStatus,
    RecordStatus,
    StaffRole,
    TrainerSpecialization,
    UserRole,
)

# ══════════════════════════════════════════════════════════════
#  COMMON
# ══════════════════════════════════════════════════════════════

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int


class SuccessResponse(BaseModel):
    success: bool = True
    message: str = "Operation successful"


class ErrorDetail(BaseModel):
    code: str
    message: str
    field: str | None = None


# ══════════════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshRequest(BaseModel):
    refresh_token: str


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2, max_length=255)
    role: UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=255)
    is_active: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


# ══════════════════════════════════════════════════════════════
#  MEMBERSHIP TIER
# ══════════════════════════════════════════════════════════════

class MembershipTierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tier_id: str
    name: str
    monthly_fee: Decimal
    color: str | None
    badge: str | None
    sort_order: int
    extra_data: dict | None


class MembershipTierCreate(BaseModel):
    tier_id: str = Field(max_length=50)
    name: str = Field(max_length=100)
    monthly_fee: Decimal = Field(gt=0, decimal_places=2)
    color: str | None = None
    badge: str | None = None
    sort_order: int = 0
    extra_data: dict | None = None   # {"features": [...], "is_popular": true}


class MembershipTierUpdate(BaseModel):
    name: str | None = None
    monthly_fee: Decimal | None = Field(None, gt=0)
    color: str | None = None
    badge: str | None = None
    sort_order: int | None = None
    extra_data: dict | None = None


# ══════════════════════════════════════════════════════════════
#  MEMBER
# ══════════════════════════════════════════════════════════════

class MemberCreate(BaseModel):
    full_name: str = Field(max_length=255)
    email: EmailStr
    phone: str | None = Field(None, max_length=30)
    join_date: date
    membership_tier_id: str | None = None
    extra_data: dict | None = None


class MemberUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    membership_tier_id: str | None = None
    status: RecordStatus | None = None
    balance: Decimal | None = None
    extra_data: dict | None = None


class MemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    member_code: str
    full_name: str
    email: str
    phone: str | None
    join_date: date
    status: RecordStatus
    balance: Decimal
    membership_tier_id: str | None
    created_at: datetime
    updated_at: datetime


class MemberReadWithTier(MemberRead):
    membership_tier: MembershipTierRead | None = None


# ══════════════════════════════════════════════════════════════
#  TRAINER
# ══════════════════════════════════════════════════════════════

class TrainerCreate(BaseModel):
    full_name: str = Field(max_length=255)
    email: EmailStr
    specialization: TrainerSpecialization
    hourly_rate: Decimal = Field(gt=0, decimal_places=2)
    client_count: int = Field(default=0, ge=0)
    rating: Decimal = Field(default=Decimal("5.0"), ge=0, le=5)
    extra_data: dict | None = None


class TrainerUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    specialization: TrainerSpecialization | None = None
    hourly_rate: Decimal | None = Field(None, gt=0)
    client_count: int | None = Field(None, ge=0)
    rating: Decimal | None = Field(None, ge=0, le=5)
    status: RecordStatus | None = None
    extra_data: dict | None = None


class TrainerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trainer_code: str
    full_name: str
    email: str
    specialization: TrainerSpecialization
    hourly_rate: Decimal
    client_count: int
    rating: Decimal
    status: RecordStatus
    created_at: datetime


# ══════════════════════════════════════════════════════════════
#  STAFF
# ══════════════════════════════════════════════════════════════

class StaffCreate(BaseModel):
    full_name: str = Field(max_length=255)
    email: EmailStr
    role: StaffRole
    monthly_salary: Decimal = Field(gt=0, decimal_places=2)
    hire_date: date
    extra_data: dict | None = None


class StaffUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    role: StaffRole | None = None
    monthly_salary: Decimal | None = Field(None, gt=0)
    hire_date: date | None = None
    status: RecordStatus | None = None
    extra_data: dict | None = None


class StaffRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    staff_code: str
    full_name: str
    email: str
    role: StaffRole
    monthly_salary: Decimal
    hire_date: date
    status: RecordStatus
    created_at: datetime


# ══════════════════════════════════════════════════════════════
#  EXERCISE
# ══════════════════════════════════════════════════════════════

class ExerciseCreate(BaseModel):
    name: str = Field(max_length=255)
    category: ExerciseCategory
    duration_minutes: int = Field(gt=0)
    price_per_session: Decimal = Field(gt=0, decimal_places=2)
    calories_burned: int = Field(default=0, ge=0)
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    description: str | None = None
    extra_data: dict | None = None


class ExerciseUpdate(BaseModel):
    name: str | None = None
    category: ExerciseCategory | None = None
    duration_minutes: int | None = Field(None, gt=0)
    price_per_session: Decimal | None = Field(None, gt=0)
    calories_burned: int | None = Field(None, ge=0)
    difficulty: DifficultyLevel | None = None
    description: str | None = None
    status: RecordStatus | None = None
    extra_data: dict | None = None


class ExerciseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exercise_code: str
    name: str
    category: ExerciseCategory
    duration_minutes: int
    price_per_session: Decimal
    calories_burned: int
    difficulty: DifficultyLevel
    status: RecordStatus
    created_at: datetime


# ══════════════════════════════════════════════════════════════
#  BILLING
# ══════════════════════════════════════════════════════════════

class BillingRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rule_key: str
    rule_value: str
    label: str
    description: str | None
    value_type: str
    is_active: bool


class BillingRuleUpdate(BaseModel):
    rule_value: str
    label: str | None = None
    description: str | None = None
    is_active: bool | None = None


class DiscountOptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    discount_code: str
    label: str
    description: str | None
    discount_type: DiscountType
    value: Decimal
    icon: str | None
    color: str | None
    requires_note: bool
    is_stackable: bool
    sort_order: int


class DiscountOptionCreate(BaseModel):
    discount_code: str = Field(max_length=50)
    label: str = Field(max_length=150)
    description: str | None = None
    discount_type: DiscountType
    value: Decimal = Field(gt=0)
    icon: str | None = None
    color: str | None = None
    requires_note: bool = False
    is_stackable: bool = True
    sort_order: int = 0


class AppliedDiscountInput(BaseModel):
    discount_option_id: str
    note: str | None = None


class InvoiceLineItemInput(BaseModel):
    line_type: str          # "membership" | "exercise" | "trainer"
    reference_id: str | None = None
    quantity: int = Field(default=1, ge=1)


class CreateInvoiceRequest(BaseModel):
    member_id: str
    billing_month: str = Field(pattern=r"^\d{4}-\d{2}$")  # YYYY-MM
    membership_tier_id: str | None = None
    exercise_ids: list[str] = Field(default_factory=list)
    trainer_id: str | None = None
    trainer_sessions: int = Field(default=1, ge=1)
    applied_discounts: list[AppliedDiscountInput] = Field(default_factory=list)
    notes: str | None = None


class InvoiceLineItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    description: str
    line_type: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal


class InvoiceDiscountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    discount_type_snapshot: str
    value_snapshot: Decimal
    discount_amount: Decimal
    note: str | None
    discount_option: DiscountOptionRead


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    invoice_number: str
    member_id: str
    billing_month: str
    status: InvoiceStatus
    subtotal: Decimal
    total_discount: Decimal
    taxable_amount: Decimal
    tax_amount: Decimal
    total_due: Decimal
    amount_paid: Decimal
    tax_rate_snapshot: Decimal
    notes: str | None
    created_at: datetime
    line_items: list[InvoiceLineItemRead] = []
    applied_discounts: list[InvoiceDiscountRead] = []


# ══════════════════════════════════════════════════════════════
#  FINANCE
# ══════════════════════════════════════════════════════════════

class ExpenseCreate(BaseModel):
    description: str = Field(max_length=255)
    category: ExpenseCategory
    amount: Decimal = Field(gt=0, decimal_places=2)
    expense_date: date
    vendor: str | None = None
    billing_month: str = Field(pattern=r"^\d{4}-\d{2}$")
    extra_data: dict | None = None


class ExpenseUpdate(BaseModel):
    description: str | None = None
    category: ExpenseCategory | None = None
    amount: Decimal | None = Field(None, gt=0)
    expense_date: date | None = None
    vendor: str | None = None
    status: RecordStatus | None = None
    extra_data: dict | None = None


class ExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    description: str
    category: ExpenseCategory
    amount: Decimal
    expense_date: date
    vendor: str | None
    billing_month: str
    status: RecordStatus
    created_at: datetime


class SalaryRecordRead(BaseModel):
    id: str
    name: str
    role_or_spec: str
    billing_month: str
    gross: Decimal
    net: Decimal
    paid: bool
    record_type: str  # "staff" | "trainer"


class SalarySummaryResponse(BaseModel):
    billing_month: str
    staff_records: list[SalaryRecordRead]
    trainer_records: list[SalaryRecordRead]
    total_staff: Decimal
    total_trainers: Decimal
    grand_total: Decimal


class MonthlyCloseRequest(BaseModel):
    billing_month: str = Field(pattern=r"^\d{4}-\d{2}$")
    notes: str | None = None


class MonthlyCloseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    billing_month: str
    status: MonthCloseStatus
    total_revenue: Decimal
    total_expenses: Decimal
    total_salaries: Decimal
    net_profit: Decimal
    active_members_count: int
    closed_at: date | None
    notes: str | None


# ══════════════════════════════════════════════════════════════
#  DASHBOARD
# ══════════════════════════════════════════════════════════════

class KpiData(BaseModel):
    revenue: Decimal
    expenses: Decimal
    members: int
    profit: Decimal
    revenue_change: float
    members_change: float
    profit_change: float
    active_trainers: int


class RevenueHistoryPoint(BaseModel):
    month: str
    revenue: Decimal
    expenses: Decimal
    members: int


class MembershipBreakdownItem(BaseModel):
    name: str
    value: int
    color: str


class CategoryRevenueItem(BaseModel):
    category: str
    amount: Decimal


class DashboardStatsResponse(BaseModel):
    kpi: KpiData
    revenue_history: list[RevenueHistoryPoint]
    membership_breakdown: list[MembershipBreakdownItem]
    category_revenue: list[CategoryRevenueItem]
    recent_members: list[MemberRead]


class MonthlyReportRow(BaseModel):
    month: str
    revenue: Decimal
    expenses: Decimal
    profit: Decimal
    margin: float
    members: int


"""
schemas.py — ATTENDANCE section ONLY (baaki schemas same rehte hain)
Sirf yeh classes replace karo apni existing schemas file mein.
"""

# ══════════════════════════════════════════════════════════════
#  ATTENDANCE
# ══════════════════════════════════════════════════════════════

class RawPunchCreate(BaseModel):
    """
    POST /attendance/raw-punch
    Device direct is endpoint ko call karta hai.
    member_code bhi accept karta hai — agar device member_code bhejta hai
    toh member_id backend mein resolve hoga.
    """
    member_id: str | None = Field(None, description="UUID of the member (agar device UUID bhejta hai)")
    member_code: str | None = Field(None, description="member_code e.g. '1','42' (agar device code bhejta hai)")
    punched_at: datetime = Field(..., description="Exact punch timestamp (ISO-8601 with timezone)")

    @field_validator("member_id", "member_code", mode="before")
    @classmethod
    def at_least_one(cls, v, info):
        # Validation router mein handle hoga — dono None nahi ho sakte
        return v


class RawPunchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    member_id: str
    member_code: str | None = None   # ← naya
    punched_at: datetime


class PunchInCreate(BaseModel):
    """POST /attendance/punch-in — manual override (admin use)"""
    member_id: str | None = None
    member_code: str | None = None   # ← naya: frontend member_code bhej sakta hai
    punch_in: datetime = Field(..., description="First punch timestamp (ISO-8601)")
    attendance_date: date = Field(..., description="Attendance date (YYYY-MM-DD)")


class PunchOutUpdate(BaseModel):
    """PATCH /attendance/{id}/punch-out"""
    punch_out: datetime = Field(..., description="Latest punch timestamp (ISO-8601)")


class AttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    member_code: str | None = None   # ← naya — frontend ko yahi chahiye
    date: date
    punch_in: Optional[datetime] = None
    punch_out: Optional[datetime] = None
    is_present: bool


class AttendanceListResponse(BaseModel):
    items: list[AttendanceRead]
    total: int


class ManualPunchInCreate(BaseModel):
    """POST /attendance/manual-punch-in — admin override endpoint"""
    member_code: str = Field(..., description="member_code e.g. '1', '42'")
    punch_in: datetime
    attendance_date: date
class RawPunchCreate(BaseModel):
    member_id: str | None = Field(None, description="UUID of the member")
    member_code: str | None = Field(None, description="e.g. 1, 2, 3", json_schema_extra={"example": "1"})
    punched_at: datetime = Field(..., json_schema_extra={"example": "2026-03-13T10:30:00Z"})
# ══════════════════════════════════════════════════════════════
#  MEMBERSHIP
# ══════════════════════════════════════════════════════════════

class MembershipCreate(BaseModel):
    """POST /memberships — naya membership record banata hai"""
    member_id: str = Field(..., description="UUID of the member")
    tier: str = Field(..., description="basic | silver | gold | platinum")
    start_date: date = Field(..., description="Membership start date (YYYY-MM-DD)")
    end_date: date = Field(..., description="Membership end date (YYYY-MM-DD)")
    fee: int = Field(..., gt=0, description="Fee at time of creation in PKR")


class MembershipUpdate(BaseModel):
    """PUT /memberships/{id} — membership update karta hai"""
    tier: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None
    fee: int | None = Field(None, gt=0)


class MembershipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    member_id: str
    tier: str
    start_date: date
    end_date: date
    is_active: bool
    fee: int


class MembershipRenewRequest(BaseModel):
    """POST /memberships/{id}/renew — membership months badhata hai"""
    months: int = Field(default=1, ge=1, le=12, description="Kitne mahine extend karne hain")


class MembershipStatsResponse(BaseModel):
    total_active: int
    basic_count: int
    silver_count: int
    gold_count: int
    platinum_count: int
    monthly_revenue: int