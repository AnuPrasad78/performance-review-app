"""review_cycles — one configuration row per review year (created by A1)."""

import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Identity,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReviewCycle(Base):
    __tablename__ = "review_cycles"
    __table_args__ = (
        UniqueConstraint("review_year", name="review_cycles_review_year_key"),
        CheckConstraint(
            "(promotion_period_start IS NULL AND promotion_period_end IS NULL) "
            "OR promotion_period_start <= promotion_period_end",
            name="review_cycles_promotion_period_check",
        ),
        CheckConstraint(
            "submission_deadline <= manager_review_start",
            name="review_cycles_deadline_order_check",
        ),
        CheckConstraint(
            "manager_review_start <= manager_review_end",
            name="review_cycles_manager_window_check",
        ),
        CheckConstraint(
            "manager_review_end <= hr_approval_release_by",
            name="review_cycles_release_order_check",
        ),
    )

    cycle_id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), primary_key=True
    )
    review_year: Mapped[int]
    promotion_period_start: Mapped[datetime.date | None]
    promotion_period_end: Mapped[datetime.date | None]
    submission_deadline: Mapped[datetime.date]
    manager_review_start: Mapped[datetime.date]
    manager_review_end: Mapped[datetime.date]
    hr_approval_release_by: Mapped[datetime.date]
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )