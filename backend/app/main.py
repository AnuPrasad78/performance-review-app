"""FastAPI application factory.

A factory function — not a module-level `app` object — because explicit
construction is what makes tests clean: each test builds a fresh app with its
own settings and dependencies instead of mutating shared global state.

Engine lifecycle works out of the factory explicitly: the factory configures
the engine from settings at build time (eager, so a bad database_url is
rejected while constructing the app), and the lifespan hook disposes the
engine's connection pool on shutdown.
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings, get_settings
from app.core.db import configure_engine, dispose_engine
from app.core.errors import install_error_handlers
from app.routers.auth import router as auth_router
from app.routers.cycle_settings import router as cycle_settings_router
from app.routers.employees import router as employees_router
from app.routers.health import router as health_router
from app.routers.self_evaluations import router as self_evaluations_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings if settings is not None else get_settings()
    logging.basicConfig(level=logging.INFO)

    app = FastAPI(title=resolved.app_name, lifespan=lifespan)
    app.state.settings = resolved

    configure_engine(resolved)

    # allow_credentials=True makes `*` origins illegal per spec, so the list
    # of origins is explicit and comes from settings — never a wildcard.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", resolved.stub_user_header],
    )

    install_error_handlers(app)
    app.include_router(health_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.include_router(cycle_settings_router, prefix="/api")
    app.include_router(employees_router, prefix="/api")
    app.include_router(self_evaluations_router, prefix="/api")
    return app
