"""evaluations — the review document: employee answers and (future) manager
feedback, ratings, sign-offs, commitments, and workflow state.

The employee must never touch manager_* columns: that privilege line is
enforced in the service layer by which fields a PATCH accepts, and those
columns are mapped here for reads only.

forward_commitments is plain JSON at the storage layer; the Pydantic schema
layer owns structural validation of commitment entries, and A8 (a later,
feature-tied migration) raises the persistent cap above today's 3.
"""

import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.employee import Employee
from app.models.review_cycle import ReviewCycle


class Evaluation(Base):
    __tablename__ = "evaluations"
    __table_args__ = (
        UniqueConstraint("employee_id", "review_year", name="unique_employee_review"),
        CheckConstraint(
            "self_rating IS NULL OR (self_rating >= 1 AND self_rating <= 5)",
            name="evaluations_self_rating_check",
        ),
        CheckConstraint(
            "manager_rating IS NULL OR (manager_rating >= 1 AND manager_rating <= 5)",
            name="evaluations_manager_rating_check",
        ),
        CheckConstraint(
            "meeting_preference IS NULL OR meeting_preference IN ('ONLINE', 'IN_PERSON')",
            name="evaluations_meeting_preference_check",
        ),
    )

    evaluation_id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), primary_key=True
    )
    employee_id: Mapped[str] = mapped_column(
        ForeignKey("employees.employee_id"), nullable=False
    )
    review_year: Mapped[int]
    status: Mapped[str] = mapped_column(String(30))
    q1_employee_response: Mapped[str | None] = mapped_column(Text())
    q2_employee_response: Mapped[str | None] = mapped_column(Text())
    q3_employee_response: Mapped[str | None] = mapped_column(Text())
    q4_employee_response: Mapped[str | None] = mapped_column(Text())
    self_rating: Mapped[int | None] = mapped_column(SmallInteger())
    employee_overall_comments: Mapped[str | None] = mapped_column(Text())
    q1_manager_comments: Mapped[str | None] = mapped_column(Text())
    q2_manager_comments: Mapped[str | None] = mapped_column(Text())
    q3_manager_comments: Mapped[str | None] = mapped_column(Text())
    q4_manager_comments: Mapped[str | None] = mapped_column(Text())
    manager_rating: Mapped[int | None] = mapped_column(SmallInteger())
    manager_overall_comments: Mapped[str | None] = mapped_column(Text())
    forward_commitments: Mapped[list] = mapped_column(JSONB())
    review_discussion_date: Mapped[datetime.date | None] = mapped_column(Date())
    employee_signed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    manager_signed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    reopened_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    reopen_reason: Mapped[str | None] = mapped_column(Text())
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("review_cycles.cycle_id"), nullable=False
    )

    employee: Mapped[Employee] = relationship(lazy="selectin")
    cycle: Mapped[ReviewCycle] = relationship(lazy="selectin")