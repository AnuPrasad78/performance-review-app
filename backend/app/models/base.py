"""Declarative base for all ORM models. Every model joins this registry, so a
single import of app.models exposes the full metadata graph later on."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass