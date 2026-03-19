"""
app/infrastructure/repositories/base.py
─────────────────────────────────────────
Generic async repository. All domain repositories extend this base
to get standard CRUD, filtering, pagination, and soft-delete for free.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.base import BaseModel

ModelType = TypeVar("ModelType", bound=BaseModel)


class BaseRepository(Generic[ModelType]):
    """
    Generic repository with typed CRUD operations.

    Usage:
        class MemberRepository(BaseRepository[Member]):
            model = Member
    """

    model: type[ModelType]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Read ─────────────────────────────────────────────────────

    async def get_by_id(self, record_id: str, include_deleted: bool = False) -> ModelType | None:
        stmt = select(self.model).where(self.model.id == record_id)
        if not include_deleted:
            stmt = stmt.where(self.model.is_deleted == False)  # noqa: E712
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all(
        self,
        *,
        skip: int = 0,
        limit: int = 20,
        filters: list[Any] | None = None,
        order_by: Any | None = None,
        include_deleted: bool = False,
    ) -> tuple[list[ModelType], int]:
        """Returns (rows, total_count) for pagination."""
        base_filter = [] if include_deleted else [self.model.is_deleted == False]  # noqa: E712
        if filters:
            base_filter.extend(filters)

        where_clause = and_(*base_filter) if base_filter else True

        # Count query
        count_stmt = select(func.count()).select_from(self.model).where(where_clause)
        total = (await self.db.execute(count_stmt)).scalar_one()

        # Data query
        stmt = select(self.model).where(where_clause).offset(skip).limit(limit)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    # ── Write ────────────────────────────────────────────────────

    async def create(self, obj: ModelType) -> ModelType:
        self.db.add(obj)
        await self.db.flush()        # get DB-generated defaults (created_at etc.)
        await self.db.refresh(obj)
        return obj

    async def update(self, obj: ModelType, data: dict[str, Any]) -> ModelType:
        for key, value in data.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def soft_delete(self, obj: ModelType) -> ModelType:
        obj.is_deleted = True
        obj.deleted_at = datetime.now(tz=timezone.utc)
        await self.db.flush()
        return obj

    async def hard_delete(self, obj: ModelType) -> None:
        await self.db.delete(obj)
        await self.db.flush()

    # ── Helpers ──────────────────────────────────────────────────

    async def exists(self, **kwargs: Any) -> bool:
        conditions = [getattr(self.model, k) == v for k, v in kwargs.items()]
        stmt = select(func.count()).select_from(self.model).where(
            and_(*conditions, self.model.is_deleted == False)  # noqa: E712
        )
        count = (await self.db.execute(stmt)).scalar_one()
        return count > 0
