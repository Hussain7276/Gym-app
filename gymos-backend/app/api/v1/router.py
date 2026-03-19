"""
app/api/v1/router.py
─────────────────────
Aggregates all v1 endpoint routers into one APIRouter
that main.py mounts under /api/v1.
"""

from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.config import router as config_router
from app.api.v1.endpoints.finance import (
    billing_rules_router,
    discounts_router,
    expenses_router,
    invoices_router,
    month_close_router,
    reports_router,
    salaries_router,
    dashboard_router,
)
from app.api.v1.endpoints.gym import (
    exercises_router,
    members_router,
    staff_router,
    tiers_router,
    trainers_router,
)
from app.api.v1.endpoints.attendance import router as attendance_router
from app.api.v1.endpoints.membership import router as membership_router

api_router = APIRouter()

# ── Auth ───────────────────────────────────────────────
api_router.include_router(auth_router)

# ── App Config ─────────────────────────────────────────
api_router.include_router(config_router)

# ── Gym Domain ─────────────────────────────────────────
api_router.include_router(tiers_router)
api_router.include_router(members_router)
api_router.include_router(trainers_router)
api_router.include_router(staff_router)
api_router.include_router(exercises_router)

# ── Finance ────────────────────────────────────────────
api_router.include_router(billing_rules_router)
api_router.include_router(discounts_router)
api_router.include_router(invoices_router)
api_router.include_router(expenses_router)
api_router.include_router(salaries_router)
api_router.include_router(reports_router)
api_router.include_router(dashboard_router)
api_router.include_router(month_close_router)

# ── Attendance ─────────────────────────────────────────
api_router.include_router(attendance_router)

# ── Membership ─────────────────────────────────────────
api_router.include_router(membership_router)