"""Alembic's migration runtime, adapted for the app.

Deliberate deviations from the generated skeleton:

1. The database URL is injected from app.core.config.Settings — the migration
   engine and the running app share ONE configuration source, so it is
   structurally impossible for migrations to point at a different database
   than the app does.
2. Migrations run through an async engine (asyncpg), matching db.py; the
   asyncio.run bridge below is the standard pattern.
3. target_metadata is the ORM's metadata, so `alembic check` fails whenever
   the migrated schema and the models disagree (schema drift). CI runs it
   against a database built from nothing; operators can run it against any
   live database to prove it matches the code.
4. Production safety for online runs, all scoped to the migration transaction:
   - a transaction-level advisory lock serializes concurrent runners (two
     deploy pipelines, a retried job): the second waits, then finds the
     schema at head and does nothing;
   - lock_timeout bounds how long any DDL may queue behind live traffic —
     a migration that cannot get its lock fails fast and rolls back instead
     of stalling every request queued behind it.
"""

import asyncio
from logging.config import fileConfig
from typing import Any

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override whatever alembic.ini carries; settings win, always.
config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata

#: Arbitrary but fixed: every runner of this app's migrations contends on it.
MIGRATION_ADVISORY_LOCK_ID = 7_310_552_026
#: Longest a DDL statement may wait for a table lock held by live traffic.
MIGRATION_LOCK_TIMEOUT = "10s"


def run_migrations_offline() -> None:
    """'offline' emits migrations as SQL without connecting — the reviewed
    script a DBA can read (or run) before a production upgrade."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_sync_migrations(connection: Connection) -> None:
    """Runs inside a single connection, inside one transaction: an upgrade or
    downgrade is all-or-nothing. If any statement fails, the database keeps
    its previous schema AND its previous alembic_version."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        connection.execute(
            text("SELECT pg_advisory_xact_lock(:lock_id)"),
            {"lock_id": MIGRATION_ADVISORY_LOCK_ID},
        )
        connection.execute(text(f"SET LOCAL lock_timeout = '{MIGRATION_LOCK_TIMEOUT}'"))
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
