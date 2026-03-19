"""
app/api/v1/endpoints/auth.py
─────────────────────────────
Authentication endpoints: login, refresh, logout, me, register.
"""

from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.api.application.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,   # ← ADD this to your schemas.py (see below)
    TokenResponse,
    UserRead,
)
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.domain.models.user import RefreshToken, User
from app.infrastructure.database import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ─────────────────────────────────────────────────────────────
# REGISTER  (new)
# ─────────────────────────────────────────────────────────────
@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> User:
    # Check duplicate email
    stmt = select(User).where(User.email == body.email, User.is_deleted == False)  # noqa
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        full_name=body.full_name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="admin",        # default role — change if needed
        is_active=True,
        is_deleted=False,
    )
    db.add(user)
    await db.flush()        # gets user.id without committing
    await db.refresh(user)
    return user


# ─────────────────────────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    stmt = select(User).where(User.email == body.email, User.is_deleted == False)  # noqa
    user = (await db.execute(stmt)).scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    access  = create_access_token(subject=user.id, extra={"role": user.role.value})
    refresh = create_refresh_token(subject=user.id)

    db.add(RefreshToken(user_id=user.id, token_hash=_hash_token(refresh)))
    await db.flush()

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ─────────────────────────────────────────────────────────────
# REFRESH
# ─────────────────────────────────────────────────────────────
@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not a refresh token")

    token_hash = _hash_token(body.refresh_token)
    stmt = select(RefreshToken).where(
        RefreshToken.token_hash == token_hash,
        RefreshToken.is_revoked == False,  # noqa
    )
    stored = (await db.execute(stmt)).scalar_one_or_none()
    if not stored:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked or not found")

    stored.is_revoked = True
    user_id = payload["sub"]

    stmt2 = select(User).where(User.id == user_id)
    user = (await db.execute(stmt2)).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access  = create_access_token(subject=user.id, extra={"role": user.role.value})
    refresh = create_refresh_token(subject=user.id)
    db.add(RefreshToken(user_id=user.id, token_hash=_hash_token(refresh)))
    await db.flush()

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ─────────────────────────────────────────────────────────────
# LOGOUT
# ─────────────────────────────────────────────────────────────
@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    token_hash = _hash_token(body.refresh_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    stored = (await db.execute(stmt)).scalar_one_or_none()
    if stored:
        stored.is_revoked = True
        await db.flush()
    return {"detail": "Successfully logged out"}


# ─────────────────────────────────────────────────────────────
# ME
# ─────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserRead)
async def get_me(user: CurrentUser) -> User:
    return user


@router.put("/me/password", status_code=status.HTTP_200_OK)
async def change_password(
    body: ChangePasswordRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    user.hashed_password = hash_password(body.new_password)
    await db.flush()
    return {"detail": "Password updated successfully"}