"""Repositories — the only layer that talks to the database.

Re-exports with FastAPI dependencies so routers receive ready-to-use
repository instances; services receive one as an argument and never construct
one themselves.
"""

from app.repositories.employee_repository import (
    EmployeeRepository,
    get_employee_repository,
)

__all__ = ["EmployeeRepository", "get_employee_repository"]
