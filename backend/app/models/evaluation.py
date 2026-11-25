"""evaluations — the review document: employee answers and (future) manager
feedback, ratings, sign-offs, commitments, and workflow state.

The employee must never touch manager_* columns: that privilege line is
enforced in the service layer by which fields a PATCH accepts, and those
columns are mapped here for reads only.

forward_commitments is plain JSON at the storage layer; the Pydantic schema
layer owns structural validation of commitment entries, and A8 (a later,
feature-tied migration) raises the persistent cap above today's 3.

Two de-normalizations live on this table and each owns its boundary:
- email is the employee roster's address, mirrored low-cased and re-synced by
  the roster apply path (evaluation_repository.sync_emails). A display/
  filtering convenience — never a key, never an authorization input; the
  FK's employee_id stays the sole ownership discriminator.
- manager_started_at is state-machine scaffolding: the stamp that will one
  day move a row from IN_MANAGER_REVIEW to MANAGER_EVALUATION_IN_PROGRESS,
  planted
  so the manager-phase feature ships without another schema trip.
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

#: (topic id, employee column, manager column) — positional order is fixed by
#: the 2026 form; employee columns are write targets, manager columns read-only.
#: Lives beside the storage columns it names so every layer shares one table.
RESPONSE_TOPICS: tuple[tuple[str, str, str], ...] = (
    ("contribution", "q1_employee_response", "q1_manager_comments"),
    ("strengths", "q2_employee_response", "q2_manager_comments"),
    ("development", "q3_employee_response", "q3_manager_comments"),
    ("support", "q4_employee_response", "q4_manager_comments"),
)

#: The stored workflow words behind the status column — the six-state 2026
#: lifecycle (pr_0006). The CHECK constraint below (evaluations_status_check,
#: created in the same migration) owns the closed vocabulary; these constants
#: are the Python side of that same list. The spelling rule is the single
#: vocabulary's whole point: the wire word (schema BoardStatus, frontend
#: reviewStatusStore) is the lower-cased stored word — no layer maps between
#: two spellings, so none can drift.
STATUS_NOT_STARTED = "NOT_STARTED"
STATUS_SELF_EVALUATION_IN_PROGRESS = "SELF_EVALUATION_IN_PROGRESS"
STATUS_SELF_EVALUATION_COMPLETED = "SELF_EVALUATION_COMPLETED"
STATUS_IN_MANAGER_REVIEW = "IN_MANAGER_REVIEW"
STATUS_MANAGER_EVALUATION_IN_PROGRESS = "MANAGER_EVALUATION_IN_PROGRESS"
STATUS_MANAGER_EVALUATION_COMPLETED = "MANAGER_EVALUATION_COMPLETED"

#: The same words as one tuple, the constraint's text builds from it: the
#: vocabulary exists once, in this list.
EVALUATION_STATUSES = (
    STATUS_NOT_STARTED,
    STATUS_SELF_EVALUATION_IN_PROGRESS,
    STATUS_SELF_EVALUATION_COMPLETED,
    STATUS_IN_MANAGER_REVIEW,
    STATUS_MANAGER_EVALUATION_IN_PROGRESS,
    STATUS_MANAGER_EVALUATION_COMPLETED,
)

#: Narrow aliases some suites still import; they name the same stored
#: words as the lifecycle constants above — kept so the vocabulary stays
#: single-spelled inside the app code.
STATUS_IN_PROGRESS = STATUS_SELF_EVALUATION_IN_PROGRESS
STATUS_SUBMITTED = STATUS_SELF_EVALUATION_COMPLETED


class Evaluation(Base):
    __tablename__ = "evaluations"
    __table_args__ = (
        UniqueConstraint("employee_id", "review_year", name="unique_employee_review"),
        CheckConstraint(
            f"status IN ({', '.join(repr(word) for word in EVALUATION_STATUSES)})",
            name="evaluations_status_check",
        ),
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
        ForeignKey("employees.employee_id", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(String(255))
    review_year: Mapped[int]
    # varchar(40) per pr_0006: the longest lifecycle word rests at 30, never
    # at the column's edge. Default NOT_STARTED — an insert that omits status
    # says "no content yet" (the old 'IN_PROGRESS' default breached the new
    # CHECK by construction).
    status: Mapped[str] = mapped_column(
        String(40), server_default="NOT_STARTED"
    )
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
    manager_started_at: Mapped[datetime.datetime | None] = mapped_column(
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