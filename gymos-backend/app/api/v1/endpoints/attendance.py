"""
app/api/v1/endpoints/attendance.py
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.domain.models.attendance import Attendance, RawPunch
from app.domain.models.gym import Member
from app.infrastructure.database import get_db
from app.api.application.schemas import (
    AttendanceListResponse,
    AttendanceRead,
    ManualPunchInCreate,
    PunchInCreate,
    PunchOutUpdate,
    RawPunchCreate,
    RawPunchRead,
)

router = APIRouter(prefix="/attendance", tags=["Attendance"])


# ── Helper: device number → member_code conversion ───────────
def normalize_member_code(member_code: str | None) -> str | None:
    """
    The device sends a plain number such as '1', '2', or '003'.
    This function converts it to the M001, M002, M003 format.
    If the code already starts with 'M', it is returned as-is.
    """
    if not member_code:
        return None
    code = member_code.strip()
    if code.upper().startswith("M"):
        return code.upper()
    if code.isdigit():
        return f"M{int(code):03d}"
    return code


# ── Helper: member_code → member_id resolution ───────────────
async def resolve_member(
    db: AsyncSession,
    member_id: str | None,
    member_code: str | None,
) -> Member:
    if not member_id and not member_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either member_id or member_code is required.",
        )

    if member_id:
        stmt = select(Member).where(Member.id == member_id)
    else:
        normalized = normalize_member_code(member_code)
        stmt = select(Member).where(Member.member_code == normalized)

    member = (await db.execute(stmt)).scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member not found: {member_id or member_code}",
        )
    return member


# ══════════════════════════════════════════════════════════════
#  RAW PUNCH — public endpoint (for biometric device, no auth required)
# ══════════════════════════════════════════════════════════════

@router.post(
    "/raw-punch",
    response_model=RawPunchRead,
    status_code=status.HTTP_201_CREATED,
    summary="Device punch — inserts into raw_punches table (no auth)",
)
async def create_raw_punch(
    body: RawPunchCreate,
    db: AsyncSession = Depends(get_db),
) -> RawPunch:
    member = await resolve_member(db, body.member_id, body.member_code)
    punch_time = body.punched_at
    punch_date = punch_time.date()

    # ── Insert into raw_punches table ────────────────────────
    punch = RawPunch(
        member_id=member.id,
        member_code=member.member_code,
        punched_at=punch_time,
    )
    db.add(punch)
    await db.flush()
    await db.refresh(punch)

    # ── Process into the attendance table ────────────────────
    #
    #  Multi-punch logic:
    #   • 1st punch of the day  → creates a new attendance record (punch_in)
    #   • 2nd, 3rd ... Nth punch → keeps the original punch_in unchanged,
    #                              and overwrites punch_out with the latest time
    #
    #  Result: punch_in  = first punch of the day (never changes)
    #          punch_out = last  punch of the day (always updated)
    #
    stmt = select(Attendance).where(
        Attendance.member_id == member.id,
        Attendance.date == punch_date,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing:
        # Record already exists → punch_in stays as-is, only punch_out is updated.
        # Every consecutive punch overwrites punch_out so the LAST punch of the
        # day is always stored as the final punch_out.
        existing.punch_out = punch_time
    else:
        # No record for today → this is the very first punch, create punch_in.
        record = Attendance(
            member_id=member.id,
            member_code=member.member_code,
            date=punch_date,
            punch_in=punch_time,
            punch_out=None,
            is_present=True,
        )
        db.add(record)

    await db.flush()
    return punch


# ══════════════════════════════════════════════════════════════
#  MANUAL PUNCH-IN
# ══════════════════════════════════════════════════════════════

@router.post(
    "/manual-punch-in",
    response_model=AttendanceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Admin manual punch-in override",
)
async def manual_punch_in(
    body: ManualPunchInCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Attendance:
    member = await resolve_member(db, None, body.member_code)

    stmt = select(Attendance).where(
        Attendance.member_id == member.id,
        Attendance.date == body.attendance_date,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An attendance record for {member.member_code} on {body.attendance_date} already exists.",
        )

    record = Attendance(
        member_id=member.id,
        member_code=member.member_code,
        date=body.attendance_date,
        punch_in=body.punch_in,
        punch_out=None,
        is_present=True,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return record


# ══════════════════════════════════════════════════════════════
#  PUNCH-IN
# ══════════════════════════════════════════════════════════════

@router.post(
    "/punch-in",
    response_model=AttendanceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Punch-in (accepts both member_id and member_code)",
)
async def punch_in(
    body: PunchInCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Attendance:
    member = await resolve_member(db, body.member_id, body.member_code)

    stmt = select(Attendance).where(
        Attendance.member_id == member.id,
        Attendance.date == body.attendance_date,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Record already exists for {member.member_code} on {body.attendance_date}.",
        )

    record = Attendance(
        member_id=member.id,
        member_code=member.member_code,
        date=body.attendance_date,
        punch_in=body.punch_in,
        punch_out=None,
        is_present=True,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return record


# ══════════════════════════════════════════════════════════════
#  PUNCH-OUT
#  Supports lookup by attendance_id (URL path) OR by
#  member_id / member_code + date (query params).
# ══════════════════════════════════════════════════════════════

@router.patch(
    "/{attendance_id}/punch-out",
    response_model=AttendanceRead,
    summary="Update punch-out timestamp (lookup by attendance_id, member_id, or member_code)",
)
async def punch_out(
    attendance_id: str,
    body: PunchOutUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    member_id: str | None = Query(default=None),
    member_code: str | None = Query(default=None),
    punch_date: date | None = Query(default=None, alias="date"),
) -> Attendance:
    record = None

    # ── Strategy 1: lookup directly by attendance_id ─────────
    if attendance_id != "by-member":
        stmt = select(Attendance).where(Attendance.id == attendance_id)
        record = (await db.execute(stmt)).scalar_one_or_none()

    # ── Strategy 2: lookup by member_id or member_code + date ─
    if record is None and (member_id or member_code):
        member = await resolve_member(db, member_id, member_code)
        target_date = punch_date or datetime.now(timezone.utc).date()
        stmt = select(Attendance).where(
            Attendance.member_id == member.id,
            Attendance.date == target_date,
        )
        record = (await db.execute(stmt)).scalar_one_or_none()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record not found for the provided identifiers.",
        )

    record.punch_out = body.punch_out
    await db.flush()
    await db.refresh(record)
    return record


# ══════════════════════════════════════════════════════════════
#  LIST ATTENDANCE
# ══════════════════════════════════════════════════════════════

@router.get(
    "",
    response_model=AttendanceListResponse,
    summary="List attendance for a given date — member_code is included in the response",
)
async def list_attendance(
    user: CurrentUser,
    attendance_date: date = Query(default=None, alias="date"),
    member_id: str | None = Query(default=None),
    member_code: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> AttendanceListResponse:
    target_date = attendance_date or datetime.now(timezone.utc).date()
    stmt = select(Attendance).where(Attendance.date == target_date)

    if member_id:
        stmt = stmt.where(Attendance.member_id == member_id)
    if member_code:
        stmt = stmt.where(Attendance.member_code == normalize_member_code(member_code))

    stmt = stmt.order_by(Attendance.punch_in)
    records = (await db.execute(stmt)).scalars().all()
    return AttendanceListResponse(items=list(records), total=len(records))


# ══════════════════════════════════════════════════════════════
#  LIST RAW PUNCHES
# ══════════════════════════════════════════════════════════════

@router.get(
    "/raw-punches",
    response_model=list[RawPunchRead],
    summary="List raw punches — filterable by member_code",
)
async def list_raw_punches(
    user: CurrentUser,
    member_id: str | None = Query(default=None),
    member_code: str | None = Query(default=None),
    punch_date: date | None = Query(default=None, alias="date"),
    db: AsyncSession = Depends(get_db),
) -> list[RawPunch]:
    stmt = select(RawPunch)
    if member_id:
        stmt = stmt.where(RawPunch.member_id == member_id)
    if member_code:
        stmt = stmt.where(RawPunch.member_code == normalize_member_code(member_code))
    if punch_date:
        stmt = stmt.where(func.date(RawPunch.punched_at) == punch_date)
    stmt = stmt.order_by(RawPunch.punched_at)
    return (await db.execute(stmt)).scalars().all()