"""departments — reference table owned by the HR side of the organization."""

import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Department(Base):
    __tablename__ = "departments"

    department_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department_name: Mapped[str] = mapped_column(String(150), unique=True)
    created_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(), server_default=func.now()
    )