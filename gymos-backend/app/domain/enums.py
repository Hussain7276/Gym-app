"""
app/domain/enums.py
────────────────────
All domain enumerations. Adding a new status or role means adding
one value here — no other files need to change.
"""

from enum import Enum


class UserRole(str, Enum):
    ADMIN   = "admin"
    MANAGER = "manager"
    STAFF   = "staff"
    TRAINER = "trainer"
    MEMBER  = "member"


class RecordStatus(str, Enum):
    ACTIVE   = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class MembershipTierId(str, Enum):
    BASIC  = "basic"
    PRO    = "pro"
    ELITE  = "elite"


class ExerciseCategory(str, Enum):
    CARDIO      = "Cardio"
    STRENGTH    = "Strength"
    FLEXIBILITY = "Flexibility"
    BALANCE     = "Balance"
    HIIT        = "HIIT"


class DifficultyLevel(str, Enum):
    EASY   = "Easy"
    MEDIUM = "Medium"
    HARD   = "Hard"


class StaffRole(str, Enum):
    RECEPTIONIST = "Receptionist"
    CLEANER      = "Cleaner"
    SECURITY     = "Security"
    MANAGER      = "Manager"


class TrainerSpecialization(str, Enum):
    STRENGTH  = "Strength"
    CARDIO    = "Cardio"
    YOGA      = "Yoga"
    CROSSFIT  = "CrossFit"
    BOXING    = "Boxing"
    SWIMMING  = "Swimming"


class ExpenseCategory(str, Enum):
    UTILITIES   = "Utilities"
    EQUIPMENT   = "Equipment"
    MAINTENANCE = "Maintenance"
    MARKETING   = "Marketing"
    SUPPLIES    = "Supplies"


class DiscountType(str, Enum):
    PERCENTAGE = "percentage"
    FLAT       = "flat"


class InvoiceStatus(str, Enum):
    DRAFT    = "draft"
    ISSUED   = "issued"
    PAID     = "paid"
    OVERDUE  = "overdue"
    VOID     = "void"


class MonthCloseStatus(str, Enum):
    OPEN   = "open"
    CLOSED = "closed"


class AuditAction(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN  = "login"
    LOGOUT = "logout"
