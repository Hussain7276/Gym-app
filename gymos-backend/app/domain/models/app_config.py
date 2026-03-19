"""
app/domain/models/app_config.py
─────────────────────────────────
Stores UI configuration (module list, KPI cards, chart definitions)
in the database. Mirrors what the frontend currently gets from hardcoded
API_ENDPOINTS. Everything is now a DB row — add a KPI via admin panel.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.models.base import BaseModel


class AppSetting(BaseModel):
    """
    Generic key-value store for global application settings.
    e.g. app_name, logo, accent_color, tagline.
    """
    __tablename__ = "app_settings"

    setting_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    setting_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_type: Mapped[str] = mapped_column(String(20), default="string", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ModuleConfig(BaseModel):
    """
    One row per navigation module. The sidebar is built entirely from
    these rows — add a new gym module (e.g. Diet Plans) without any
    frontend code changes.
    """
    __tablename__ = "module_configs"

    module_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)
    section: Mapped[str] = mapped_column(String(50), nullable=False)
    page_type: Mapped[str] = mapped_column(String(50), nullable=False)
    data_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    schema_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Allowed roles stored as JSONB array: ["admin","manager"]
    allowed_roles: Mapped[list | None] = mapped_column(JSONB, nullable=True)


class KpiConfig(BaseModel):
    """Definition for a KPI card on the dashboard."""
    __tablename__ = "kpi_configs"

    kpi_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    data_source: Mapped[str] = mapped_column(String(100), nullable=False)
    value_key: Mapped[str] = mapped_column(String(50), nullable=False)
    format: Mapped[str] = mapped_column(String(30), default="number", nullable=False)
    sub_template: Mapped[str | None] = mapped_column(String(255), nullable=True)
    change_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ChartConfig(BaseModel):
    """Definition for a chart panel on the dashboard."""
    __tablename__ = "chart_configs"

    chart_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    chart_type: Mapped[str] = mapped_column(String(30), nullable=False)  # area|pie|bar_horizontal|line
    data_source: Mapped[str] = mapped_column(String(100), nullable=False)
    config_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # series, keys, colors
    grid_col: Mapped[str] = mapped_column(String(5), default="1", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
