"""
app/api/v1/endpoints/config.py
────────────────────────────────
Dynamic app config endpoints — mirrors what the frontend currently
calls from its hardcoded API_ENDPOINTS mock.
All data lives in DB tables; nothing is hardcoded here.
"""

from __future__ import annotations
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.domain.models.app_config import AppSetting, ChartConfig, KpiConfig, ModuleConfig
from app.infrastructure.database import get_db

router = APIRouter(prefix="/config", tags=["App Config"])


@router.get("/app")
async def get_app_config(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Any:
    stmt = select(AppSetting).where(AppSetting.is_public == True)  # noqa
    settings = (await db.execute(stmt)).scalars().all()
    return {s.setting_key: s.setting_value for s in settings}


@router.get("/modules")
async def get_modules(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Any:
    stmt = (
        select(ModuleConfig)
        .where(
            ModuleConfig.is_active == True,  # noqa
            ModuleConfig.is_deleted == False,  # noqa
        )
        .order_by(ModuleConfig.sort_order)
    )
    modules = (await db.execute(stmt)).scalars().all()

    # Filter by role
    allowed = []
    for m in modules:
        if m.allowed_roles is None or user.role.value in m.allowed_roles:
            allowed.append({
                "id": m.module_id,
                "label": m.label,
                "icon": m.icon,
                "section": m.section,
                "pageType": m.page_type,
                "dataKey": m.data_key,
                "schemaKey": m.schema_key,
            })
    return allowed


@router.get("/kpis")
async def get_kpis(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Any:
    stmt = (
        select(KpiConfig)
        .where(KpiConfig.is_active == True, KpiConfig.is_deleted == False)  # noqa
        .order_by(KpiConfig.sort_order)
    )
    kpis = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": k.kpi_id,
            "label": k.label,
            "icon": k.icon,
            "color": k.color,
            "dataSource": k.data_source,
            "valueKey": k.value_key,
            "format": k.format,
            "subTemplate": k.sub_template,
            "changeKey": k.change_key,
        }
        for k in kpis
    ]


@router.get("/charts")
async def get_charts(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Any:
    stmt = (
        select(ChartConfig)
        .where(ChartConfig.is_active == True, ChartConfig.is_deleted == False)  # noqa
        .order_by(ChartConfig.sort_order)
    )
    charts = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": c.chart_id,
            "title": c.title,
            "subtitle": c.subtitle,
            "type": c.chart_type,
            "dataSource": c.data_source,
            "gridCol": c.grid_col,
            **(c.config_json or {}),
        }
        for c in charts
    ]
