"""A1: create review_cycles — one configuration row per review year.

Reviews belong to a cycle; deadlines and windows per cycle come from this
table. Kept strictly additive (evaluations.cycle_id adoption is A2) so each
schema change can be reviewed, applied, and reversed in isolation.

Constraint names are explicit (never auto-generated) because constraint names
are API: later migrations may reference them by name to alter or drop them.
"""

import sqlalchemy as sa
from alembic import op

revision = "pr_0001_a1_review_cycles"
down_revision = "pr_0000_a0_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "review_cycles",
        sa.Column(
            "cycle_id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
        ),
        sa.Column("review_year", sa.Integer(), nullable=False),
        sa.Column("promotion_period_start", sa.Date(), nullable=True),
        sa.Column("promotion_period_end", sa.Date(), nullable=True),
        sa.Column("submission_deadline", sa.Date(), nullable=False),
        sa.Column("manager_review_start", sa.Date(), nullable=False),
        sa.Column("manager_review_end", sa.Date(), nullable=False),
        sa.Column("hr_approval_release_by", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("review_year", name="review_cycles_review_year_key"),
        sa.CheckConstraint(
            "(promotion_period_start IS NULL AND promotion_period_end IS NULL) "
            "OR promotion_period_start <= promotion_period_end",
            name="review_cycles_promotion_period_check",
        ),
        sa.CheckConstraint(
            "submission_deadline <= manager_review_start",
            name="review_cycles_deadline_order_check",
        ),
        sa.CheckConstraint(
            "manager_review_start <= manager_review_end",
            name="review_cycles_manager_window_check",
        ),
        sa.CheckConstraint(
            "manager_review_end <= hr_approval_release_by",
            name="review_cycles_release_order_check",
        ),
    )


def downgrade() -> None:
    op.drop_table("review_cycles")