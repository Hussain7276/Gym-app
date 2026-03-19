"""
app/api/v1/endpoints/gym.py
────────────────────────────
CRUD endpoints for Members, Trainers, Staff, Exercises, Membership Tiers.
Uses a generic pattern: each resource has get-all, get-one, create, update, delete.
"""

from __future__ import annotations

import math
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, Pagination, get_pagination, require_roles
from app.api.application.schemas import (
    ExerciseCreate,
    ExerciseRead,
    ExerciseUpdate,
    MemberCreate,
    MemberRead,
    MemberReadWithTier,
    MemberUpdate,
    MembershipTierCreate,
    MembershipTierRead,
    MembershipTierUpdate,
    PaginatedResponse,
    StaffCreate,
    StaffRead,
    StaffUpdate,
    SuccessResponse,
    TrainerCreate,
    TrainerRead,
    TrainerUpdate,
)
from app.api.application.services.code_generator import CodeGenerator
from app.domain.enums import RecordStatus, UserRole
from app.domain.models.gym import Exercise, Member, MembershipTier, Staff, Trainer
from app.infrastructure.database import get_db
from app.infrastructure.repositories.gym import (
    ExerciseRepository,
    MemberRepository,
    MembershipTierRepository,
    StaffRepository,
    TrainerRepository,
)


# ── Helper: UUID ya tier_id dono se tier dhundho ─────────────────
async def _get_tier_by_any(tier_id: str, db: AsyncSession) -> MembershipTier | None:
    repo = MembershipTierRepository(db)
    tier = await repo.get_by_id(tier_id)  # pehle UUID se try karo
    if not tier:
        # UUID se nahi mila — tier_id (basic/silver/gold/platinum) se try karo
        stmt = select(MembershipTier).where(MembershipTier.tier_id == tier_id)
        tier = (await db.execute(stmt)).scalar_one_or_none()
    return tier


# ═══════════════════════════════════════════════════════
#  MEMBERSHIP TIERS  —  /tiers
# ═══════════════════════════════════════════════════════

tiers_router = APIRouter(prefix="/tiers", tags=["Membership Tiers"])


