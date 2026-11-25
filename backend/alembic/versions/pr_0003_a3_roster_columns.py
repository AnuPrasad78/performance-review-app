"""A3: align employees with the roster CSV the admin uploads.

The employees table predates Alembic and a later, since-lost migration
(alembic_version pointed at it) had renamed department_id -> org while keeping
it an integer FK into departments. The roster CSV carries Org as free text and
has no department id, so the table is brought to the CSV contract:

  1. convert org from an integer FK value to the department name as text
     (1 -> "Quality", 2 -> "Delivery"), data-preserving
  2. drop the org -> departments FK, then drop the now-unreferenced table
  3. make email NOT NULL — every CSV row carries one

joining_date keeps its column despite being absent from the CSV (real seeded
values live there; roster writes simply never touch it).

Constraint names are explicit (never auto-generated) because constraint names
are API: later migrations may reference them by name to alter or drop them.
"""

import sqlalchemy as sa
from alembic import op

revision = "pr_0003_a3_roster_columns"
down_revision = "pr_0002_a2_evaluations_cycle_id"
branch_labels = None
depends_on = None

# The org column's FK predates any Alembic chain and kept its legacy name.
_EMP_ORG_FK = "employees_department_id_fkey"


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("org_text", sa.String(150), nullable=True),
    )
    # Fall back to the raw number when a value has no department row, and
    # leave NULL unnoticed: deleting a department must never delete an
    # employee's org knowledge.
    op.execute(
        sa.text(
            """
            UPDATE employees e
            SET org_text = COALESCE(
                (SELECT d.department_name FROM departments d
                 WHERE d.department_id = e.org),
                CAST(e.org AS varchar(150))
            )
            """
        )
    )

    op.drop_constraint(_EMP_ORG_FK, "employees", type_="foreignkey")
    op.drop_column("employees", "org")
    op.alter_column(
        "employees",
        "org_text",
        existing_type=sa.String(150),
        new_column_name="org",
    )

    op.alter_column(
        "employees", "email", existing_type=sa.String(255), nullable=False
    )

    op.drop_table("departments")


def downgrade() -> None:
    op.create_table(
        "departments",
        sa.Column("department_id", sa.Integer(), primary_key=True),
        sa.Column("department_name", sa.String(150), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=True,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("department_name", name="departments_department_name_key"),
    )
    # Text org values cannot map back to department ids one-to-one; the
    # downgrade restores the column shape (org int + FK, values NULL) and
    # deliberately discards the text values instead of parking them in a side
    # column an unmodified upgrade could not consume again.
    op.drop_column("employees", "org")
    op.add_column(
        "employees",
        sa.Column("org", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        _EMP_ORG_FK, "employees", "departments", ["org"], ["department_id"]
    )

    op.alter_column(
        "employees", "email", existing_type=sa.String(255), nullable=True
    )
