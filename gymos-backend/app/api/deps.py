"""
app/api/deps.py
────────────────
FastAPI dependency functions.
  • get_current_user  — validates JWT, returns User ORM object
  • require_roles     — RBAC factory (creates role-checking Depends)
  • get_pagination    — standard page/size query params
  • get_audit_context — collects IP + user for AuditLog writes
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.domain.enums import UserRole
from app.domain.models.user import User
from app.infrastructure.database import get_db

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decode JWT and fetch the User from DB. Raises 401 on any failure."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials)
        user_id: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if user_id is None or token_type != "access":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    stmt = select(User).where(User.id == user_id, User.is_deleted == False)  # noqa
    user = (await db.execute(stmt)).scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: UserRole):
    """
    RBAC dependency factory.

    Usage:
        @router.get("/admin-only")
        async def admin_endpoint(user: CurrentUser, _=Depends(require_roles(UserRole.ADMIN))):
            ...
    """
    allowed = set(roles)

    async def checker(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation requires one of: {[r.value for r in allowed]}",
            )
        return user

    return Depends(checker)


# ── Pagination ────────────────────────────────────────────────────

@dataclass
class PaginationParams:
    page: int
    size: int

    @property
    def skip(self) -> int:
        return (self.page - 1) * self.size

    @property
    def limit(self) -> int:
        return self.size


async def get_pagination(
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    size: int = Query(default=20, ge=1, le=100, description="Items per page"),
) -> PaginationParams:
    return PaginationParams(page=page, size=size)


Pagination = Annotated[PaginationParams, Depends(get_pagination)]


# ── Audit context ─────────────────────────────────────────────────

@dataclass
class AuditContext:
    user_id: str
    ip_address: str | None


async def get_audit_context(request: Request, user: CurrentUser) -> AuditContext:
    ip = request.client.host if request.client else None
    return AuditContext(user_id=user.id, ip_address=ip)


AuditCtx = Annotated[AuditContext, Depends(get_audit_context)]
