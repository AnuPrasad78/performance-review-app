"""employees — organizational/roster information for one person.

Auth stays OUT of this table by design (user_accounts arrives with the
role-gated admin feature, migration A5); this row is only who someone *is*,
not how they sign in.
"""

import datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.department import Department


class Employee(Base):
    __tablename__ = "employees"

    employee_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    employee_name: Mapped[str] = mapped_column(String(150))
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    designation: Mapped[str | None] = mapped_column(String(150))
    joining_date: Mapped[datetime.date | None] = mapped_column(Date())
    location: Mapped[str | None] = mapped_column(String(150))
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.department_id")
    )
    # Manager links are plain name columns in the current schema (not employee
    # references) — an accepted simplification, flagged for redesign later.
    reporting_manager: Mapped[str | None] = mapped_column(String(150))
    delivery_manager: Mapped[str | None] = mapped_column(String(150))
    delivery_partner_head: Mapped[str | None] = mapped_column(String(150))
    employment_status: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(), server_default=func.now(), onupdate=func.now()
    )

    department: Mapped[Department | None] = relationship(lazy="selectin")