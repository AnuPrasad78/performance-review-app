"""The six-state evaluation lifecycle: one stored status per workflow phase.

The two-word write era and its hand-schema legacy end here. The column now
carries the full 2026 lifecycle — NOT_STARTED, SELF_EVALUATION_IN_PROGRESS,
SELF_EVALUATION_COMPLETED, IN_MANAGER_REVIEW, MANAGER_EVALUATION_IN_PROGRESS,
MANAGER_EVALUATION_COMPLETED — under a single CHECK constraint
(evaluations_status_check). One vocabulary on purpose: the wire form used
everywhere (API, frontend) is the lower-cased stored word, so no layer ever
maps between two spellings.

The live table predates Alembic's coverage and carried three legacy facts
the remap must respect (see db_audit/audit_output.txt):
- valid_review_status allowed the five-word hand schema (IN_PROGRESS,
  SUBMITTED, MANAGER_REVIEW, REOPENED, COMPLETED) — dropped before the
  remap can write any new word, and rebuilt around the new list.
- both_signatures_required pinned the old COMPLETED word to dual
  signatures — dead vocabulary after this migration, so dropped; the rule
  returns (against MANAGER_EVALUATION_COMPLETED) when the manager feature
  lands.
- status's column default 'IN_PROGRESS' would violate the new CHECK on any
  insert that omits status — re-defaulted to NOT_STARTED, the word for "no
  content yet".

Existing rows remap by the facts they carry. The five legacy words keep the
migration total: an IN_PROGRESS row with an employee answer becomes
SELF_EVALUATION_IN_PROGRESS, one without becomes NOT_STARTED; SUBMITTED and
MANAGER_REVIEW move to IN_MANAGER_REVIEW (the manager phase has no recorded
activity); REOPENED — the employee's form reopened — lands back in
SELF_EVALUATION_IN_PROGRESS; COMPLETED reads as MANAGER_EVALUATION_COMPLETED.

manager_started_at is planted but unused: state 4 → 5 ("in manager review"
→ "manager evaluation in progress") needs a timestamp the manager phase
feature will stamp; adding the column now avoids a second schema trip. The
column widens to varchar(40) because MANAGER_EVALUATION_IN_PROGRESS is
exactly 30 — the longest word should never sit at the column's edge.

(The audit-log migration reserved as A6 and the commitment-cap raise reserved
as A8 are unrelated later changes; this revision deliberately does not claim
either letter.)
"""

import sqlalchemy as sa
from alembic import op

revision = "pr_0006_status_lifecycle"
down_revision = "pr_0005_a5_employee_id_cascade"
branch_labels = None
depends_on = None

#: The remap, expressed as the rows' own facts. Inlined rather than imported
#: from app.models so the migration stays a frozen historical artifact no
#: model edit can silently rewrite. The five legacy words make it total over
#: every value the old valid_review_status allowed.
_REMAP_UP = """
    UPDATE evaluations SET status = CASE
        WHEN status = 'IN_PROGRESS' AND (
            coalesce(q1_employee_response, '') <> ''
            OR coalesce(q2_employee_response, '') <> ''
            OR coalesce(q3_employee_response, '') <> ''
            OR coalesce(q4_employee_response, '') <> ''
        ) THEN 'SELF_EVALUATION_IN_PROGRESS'
        WHEN status = 'IN_PROGRESS' THEN 'NOT_STARTED'
        WHEN status IN ('SUBMITTED', 'MANAGER_REVIEW') THEN 'IN_MANAGER_REVIEW'
        WHEN status = 'REOPENED' THEN 'SELF_EVALUATION_IN_PROGRESS'
        WHEN status = 'COMPLETED' THEN 'MANAGER_EVALUATION_COMPLETED'
        ELSE status
    END
"""

_REMAP_DOWN = """
    UPDATE evaluations SET status = CASE
        WHEN status IN ('NOT_STARTED', 'SELF_EVALUATION_IN_PROGRESS') THEN 'IN_PROGRESS'
        WHEN status = 'SELF_EVALUATION_COMPLETED' THEN 'SUBMITTED'
        WHEN status IN ('IN_MANAGER_REVIEW', 'MANAGER_EVALUATION_IN_PROGRESS')
            THEN 'MANAGER_REVIEW'
        WHEN status = 'MANAGER_EVALUATION_COMPLETED' THEN 'COMPLETED'
        ELSE status
    END
"""

_NEW_STATUS_CHECK = (
    "status IN ('NOT_STARTED', 'SELF_EVALUATION_IN_PROGRESS', "
    "'SELF_EVALUATION_COMPLETED', 'IN_MANAGER_REVIEW', "
    "'MANAGER_EVALUATION_IN_PROGRESS', 'MANAGER_EVALUATION_COMPLETED')"
)

_OLD_STATUS_CHECK = (
    "status IN ('IN_PROGRESS', 'SUBMITTED', 'MANAGER_REVIEW', 'REOPENED', 'COMPLETED')"
)


def upgrade() -> None:
    # The legacy checks name the old vocabulary — they would reject the remap,
    # so they leave first. both_signatures_required is dropped, not rebuilt:
    # its COMPLETED anchor vanished, and the rule returns with the manager
    # feature against MANAGER_EVALUATION_COMPLETED.
    op.drop_constraint("valid_review_status", "evaluations", type_="check")
    op.drop_constraint("both_signatures_required", "evaluations", type_="check")
    op.execute(_REMAP_UP)
    op.create_check_constraint(
        "evaluations_status_check", "evaluations", sa.text(_NEW_STATUS_CHECK)
    )
    # The longest word is exactly 30: widen so it never sits at the edge.
    op.alter_column(
        "evaluations",
        "status",
        existing_type=sa.String(30),
        type_=sa.String(40),
    )
    # 'IN_PROGRESS' as a default would violate the new CHECK on any insert
    # that omits status; NOT_STARTED is the word for a form with no content.
    op.alter_column(
        "evaluations",
        "status",
        existing_type=sa.String(40),
        server_default=sa.text("'NOT_STARTED'"),
    )
    op.add_column(
        "evaluations",
        sa.Column("manager_started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("evaluations", "manager_started_at")
    op.alter_column(
        "evaluations",
        "status",
        existing_type=sa.String(40),
        server_default=sa.text("'IN_PROGRESS'"),
    )
    op.alter_column(
        "evaluations",
        "status",
        existing_type=sa.String(40),
        type_=sa.String(30),
    )
    # Both orders restored: the new constraint holds MANAGER_EVALUATION_*
    # words the down-remap would breach, the legacy one the words it lands on.
    op.drop_constraint("evaluations_status_check", "evaluations", type_="check")
    op.execute(_REMAP_DOWN)
    op.create_check_constraint(
        "valid_review_status", "evaluations", sa.text(_OLD_STATUS_CHECK)
    )
    op.create_check_constraint(
        "both_signatures_required",
        "evaluations",
        sa.text(
            "status <> 'COMPLETED' OR "
            "(employee_signed_at IS NOT NULL AND manager_signed_at IS NOT NULL)"
        ),
    )