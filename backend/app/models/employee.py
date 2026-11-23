"""employees — organizational/roster information for one person.

Auth stays OUT of this table by design (user_accounts arrives with the
role-gated admin feature); this row is only who someone *is*, not how
they sign in. Columns mirror the roster CSV the admin uploads.
"""

import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Employee(Base):
    __tablename__ = "employees"

    employee_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    employee_name: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    designation: Mapped[str | None] = mapped_column(String(150))
    location: Mapped[str | None] = mapped_column(String(150))
    org: Mapped[str | None] = mapped_column(String(150))
    current_account_project: Mapped[str | None] = mapped_column(String(150))
    # Manager links are plain name columns in the current schema (not employee
    # references) — an accepted simplification, flagged for redesign later.
    delivery_head: Mapped[str | None] = mapped_column(String(150))
    delivery_manager: Mapped[str | None] = mapped_column(String(150))
    business_partner: Mapped[str | None] = mapped_column(String(150))
    reporting_manager: Mapped[str | None] = mapped_column(String(150))
    employment_status: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(), server_default=func.now(), onupdate=func.now()
    )
