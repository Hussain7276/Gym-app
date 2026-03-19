"""
app/infrastructure/repositories/gym.py
────────────────────────────────────────
Concrete repositories for gym domain models.
Each class adds domain-specific query methods on top of BaseRepository.
"""

from __future__ import annotations

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import RecordStatus
from app.domain.models.billing import BillingRuleConfig, DiscountOption
from app.domain.models.finance import (
    Expense,
    MonthlyClose,
    StaffSalaryRecord,
    TrainerSalaryRecord,
)
from app.domain.models.gym import Exercise, Member, MembershipTier, Staff, Trainer
from app.infrastructure.repositories.base import BaseRepository


class MemberRepository(BaseRepository[Member]):
    model = Member

    async def get_by_email(self, email: str) -> Member | None:
        stmt = select(Member).where(Member.email == email, Member.is_deleted == False)  # noqa
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get_by_code(self, code: str) -> Member | None:
        stmt = select(Member).where(Member.member_code == code, Member.is_deleted == False)  # noqa
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get_active_count(self) -> int:
        from sqlalchemy import func
        stmt = select(func.count()).select_from(Member).where(
            Member.status == RecordStatus.ACTIVE, Member.is_deleted == False  # noqa
        )
        return (await self.db.execute(stmt)).scalar_one()

    async def get_recent(self, limit: int = 5) -> list[Member]:
        stmt = (
            select(Member)
            .where(Member.is_deleted == False)  # noqa
            .order_by(Member.created_at.desc())
            .limit(limit)
        )
        return list((await self.db.execute(stmt)).scalars().all())


class TrainerRepository(BaseRepository[Trainer]):
    model = Trainer

    async def get_active(self) -> list[Trainer]:
        stmt = select(Trainer).where(
            Trainer.status == RecordStatus.ACTIVE, Trainer.is_deleted == False  # noqa
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_active_count(self) -> int:
        from sqlalchemy import func
        stmt = select(func.count()).select_from(Trainer).where(
            Trainer.status == RecordStatus.ACTIVE, Trainer.is_deleted == False  # noqa
        )
        return (await self.db.execute(stmt)).scalar_one()


class StaffRepository(BaseRepository[Staff]):
    model = Staff

    async def get_active(self) -> list[Staff]:
        stmt = select(Staff).where(
            Staff.status == RecordStatus.ACTIVE, Staff.is_deleted == False  # noqa
        )
        return list((await self.db.execute(stmt)).scalars().all())


class ExerciseRepository(BaseRepository[Exercise]):
    model = Exercise

    async def get_active(self) -> list[Exercise]:
        stmt = select(Exercise).where(
            Exercise.status == RecordStatus.ACTIVE, Exercise.is_deleted == False  # noqa
        )
        return list((await self.db.execute(stmt)).scalars().all())


class MembershipTierRepository(BaseRepository[MembershipTier]):
    model = MembershipTier

    async def get_all_ordered(self) -> list[MembershipTier]:
        stmt = select(MembershipTier).where(MembershipTier.is_deleted == False).order_by(  # noqa
            MembershipTier.sort_order
        )
        return list((await self.db.execute(stmt)).scalars().all())


class BillingRuleRepository(BaseRepository[BillingRuleConfig]):
    model = BillingRuleConfig

    async def get_by_key(self, key: str) -> BillingRuleConfig | None:
        stmt = select(BillingRuleConfig).where(
            BillingRuleConfig.rule_key == key,
            BillingRuleConfig.is_active == True,  # noqa
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get_all_active(self) -> list[BillingRuleConfig]:
        stmt = select(BillingRuleConfig).where(BillingRuleConfig.is_active == True)  # noqa
        return list((await self.db.execute(stmt)).scalars().all())


class DiscountOptionRepository(BaseRepository[DiscountOption]):
    model = DiscountOption

    async def get_active_ordered(self) -> list[DiscountOption]:
        stmt = (
            select(DiscountOption)
            .where(
                DiscountOption.status == RecordStatus.ACTIVE,
                DiscountOption.is_deleted == False,  # noqa
            )
            .order_by(DiscountOption.sort_order)
        )
        return list((await self.db.execute(stmt)).scalars().all())


class ExpenseRepository(BaseRepository[Expense]):
    model = Expense

    async def get_by_month(self, billing_month: str) -> list[Expense]:
        stmt = select(Expense).where(
            Expense.billing_month == billing_month,
            Expense.is_deleted == False,  # noqa
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def sum_by_month(self, billing_month: str) -> float:
        from sqlalchemy import func
        stmt = select(func.sum(Expense.amount)).where(
            Expense.billing_month == billing_month,
            Expense.is_deleted == False,  # noqa
        )
        result = (await self.db.execute(stmt)).scalar_one_or_none()
        return float(result or 0)


class SalaryRepository:
    """Unified salary repository for both staff and trainer records."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._staff = BaseRepository.__class_getitem__(StaffSalaryRecord)
        self._trainer = BaseRepository.__class_getitem__(TrainerSalaryRecord)

    async def get_staff_records_for_month(self, billing_month: str) -> list[StaffSalaryRecord]:
        stmt = select(StaffSalaryRecord).where(
            StaffSalaryRecord.billing_month == billing_month,
            StaffSalaryRecord.is_deleted == False,  # noqa
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_trainer_records_for_month(self, billing_month: str) -> list[TrainerSalaryRecord]:
        stmt = select(TrainerSalaryRecord).where(
            TrainerSalaryRecord.billing_month == billing_month,
            TrainerSalaryRecord.is_deleted == False,  # noqa
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def sum_staff_for_month(self, billing_month: str) -> float:
        from sqlalchemy import func
        stmt = select(func.sum(StaffSalaryRecord.net_salary)).where(
            StaffSalaryRecord.billing_month == billing_month
        )
        return float((await self.db.execute(stmt)).scalar_one_or_none() or 0)

    async def sum_trainer_for_month(self, billing_month: str) -> float:
        from sqlalchemy import func
        stmt = select(func.sum(TrainerSalaryRecord.net_earnings)).where(
            TrainerSalaryRecord.billing_month == billing_month
        )
        return float((await self.db.execute(stmt)).scalar_one_or_none() or 0)


class MonthlyCloseRepository(BaseRepository[MonthlyClose]):
    model = MonthlyClose

    async def get_by_month(self, billing_month: str) -> MonthlyClose | None:
        stmt = select(MonthlyClose).where(MonthlyClose.billing_month == billing_month)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get_all_ordered(self) -> list[MonthlyClose]:
        stmt = select(MonthlyClose).order_by(MonthlyClose.billing_month.desc())
        return list((await self.db.execute(stmt)).scalars().all())
