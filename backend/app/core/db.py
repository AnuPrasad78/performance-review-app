"""Async SQLAlchemy engine and the request-scoped session dependency.

This is the only module in the app that creates an engine. Everything that
needs persistence receives its session through FastAPI dependency injection,
so connection pools stay per-process and transaction rules live in exactly
one place.

Transaction policy — one unit of work per request: the dependency yields the
session after opening it, commits on clean completion, and rolls back on any
unhandled exception. Repositories and services are written against that
contract: they flush (so query results see pending changes) but never commit
themselves; ownership of the commit belongs to this dependency, which is why
the same service function can participate in a bigger transaction later
without redesign.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def build_engine(database_url: str):
    # pool_pre_ping: productivity feature — a stale pooled connection is
    # revalidated before use instead of surfacing as a mid-request failure.
    return create_async_engine(database_url, pool_pre_ping=True)


def configure_engine(settings: Settings) -> None:
    global _engine, _session_factory
    if _session_factory is None:
        _engine = build_engine(settings.database_url)
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


def session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:  # pragma: no cover — factory/test wiring guard
        raise RuntimeError("configure_engine() was never called")
    return _session_factory


async def get_session() -> AsyncIterator[AsyncSession]:
    factory = session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    """Release pooled connections — called from the app's shutdown hook."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None