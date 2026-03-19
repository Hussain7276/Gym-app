"""
app/domain/models/__init__.py
──────────────────────────────
Re-export every model so Alembic env.py can import `Base` and all
mapped tables in one import. Order matters for FK resolution.
"""

from app.domain.models.base import Base, BaseModel  # noqa: F401
from app.domain.models.user import AuditLog, RefreshToken, User  # noqa: F401
from app.domain.models.app_config import (  # noqa: F401
    AppSetting,
    ChartConfig,
    KpiConfig,
    ModuleConfig,
)
from app.domain.models.gym import (  # noqa: F401
    Exercise,
    Member,
    MembershipTier,
    Staff,
    Trainer,
)
from app.domain.models.attendance import Attendance, RawPunch  # noqa: F401
from app.domain.models.billing import (  # noqa: F401
    BillingInvoice,
    BillingRuleConfig,
    DiscountOption,
    InvoiceDiscount,
    InvoiceLineItem,
)
from app.domain.models.finance import (  # noqa: F401
    Expense,
    MonthlyClose,
    StaffSalaryRecord,
    TrainerSalaryRecord,
)