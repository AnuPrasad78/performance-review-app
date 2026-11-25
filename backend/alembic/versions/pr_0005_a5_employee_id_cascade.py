"""A5: let a roster upload move an employee's ID without losing evaluations.

The roster import matches employees by email, so an uploaded row may carry a
different employee_id — the CSV value becomes the record's new key. The
evaluations FK as it stood is NO ACTION on UPDATE (RESTRICT on delete), so
the PK move fails the moment the employee holds evaluation rows. Recreating
the constraint with ON UPDATE CASCADE makes history follow the move without
touching the rows or the rest of the schema.
"""

import sqlalchemy as sa
from alembic import op

revision = "pr_0005_a5_employee_id_cascade"
down_revision = "pr_0004_a4_deadline_utc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("evaluations_employee_id_fkey", "evaluations", type_="foreignkey")
    op.create_foreign_key(
        "evaluations_employee_id_fkey",
        source_table="evaluations",
        referent_table="employees",
        local_cols=["employee_id"],
        remote_cols=["employee_id"],
        ondelete="RESTRICT",
        onupdate="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("evaluations_employee_id_fkey", "evaluations", type_="foreignkey")
    op.create_foreign_key(
        "evaluations_employee_id_fkey",
        source_table="evaluations",
        referent_table="employees",
        local_cols=["employee_id"],
        remote_cols=["employee_id"],
        ondelete="RESTRICT",
    )
