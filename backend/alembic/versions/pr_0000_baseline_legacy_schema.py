"""A0: baseline — the legacy schema that existed before Alembic owned it.

departments, employees and evaluations were created by hand before this
repository adopted Alembic, and a later revision that reshaped employees was
lost (see A3's docstring). Without this baseline the chain cannot build a
database from nothing: A2 alters `evaluations`, which no migration created.

This revision reproduces the state A1 → A5 were written against, so that a
fresh database (a new Azure environment, CI, a developer laptop) and the
long-lived database converge on the same schema at head:

  * columns, types, defaults and nullability are those recorded in
    backend/db_audit/audit_output.txt;
  * every legacy constraint and index the audit found is recreated with its
    original name (constraint names are API — later migrations drop them by
    name);
  * employees carries the shape the lost revision left behind: department_id
    renamed to org (still an integer FK, keeping its legacy constraint name,
    which A3 drops by that name) and the roster columns the application maps
    (delivery_head, business_partner, current_account_project) in place of
    the audit-era delivery_partner_head.

Existing databases already sit at a later revision. Alembic treats every
ancestor of the stamped revision as applied, so this file never runs against
them and needs no `alembic stamp`.

Downgrade drops the three tables. It exists so the migration chain can be
exercised end to end (base → head → base) in CI; running it against a
database holding real reviews destroys them, which is why production rollback
below A1 is a point-in-time restore, never a downgrade (docs/deployment.md).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "pr_0000_a0_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "departments",
        sa.Column("department_id", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("department_name", sa.String(150), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=True,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("department_id", name="departments_pkey"),
        sa.UniqueConstraint("department_name", name="departments_department_name_key"),
    )

    op.create_table(
        "employees",
        sa.Column("employee_id", sa.String(50), nullable=False),
        sa.Column("employee_name", sa.String(150), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("designation", sa.String(150), nullable=True),
        sa.Column("joining_date", sa.Date(), nullable=True),
        sa.Column("location", sa.String(150), nullable=True),
        sa.Column("org", sa.Integer(), nullable=True),
        sa.Column("current_account_project", sa.String(150), nullable=True),
        sa.Column("delivery_head", sa.String(150), nullable=True),
        sa.Column("delivery_manager", sa.String(150), nullable=True),
        sa.Column("business_partner", sa.String(150), nullable=True),
        sa.Column("reporting_manager", sa.String(150), nullable=True),
        sa.Column("employment_status", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=True,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=True,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("employee_id", name="employees_pkey"),
        sa.UniqueConstraint("email", name="employees_email_key"),
        sa.ForeignKeyConstraint(
            ["org"],
            ["departments.department_id"],
            name="employees_department_id_fkey",
        ),
    )

    op.create_table(
        "evaluations",
        sa.Column(
            "evaluation_id",
            sa.BigInteger(),
            sa.Identity(always=True),
            nullable=False,
        ),
        sa.Column("employee_id", sa.String(50), nullable=False),
        sa.Column(
            "review_year", sa.Integer(), nullable=False, server_default=sa.text("2026")
        ),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default=sa.text("'IN_PROGRESS'::character varying"),
        ),
        sa.Column("q1_employee_response", sa.Text(), nullable=True),
        sa.Column("q2_employee_response", sa.Text(), nullable=True),
        sa.Column("q3_employee_response", sa.Text(), nullable=True),
        sa.Column("q4_employee_response", sa.Text(), nullable=True),
        sa.Column("self_rating", sa.SmallInteger(), nullable=True),
        sa.Column("employee_overall_comments", sa.Text(), nullable=True),
        sa.Column("q1_manager_comments", sa.Text(), nullable=True),
        sa.Column("q2_manager_comments", sa.Text(), nullable=True),
        sa.Column("q3_manager_comments", sa.Text(), nullable=True),
        sa.Column("q4_manager_comments", sa.Text(), nullable=True),
        sa.Column("manager_rating", sa.SmallInteger(), nullable=True),
        sa.Column("manager_overall_comments", sa.Text(), nullable=True),
        sa.Column(
            "forward_commitments",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("review_discussion_date", sa.Date(), nullable=True),
        sa.Column("employee_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("manager_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopen_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("evaluation_id", name="evaluations_pkey"),
        sa.ForeignKeyConstraint(
            ["employee_id"],
            ["employees.employee_id"],
            name="evaluations_employee_id_fkey",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("employee_id", "review_year", name="unique_employee_review"),
        sa.CheckConstraint(
            "self_rating >= 1 AND self_rating <= 5",
            name="evaluations_self_rating_check",
        ),
        sa.CheckConstraint(
            "manager_rating >= 1 AND manager_rating <= 5",
            name="evaluations_manager_rating_check",
        ),
        sa.CheckConstraint(
            "status::text <> 'COMPLETED'::text "
            "OR (employee_signed_at IS NOT NULL AND manager_signed_at IS NOT NULL)",
            name="both_signatures_required",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(forward_commitments) = 'array'::text "
            "AND jsonb_array_length(forward_commitments) <= 3",
            name="valid_forward_commitments",
        ),
        sa.CheckConstraint(
            "status::text = ANY (ARRAY['IN_PROGRESS', 'SUBMITTED', 'MANAGER_REVIEW', "
            "'REOPENED', 'COMPLETED']::text[])",
            name="valid_review_status",
        ),
        sa.CheckConstraint("review_year >= 2026", name="valid_review_year"),
    )
    op.create_index("idx_evaluations_status", "evaluations", ["status"])


def downgrade() -> None:
    op.drop_index("idx_evaluations_status", table_name="evaluations")
    op.drop_table("evaluations")
    op.drop_table("employees")
    op.drop_table("departments")
