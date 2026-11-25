"""A6: carry the roster CSV's Business Unit column on the employees table.

The roster the admin uploads names each employee's business unit, but the
table had no home for it, so the import dropped it. This adds the nullable
varchar (roster columns are plain name strings, same as org/location) so the
column imports, filters and exports like the rest of the roster contract.
"""

import sqlalchemy as sa
from alembic import op

revision = "pr_0008_a6_business_unit"
down_revision = "pr_0007_email_display_mirror"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("business_unit", sa.String(150), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("employees", "business_unit")
