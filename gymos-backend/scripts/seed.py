"""
scripts/seed.py
────────────────
Production seeder — idempotent (safe to run multiple times).
Seeds: admin user, membership tiers, billing rules, discount options,
       app settings, module config, KPI config, chart config.

Run: python scripts/seed.py
"""

from __future__ import annotations

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.domain.enums import DiscountType, RecordStatus, UserRole
from app.domain.models import (
    AppSetting,
    BillingRuleConfig,
    ChartConfig,
    DiscountOption,
    KpiConfig,
    MembershipTier,
    ModuleConfig,
    User,
)

engine = create_async_engine(settings.DATABASE_URL, echo=False)
Session = async_sessionmaker(bind=engine, expire_on_commit=False)


async def upsert(db: AsyncSession, model, lookup_field: str, lookup_value, data: dict):
    stmt = select(model).where(getattr(model, lookup_field) == lookup_value)
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if obj:
        for k, v in data.items():
            setattr(obj, k, v)
    else:
        obj = model(**{lookup_field: lookup_value, **data})
        db.add(obj)
    return obj


async def seed():
    async with Session() as db:
        print("▶ Seeding admin user…")
        await upsert(db, User, "email", "admin@gymos.io", {
            "hashed_password": hash_password("GymOS@Admin2025!"),
            "full_name": "System Administrator",
            "role": UserRole.ADMIN,
            "is_active": True,
            "is_superuser": True,
        })

        print("▶ Seeding membership tiers…")
        # monthly_fee is 0 by default — set actual fees from the Tiers page in the app.
        tiers = [
            {
                "tier_id":     "basic",
                "name":        "Basic",
                "monthly_fee": 0,
                "color":       "#06B6D4",
                "badge":       None,
                "sort_order":  1,
                "extra_data":  {"features": ["Treadmill", "Cycling", "Balance & Core"]},
            },
            {
                "tier_id":     "silver",
                "name":        "Silver",
                "monthly_fee": 0,
                "color":       "#8B5CF6",
                "badge":       None,
                "sort_order":  2,
                "extra_data":  {"features": ["All Basic", "Weight Training", "Yoga Flow", "Power Lifting"]},
            },
            {
                "tier_id":     "gold",
                "name":        "Gold",
                "monthly_fee": 0,
                "color":       "#F59E0B",
                "badge":       "POPULAR",
                "sort_order":  3,
                "extra_data":  {"features": ["All Silver", "HIIT Blast", "Tabata", "Boxing", "Pilates"]},
            },
            {
                "tier_id":     "platinum",
                "name":        "Platinum",
                "monthly_fee": 0,
                "color":       "#4F46E5",
                "badge":       "BEST VALUE",
                "sort_order":  4,
                "extra_data":  {"features": ["All Gold", "Kickboxing", "CrossFit", "Personal Trainer"]},
            },
        ]
        for t in tiers:
            await upsert(db, MembershipTier, "tier_id", t["tier_id"], t)

        print("▶ Seeding billing rules…")
        rules = [
            {"rule_key": "tax_rate",           "rule_value": "0.00",  "label": "Sales Tax Rate",          "value_type": "float", "description": "Applied to taxable amount after discounts"},
            {"rule_key": "late_fee",           "rule_value": "0.00",  "label": "Late Payment Fee",        "value_type": "float", "description": "Flat fee applied to overdue invoices"},
            {"rule_key": "trainer_multiplier", "rule_value": "1.0",   "label": "Trainer Rate Multiplier", "value_type": "float", "description": "Multiplied by hourly_rate × sessions"},
        ]
        for r in rules:
            await upsert(db, BillingRuleConfig, "rule_key", r["rule_key"], {**r, "is_active": True})

        print("▶ Seeding discount options…")
        discounts = [
            {"discount_code": "student",   "label": "Student Discount", "description": "Valid student ID required",      "discount_type": DiscountType.PERCENTAGE, "value": 10, "icon": "🎓", "color": "#38BFFF", "requires_note": False, "sort_order": 1},
            {"discount_code": "senior",    "label": "Senior Citizen",   "description": "Age 60+ with valid ID",          "discount_type": DiscountType.PERCENTAGE, "value": 15, "icon": "🧓", "color": "#9B7FFF", "requires_note": False, "sort_order": 2},
            {"discount_code": "referral",  "label": "Referral Bonus",   "description": "Referred by an existing member", "discount_type": DiscountType.PERCENTAGE, "value": 5,  "icon": "🤝", "color": "#C8FF00", "requires_note": True,  "sort_order": 3},
            {"discount_code": "loyalty",   "label": "Loyalty Reward",   "description": "Member for 12+ months",          "discount_type": DiscountType.PERCENTAGE, "value": 8,  "icon": "⭐", "color": "#FFB020", "requires_note": False, "sort_order": 4},
            {"discount_code": "flat50",    "label": "Flat Rs.50 Off",   "description": "Management-approved courtesy",   "discount_type": DiscountType.FLAT,       "value": 50, "icon": "💸", "color": "#FF4455", "requires_note": True,  "sort_order": 5},
        ]
        for d in discounts:
            await upsert(db, DiscountOption, "discount_code", d["discount_code"], {**d, "status": RecordStatus.ACTIVE})

        print("▶ Seeding app settings…")
        app_settings = [
            {"setting_key": "app_name",     "setting_value": "GymOS",            "is_public": True},
            {"setting_key": "tagline",      "setting_value": "Management System", "is_public": True},
            {"setting_key": "logo",         "setting_value": "⬡",                "is_public": True},
            {"setting_key": "version",      "setting_value": "v2",                "is_public": True},
            {"setting_key": "accent_color", "setting_value": "#4F46E5",           "is_public": True},
            {"setting_key": "theme",        "setting_value": "aurora",            "is_public": True},
        ]
        for s in app_settings:
            await upsert(db, AppSetting, "setting_key", s["setting_key"], s)

        print("▶ Seeding module configs…")
        modules = [
            {"module_id": "dashboard",  "label": "Dashboard",    "icon": "◈", "section": "OVERVIEW",   "page_type": "dashboard", "sort_order": 1,  "allowed_roles": None},
            {"module_id": "attendance", "label": "Attendance",   "icon": "⏱", "section": "OVERVIEW",   "page_type": "attendance","sort_order": 2,  "allowed_roles": None},
            {"module_id": "members",    "label": "Members",      "icon": "◉", "section": "MANAGEMENT", "page_type": "crud",      "sort_order": 3,  "data_key": "members",   "schema_key": "members",   "allowed_roles": ["admin","manager","staff"]},
            {"module_id": "trainers",   "label": "Trainers",     "icon": "◆", "section": "MANAGEMENT", "page_type": "crud",      "sort_order": 4,  "data_key": "trainers",  "schema_key": "trainers",  "allowed_roles": ["admin","manager"]},
            {"module_id": "staff",      "label": "Staff",        "icon": "◇", "section": "MANAGEMENT", "page_type": "crud",      "sort_order": 5,  "data_key": "staff",     "schema_key": "staff",     "allowed_roles": ["admin","manager"]},
            {"module_id": "exercises",  "label": "Exercises",    "icon": "◎", "section": "MANAGEMENT", "page_type": "crud",      "sort_order": 6,  "data_key": "exercises", "schema_key": "exercises", "allowed_roles": None},
            {"module_id": "tiers",      "label": "Tiers",        "icon": "◈", "section": "MANAGEMENT", "page_type": "tiers",     "sort_order": 7,  "allowed_roles": ["admin","manager"]},
            {"module_id": "billing",    "label": "Bulk Billing", "icon": "◈", "section": "FINANCE",    "page_type": "billing",   "sort_order": 8,  "allowed_roles": ["admin","manager","staff"]},
            {"module_id": "salaries",   "label": "Salaries",     "icon": "◉", "section": "FINANCE",    "page_type": "salaries",  "sort_order": 9,  "allowed_roles": ["admin","manager"]},
            {"module_id": "expenses",   "label": "Expenses",     "icon": "◆", "section": "FINANCE",    "page_type": "crud",      "sort_order": 10, "data_key": "expenses",  "schema_key": "expenses",  "allowed_roles": ["admin","manager"]},
            {"module_id": "reports",    "label": "Reports",      "icon": "◇", "section": "ANALYTICS",  "page_type": "reports",   "sort_order": 11, "allowed_roles": ["admin","manager"]},
        ]
        for m in modules:
            await upsert(db, ModuleConfig, "module_id", m["module_id"], {**m, "is_active": True})

        print("▶ Seeding KPI configs…")
        kpis = [
            {"kpi_id": "revenue",  "label": "Monthly Revenue", "icon": "💰", "color": "#4F46E5", "data_source": "revenueLatest",  "value_key": "revenue", "format": "currency_k", "sub_template": "Total gross income", "change_key": "revenueChange", "sort_order": 1},
            {"kpi_id": "members",  "label": "Active Members",  "icon": "👥", "color": "#06B6D4", "data_source": "revenueLatest",  "value_key": "members", "format": "number",     "sub_template": "Paying members",     "change_key": "membersChange", "sort_order": 2},
            {"kpi_id": "profit",   "label": "Net Profit",      "icon": "📈", "color": "#10B981", "data_source": "revenueLatest",  "value_key": "profit",  "format": "currency_k", "sub_template": "After all expenses", "change_key": "profitChange",  "sort_order": 3},
            {"kpi_id": "trainers", "label": "Active Trainers", "icon": "🏋️", "color": "#8B5CF6", "data_source": "activeTrainers", "value_key": "count",   "format": "number",     "sub_template": "Currently on staff", "change_key": None,            "sort_order": 4},
        ]
        for k in kpis:
            await upsert(db, KpiConfig, "kpi_id", k["kpi_id"], {**k, "is_active": True})

        print("▶ Seeding chart configs…")
        charts = [
            {
                "chart_id": "revenueExpenses", "title": "REVENUE VS EXPENSES", "subtitle": "6-month trend",
                "chart_type": "area", "data_source": "revenueHistory", "grid_col": "2", "sort_order": 1,
                "config_json": {"xKey": "month", "series": [{"key": "revenue","label": "Revenue","color": "#4F46E5"},{"key": "expenses","label": "Expenses","color": "#EF4444"}]},
            },
            {
                "chart_id": "membershipMix", "title": "MEMBERSHIP MIX", "subtitle": "Current distribution",
                "chart_type": "pie", "data_source": "membershipBreakdown", "grid_col": "1", "sort_order": 2,
                "config_json": {"nameKey": "name", "valueKey": "value", "colorKey": "color"},
            },
            {
                "chart_id": "categoryRevenue", "title": "REVENUE BY CATEGORY", "subtitle": "Current month",
                "chart_type": "bar_horizontal", "data_source": "categoryRevenue", "grid_col": "1", "sort_order": 3,
                "config_json": {"xKey": "amount", "yKey": "category", "seriesColor": "#4F46E5"},
            },
            {
                "chart_id": "memberGrowth", "title": "MEMBER GROWTH", "subtitle": "6-month trend",
                "chart_type": "line", "data_source": "revenueHistory", "grid_col": "1", "sort_order": 4,
                "config_json": {"xKey": "month", "series": [{"key": "members","label": "Members","color": "#06B6D4"}]},
            },
        ]
        for c in charts:
            await upsert(db, ChartConfig, "chart_id", c["chart_id"], {**c, "is_active": True})

        await db.commit()
        print("✅ Seed complete!")
        print("\nAdmin credentials:")
        print("  Email:    admin@gymos.io")
        print("  Password: GymOS@Admin2025!")
        print("\n⚠️  Tier fees are 0 by default.")
        print("   Open the app → Tiers page → set fees for Basic, Silver, Gold, Platinum.")


if __name__ == "__main__":
    asyncio.run(seed())