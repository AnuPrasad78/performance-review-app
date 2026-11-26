"""A7: carry the cycle's employee eligibility date on review_cycles.

The admin cycle form now carries an optional Employee Eligibility Date:
roster members whose Date of Joining falls after it are locked out of the
current review form (the message the employee view renders comes from the
service's not_eligible envelope). Nullable — an empty field means no
restriction, so existing cycles keep working until the admin sets one.
"""

import sqlalchemy as sa
from alembic import op

revision = "pr_0009_a7_joining_eligibility"
down_revision = "pr_0008_a6_business_unit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "review_cycles",
        sa.Column("employee_eligibility_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("review_cycles", "employee_eligibility_date")