@tiers_router.get("", response_model=list[MembershipTierRead])
async def list_tiers(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Any:
    repo = MembershipTierRepository(db)
    return await repo.get_all_ordered()


@tiers_router.get("/{tier_id}", response_model=MembershipTierRead)
async def get_tier(tier_id: str, user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    tier = await _get_tier_by_any(tier_id, db)
    if not tier:
        raise HTTPException(status_code=404, detail="Membership tier not found")
    return tier


@tiers_router.post("", response_model=MembershipTierRead, status_code=201,
                   dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def create_tier(body: MembershipTierCreate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = MembershipTierRepository(db)
    if await repo.exists(tier_id=body.tier_id):
        raise HTTPException(status_code=409, detail="Tier ID already exists")
    tier = MembershipTier(**body.model_dump())
    return await repo.create(tier)


@tiers_router.put("/{tier_id}", response_model=MembershipTierRead,
                  dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def update_tier(tier_id: str, body: MembershipTierUpdate, db: AsyncSession = Depends(get_db)) -> Any:
    tier = await _get_tier_by_any(tier_id, db)
    if not tier:
        raise HTTPException(status_code=404, detail="Membership tier not found")
    repo = MembershipTierRepository(db)
    return await repo.update(tier, body.model_dump(exclude_none=True))


# ═══════════════════════════════════════════════════════
#  MEMBERS  —  /members
# ═══════════════════════════════════════════════════════

members_router = APIRouter(prefix="/members", tags=["Members"])


@members_router.get("", response_model=PaginatedResponse[MemberRead])
async def list_members(
    user: CurrentUser,
    pagination: Pagination,
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(None),
    status: RecordStatus | None = Query(None),
    membership_tier_id: str | None = Query(None),
) -> Any:
    repo = MemberRepository(db)
    filters = []
    if search:
        q = f"%{search}%"
        filters.append(or_(Member.full_name.ilike(q), Member.email.ilike(q)))
    if status:
        filters.append(Member.status == status)
    if membership_tier_id:
        filters.append(Member.membership_tier_id == membership_tier_id)

    rows, total = await repo.get_all(
        skip=pagination.skip, limit=pagination.limit, filters=filters or None,
        order_by=Member.created_at.desc()
    )
    pages = math.ceil(total / pagination.size) if total else 1
    return PaginatedResponse(items=rows, total=total, page=pagination.page, size=pagination.size, pages=pages)


@members_router.get("/{member_id}", response_model=MemberRead)
async def get_member(member_id: str, user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    repo = MemberRepository(db)
    m = await repo.get_by_id(member_id)
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    return m


@members_router.post("", response_model=MemberRead, status_code=201,
                     dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)])
async def create_member(body: MemberCreate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = MemberRepository(db)
    if await repo.exists(email=body.email):
        raise HTTPException(status_code=409, detail="Email already registered")
    gen = CodeGenerator(db)
    member = Member(
        **body.model_dump(exclude={"extra_data"}),
        member_code=await gen.next_member_code(),
        extra_data=body.extra_data,
        status=RecordStatus.ACTIVE,
    )
    return await repo.create(member)


@members_router.put("/{member_id}", response_model=MemberRead,
                    dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)])
async def update_member(member_id: str, body: MemberUpdate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = MemberRepository(db)
    m = await repo.get_by_id(member_id)
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    return await repo.update(m, body.model_dump(exclude_none=True))


@members_router.delete("/{member_id}", response_model=SuccessResponse,
                       dependencies=[require_roles(UserRole.ADMIN)])
async def delete_member(member_id: str, db: AsyncSession = Depends(get_db)) -> Any:
    repo = MemberRepository(db)
    m = await repo.get_by_id(member_id)
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    await repo.soft_delete(m)
    return SuccessResponse(message="Member archived successfully")


# ═══════════════════════════════════════════════════════
#  TRAINERS  —  /trainers
# ═══════════════════════════════════════════════════════

trainers_router = APIRouter(prefix="/trainers", tags=["Trainers"])


@trainers_router.get("", response_model=PaginatedResponse[TrainerRead])
async def list_trainers(
    user: CurrentUser,
    pagination: Pagination,
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(None),
    status: RecordStatus | None = Query(None),
) -> Any:
    repo = TrainerRepository(db)
    filters = []
    if search:
        q = f"%{search}%"
        filters.append(or_(Trainer.full_name.ilike(q), Trainer.email.ilike(q)))
    if status:
        filters.append(Trainer.status == status)
    rows, total = await repo.get_all(
        skip=pagination.skip, limit=pagination.limit, filters=filters or None
    )
    pages = math.ceil(total / pagination.size) if total else 1
    return PaginatedResponse(items=rows, total=total, page=pagination.page, size=pagination.size, pages=pages)


@trainers_router.get("/active", response_model=list[TrainerRead])
async def list_active_trainers(user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    return await TrainerRepository(db).get_active()


@trainers_router.get("/{trainer_id}", response_model=TrainerRead)
async def get_trainer(trainer_id: str, user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    t = await TrainerRepository(db).get_by_id(trainer_id)
    if not t:
        raise HTTPException(status_code=404, detail="Trainer not found")
    return t


@trainers_router.post("", response_model=TrainerRead, status_code=201,
                      dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def create_trainer(body: TrainerCreate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = TrainerRepository(db)
    if await repo.exists(email=body.email):
        raise HTTPException(status_code=409, detail="Email already registered")
    gen = CodeGenerator(db)
    trainer = Trainer(
        **body.model_dump(exclude={"extra_data"}),
        trainer_code=await gen.next_trainer_code(),
        extra_data=body.extra_data,
        status=RecordStatus.ACTIVE,
    )
    return await repo.create(trainer)


@trainers_router.put("/{trainer_id}", response_model=TrainerRead,
                     dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def update_trainer(trainer_id: str, body: TrainerUpdate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = TrainerRepository(db)
    t = await repo.get_by_id(trainer_id)
    if not t:
        raise HTTPException(status_code=404, detail="Trainer not found")
    return await repo.update(t, body.model_dump(exclude_none=True))


@trainers_router.delete("/{trainer_id}", response_model=SuccessResponse,
                        dependencies=[require_roles(UserRole.ADMIN)])
async def delete_trainer(trainer_id: str, db: AsyncSession = Depends(get_db)) -> Any:
    repo = TrainerRepository(db)
    t = await repo.get_by_id(trainer_id)
    if not t:
        raise HTTPException(status_code=404, detail="Trainer not found")
    await repo.soft_delete(t)
    return SuccessResponse(message="Trainer archived successfully")


# ═══════════════════════════════════════════════════════
#  STAFF  —  /staff
# ═══════════════════════════════════════════════════════

staff_router = APIRouter(prefix="/staff", tags=["Staff"])


@staff_router.get("", response_model=PaginatedResponse[StaffRead])
async def list_staff(
    user: CurrentUser,
    pagination: Pagination,
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(None),
    status: RecordStatus | None = Query(None),
) -> Any:
    repo = StaffRepository(db)
    filters = []
    if search:
        q = f"%{search}%"
        filters.append(or_(Staff.full_name.ilike(q), Staff.email.ilike(q)))
    if status:
        filters.append(Staff.status == status)
    rows, total = await repo.get_all(skip=pagination.skip, limit=pagination.limit, filters=filters or None)
    pages = math.ceil(total / pagination.size) if total else 1
    return PaginatedResponse(items=rows, total=total, page=pagination.page, size=pagination.size, pages=pages)


@staff_router.post("", response_model=StaffRead, status_code=201,
                   dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def create_staff(body: StaffCreate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = StaffRepository(db)
    if await repo.exists(email=body.email):
        raise HTTPException(status_code=409, detail="Email already registered")
    gen = CodeGenerator(db)
    staff = Staff(
        **body.model_dump(exclude={"extra_data"}),
        staff_code=await gen.next_staff_code(),
        extra_data=body.extra_data,
        status=RecordStatus.ACTIVE,
    )
    return await repo.create(staff)


@staff_router.put("/{staff_id}", response_model=StaffRead,
                  dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def update_staff(staff_id: str, body: StaffUpdate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = StaffRepository(db)
    s = await repo.get_by_id(staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="Staff not found")
    return await repo.update(s, body.model_dump(exclude_none=True))


@staff_router.delete("/{staff_id}", response_model=SuccessResponse,
                     dependencies=[require_roles(UserRole.ADMIN)])
async def delete_staff(staff_id: str, db: AsyncSession = Depends(get_db)) -> Any:
    repo = StaffRepository(db)
    s = await repo.get_by_id(staff_id)
    if not s:
        raise HTTPException(status_code=404, detail="Staff not found")
    await repo.soft_delete(s)
    return SuccessResponse(message="Staff archived successfully")


# ═══════════════════════════════════════════════════════
#  EXERCISES  —  /exercises
# ═══════════════════════════════════════════════════════

exercises_router = APIRouter(prefix="/exercises", tags=["Exercises"])


@exercises_router.get("", response_model=PaginatedResponse[ExerciseRead])
async def list_exercises(
    user: CurrentUser,
    pagination: Pagination,
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(None),
    status: RecordStatus | None = Query(None),
    category: str | None = Query(None),
) -> Any:
    repo = ExerciseRepository(db)
    filters = []
    if search:
        filters.append(Exercise.name.ilike(f"%{search}%"))
    if status:
        filters.append(Exercise.status == status)
    if category:
        filters.append(Exercise.category == category)
    rows, total = await repo.get_all(skip=pagination.skip, limit=pagination.limit, filters=filters or None)
    pages = math.ceil(total / pagination.size) if total else 1
    return PaginatedResponse(items=rows, total=total, page=pagination.page, size=pagination.size, pages=pages)


@exercises_router.get("/active", response_model=list[ExerciseRead])
async def list_active_exercises(user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    return await ExerciseRepository(db).get_active()


@exercises_router.get("/{exercise_id}", response_model=ExerciseRead)
async def get_exercise(exercise_id: str, user: CurrentUser, db: AsyncSession = Depends(get_db)) -> Any:
    ex = await ExerciseRepository(db).get_by_id(exercise_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return ex


@exercises_router.post("", response_model=ExerciseRead, status_code=201,
                       dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def create_exercise(body: ExerciseCreate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = ExerciseRepository(db)
    gen = CodeGenerator(db)
    ex = Exercise(
        **body.model_dump(exclude={"extra_data"}),
        exercise_code=await gen.next_exercise_code(),
        extra_data=body.extra_data,
        status=RecordStatus.ACTIVE,
    )
    return await repo.create(ex)


@exercises_router.put("/{exercise_id}", response_model=ExerciseRead,
                      dependencies=[require_roles(UserRole.ADMIN, UserRole.MANAGER)])
async def update_exercise(exercise_id: str, body: ExerciseUpdate, db: AsyncSession = Depends(get_db)) -> Any:
    repo = ExerciseRepository(db)
    ex = await repo.get_by_id(exercise_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return await repo.update(ex, body.model_dump(exclude_none=True))


@exercises_router.delete("/{exercise_id}", response_model=SuccessResponse,
                         dependencies=[require_roles(UserRole.ADMIN)])
async def delete_exercise(exercise_id: str, db: AsyncSession = Depends(get_db)) -> Any:
    repo = ExerciseRepository(db)
    ex = await repo.get_by_id(exercise_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    await repo.soft_delete(ex)
    return SuccessResponse(message="Exercise archived successfully")