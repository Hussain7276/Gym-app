"""
alembic/env.py
───────────────
Async Alembic migration environment.
Imports all models via app.domain.models so Alembic detects every table.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

# Load app settings and models
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import settings
from app.domain.models import Base   # imports all mapped classes

# ── Alembic config ────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── FIX: %40 → @ then escape remaining % as %% for ConfigParser ──
_sync_url = settings.DATABASE_URL_SYNC.replace("%40", "@").replace("%", "%%")
config.set_main_option("sqlalchemy.url", _sync_url)

target_metadata = Base.metadata


# ── Migration runners ─────────────────────────────────────────────

def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (for SQL script generation)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # Use create_async_engine directly with the async URL (asyncpg driver).
    # This avoids async_engine_from_config accidentally picking up a sync URL.
    connectable = create_async_engine(
        settings.DATABASE_URL,   # must be postgresql+asyncpg://...
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()