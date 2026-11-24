"""Read and write contracts for the employee view: profile + self-evaluation
in one payload, and the presence-shaped partial-update patch.

The four question topics are identified by the frontend's stable ids
(contribution/strengths/development/support), not by q1..q4 positions — those
positions are this release's storage layout, not its domain vocabulary
(services/self_evaluation maps them). Manager columns ride along read-only so
the same response serves the manager phase later without a field migration.

forward_commitments arrive as stored JSONB, re-listed in order; ids in the
frontend's ForwardCommitment type are positional (1..n) and are assigned
client-side from the list order.
"""

import datetime
from typing import Literal

from app.schemas.base import ApiModel
from app.schemas.employee import RosterEmployeeOut

#: The board's status words — the frontend's ReviewStatus union, verbatim.
BoardStatus = Literal["not_started", "in_progress", "submitted", "signed_off"]


class QuestionResponses(ApiModel):
    contribution: str
    strengths: str
    development: str
    support: str


class ForwardCommitmentOut(ApiModel):
    commitment: str
    support: str


class SelfEvaluationOut(ApiModel):
    employee: RosterEmployeeOut
    review_year: int
    submission_deadline: datetime.datetime
    #: Server-computed: now(UTC) > submission_deadline. The client renders the
    #: closed state and the countdown from this pair and never re-derives the
    #: calendar math — same ownership rule as commitments_editable below.
    deadline_passed: bool
    submitted_at: datetime.date | None
    employee_signed_at: datetime.date | None
    responses: QuestionResponses
    manager_comments: QuestionResponses
    overall_rating: int | None
    overall_summary: str
    forward_commitments: list[ForwardCommitmentOut]
    #: The server owns the commit window: commitments are employee-editable
    #: while the review is open, and — after submission — until the manager
    #: review window closes. The client renders lock/unlock from this flag
    #: instead of copying the calendar math.
    commitments_editable: bool


class ReviewStatusEntry(ApiModel):
    employee: RosterEmployeeOut
    status: BoardStatus


class ReviewStatusList(ApiModel):
    reviews: list[ReviewStatusEntry]


class SelfEvaluationPatch(ApiModel):
    """Presence-shaped partial update: a provided member replaces that field,
    omitted members stay untouched. Employee-owned fields only, so manager
    columns are unwritable by construction; the service layer decides which
    members may actually move according to the evaluation's workflow state."""

    responses: QuestionResponses | None = None
    self_rating: int | None = None
    overall_summary: str | None = None
    forward_commitments: list[ForwardCommitmentOut] | None = None
