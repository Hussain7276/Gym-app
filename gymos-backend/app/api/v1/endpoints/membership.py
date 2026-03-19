"""
app/api/v1/endpoints/membership.py
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.domain.models.membership import Membership
from app.infrastructure.database import get_db
from app.api.application.schemas import (
    MembershipCreate,
    MembershipUpdate,
    MembershipResponse,
    MembershipRenewRequest,
    MembershipStatsResponse,
)

router = APIRouter(prefix="/memberships", tags=["Membership"])


@router.get("", response_model=list[MembershipResponse])
async def get_all(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[Membership]:
    stmt = select(Membership).order_by(Membership.id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/member/{member_id}", response_model=list[MembershipResponse])
async def get_by_member(
    member_id: str,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> list[Membership]:
    stmt = select(Membership).where(Membership.member_id == member_id).order_by(Membership.id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{membership_id}", response_model=MembershipResponse)
async def get_by_id(
    membership_id: str,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> Membership:
    stmt = select(Membership).where(Membership.id == membership_id)
    membership = (await db.execute(stmt)).scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Membership {membership_id} not found.",
        )
    return membership


@router.post("", response_model=MembershipResponse, status_code=status.HTTP_201_CREATED)
async def create(
    body: MembershipCreate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> Membership:
    membership = Membership(**body.model_dump())
    db.add(membership)
    await db.flush()
    await db.refresh(membership)
    return membership


@router.put("/{membership_id}", response_model=MembershipResponse)
async def update(
    membership_id: str,
    body: MembershipUpdate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> Membership:
    stmt = select(Membership).where(Membership.id == membership_id)
    membership = (await db.execute(stmt)).scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Membership {membership_id} not found.",
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(membership, field, value)
    await db.flush()
    await db.refresh(membership)
    return membership


@router.post("/{membership_id}/renew", response_model=MembershipResponse)
async def renew(
    membership_id: str,
    body: MembershipRenewRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> Membership:
    stmt = select(Membership).where(Membership.id == membership_id)
    membership = (await db.execute(stmt)).scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Membership {membership_id} not found.",
        )
    from dateutil.relativedelta import relativedelta
    membership.end_date  = membership.end_date + relativedelta(months=body.months)
    membership.is_active = True
    await db.flush()
    await db.refresh(membership)
    return membership


@router.delete("/{membership_id}", response_model=MembershipResponse)
async def deactivate(
    membership_id: str,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = None,
) -> Membership:
    stmt = select(Membership).where(Membership.id == membership_id)
    membership = (await db.execute(stmt)).scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Membership {membership_id} not found.",
        )
    membership.is_active = False
    await db.flush()
    await db.refresh(membership)
    return membership