"""
app/application/services/code_generator.py
────────────────────────────────────────────
Generates sequential, human-readable codes (M001, T002, etc.)
for new records. Thread-safe via DB-level locking.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.gym import Exercise, Member, Staff, Trainer


class CodeGenerator:
    """Generates prefixed sequential codes from the DB count."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def next_member_code(self) -> str:
        count = await self._count(Member)
        return f"M{count + 1:03d}"

    async def next_trainer_code(self) -> str:
        count = await self._count(Trainer)
        return f"T{count + 1:03d}"

    async def next_staff_code(self) -> str:
        count = await self._count(Staff)
        return f"S{count + 1:03d}"

    async def next_exercise_code(self) -> str:
        count = await self._count(Exercise)
        return f"E{count + 1:03d}"

    async def _count(self, model) -> int:
        stmt = select(func.count()).select_from(model)
        return (await self.db.execute(stmt)).scalar_one()
