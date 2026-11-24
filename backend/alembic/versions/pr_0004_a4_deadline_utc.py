"""A4: submission_deadline becomes a UTC instant (date + time).

Users span timezones, so the close moment is stored as a timezone-aware
timestamp and defined once as UTC: the deadline's *day* keeps its meaning in
the existing order constraint via the UTC date-part, because the constraint
compares it to plain-date manager columns (whose evaluation stays day-based).

Existing DATE rows convert through their date interpreted at UTC midnight —
deadlines only move forward in practice, so the precision gain never
invalidates a stored row.

The order check keeps its name (constraint names are API; A1 established
that) — only its expression changes.
"""

import sqlalchemy as sa
from alembic import op

revision = "pr_0004_a4_deadline_utc"
down_revision = "pr_0003_a3_roster_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "review_cycles_deadline_order_check", "review_cycles", type_="check"
    )
    op.alter_column(
        "review_cycles",
        "submission_deadline",
        existing_type=sa.Date(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="submission_deadline::timestamptz",
    )
    op.create_check_constraint(
        "review_cycles_deadline_order_check",
        "review_cycles",
        "(submission_deadline AT TIME ZONE 'UTC')::date <= manager_review_start",
    )


def downgrade() -> None:
    op.drop_constraint(
        "review_cycles_deadline_order_check", "review_cycles", type_="check"
    )
    op.alter_column(
        "review_cycles",
        "submission_deadline",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.Date(),
        postgresql_using="(submission_deadline AT TIME ZONE 'UTC')::date",
    )
    op.create_check_constraint(
        "review_cycles_deadline_order_check",
        "review_cycles",
        "submission_deadline <= manager_review_start",
    )
