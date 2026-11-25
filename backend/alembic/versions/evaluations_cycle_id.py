"""A2: adopt cycle_id on evaluations — connect evaluations to review_cycles.

Four ordered steps, one transaction:
  1. nullable bridge column      (schema change without constraint)
  2. idempotent seed of cycle 2026 (ON CONFLICT DO NOTHING — re-running is a no-op)
  3. backfill join by review_year (works on populated tables; empty today)
  4. hard enforcement             (NOT NULL + named FK + FK index)

The (employee_id, review_year) uniqueness stays untouched per the staged plan;
its swap to (employee_id, cycle_id) is a later, separately reviewed migration.
"""

import sqlalchemy as sa
from alembic import op

revision = "pr_0002_a2_evaluations_cycle_id"
down_revision = "pr_0001_a1_review_cycles"
branch_labels = None
depends_on = None

# Deadline matches the frontend's contractual default until the admin edits
# cycle settings; the remaining dates are service-plausible placeholders the
# settings screen will replace.
_SEED_2026 = (
    2026,
    "2027-01-15",  # submission_deadline
    "2027-01-16",  # manager_review_start
    "2027-02-15",  # manager_review_end
    "2027-03-01",  # hr_approval_release_by
)


def upgrade() -> None:
    op.add_column(
        "evaluations",
        sa.Column("cycle_id", sa.BigInteger(), nullable=True),
    )

    year, deadline, review_start, review_end, release_by = _SEED_2026
    op.execute(
        sa.text(
            """
            INSERT INTO review_cycles
                (review_year, submission_deadline, manager_review_start,
                 manager_review_end, hr_approval_release_by)
            VALUES (
                :year,
                CAST(:deadline AS date),
                CAST(:review_start AS date),
                CAST(:review_end AS date),
                CAST(:release_by AS date)
            )
            ON CONFLICT (review_year) DO NOTHING
            """
        ).bindparams(
            year=year,
            deadline=deadline,
            review_start=review_start,
            review_end=review_end,
            release_by=release_by,
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE evaluations e
            SET cycle_id = c.cycle_id
            FROM review_cycles c
            WHERE c.review_year = e.review_year
            """
        )
    )

    # op.execute() returns None by design, so counting goes through a real
    # connection result — op.get_bind() is the connection this migration runs on.
    bind = op.get_bind()
    orphans = bind.execute(
        sa.text("SELECT count(*) FROM evaluations WHERE cycle_id IS NULL")
    ).scalar_one()
    if orphans:
        raise RuntimeError(
            f"A2 aborted: {orphans} evaluations reference a review_year with no "
            "review_cycles row. Repair cycle data before re-running this migration."
        )

    op.alter_column(
        "evaluations", "cycle_id", existing_type=sa.BigInteger(), nullable=False
    )
    op.create_foreign_key(
        "evaluations_cycle_id_fkey",
        source_table="evaluations",
        referent_table="review_cycles",
        local_cols=["cycle_id"],
        remote_cols=["cycle_id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "idx_evaluations_cycle_id", "evaluations", ["cycle_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_evaluations_cycle_id", table_name="evaluations")
    op.drop_constraint("evaluations_cycle_id_fkey", "evaluations", type_="foreignkey")
    op.drop_column("evaluations", "cycle_id")

    # Remove only the cycles this migration could have seeded — i.e. cycles no
    # evaluation references anymore. Admin-configured rows in active use are
    # never deleted by a schema rollback.
    op.execute(
        sa.text(
            """
            DELETE FROM review_cycles c
            WHERE NOT EXISTS (
                SELECT 1 FROM evaluations e WHERE e.cycle_id = c.cycle_id
            )
            """
        )
    )