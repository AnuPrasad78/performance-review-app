"""Alembic's migration runtime, adapted for the app.

Two deliberate deviations from the generated skeleton:

1. The database URL is injected from app.core.config.Settings — the migration
   engine and the running app share ONE configuration source, so it is
   structurally impossible for migrations to point at a different database
   than the app does.
2. Migrations run through an async engine (asyncpg), matching db.py; the
   asyncio.run bridge below is the standard pattern.
"""

import asyncio
from logging.config import fileConfig
from typing import Any

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override whatever alembic.ini carries; settings win, always.
config.set_main_option("sqlalchemy.url", get_settings().database_url)


def run_migrations_offline() -> None:
    """'offline' emits migrations as SQL without connecting."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_sync_migrations(connection: Connection) -> None:
    """Runs inside a single connection, inside one transaction: a migration is
    all-or-nothing. If any statement fails, the database keeps its previous state."""
    context.configure(
        connection=connection,
        target_metadata=None,  # handwritten migrations; ORM autogenerate comes later
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable: Any = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(run_sync_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()