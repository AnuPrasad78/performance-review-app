"""The email display mirror on evaluations — denormalized, derived, never a key.

employees.email is the roster's identity-of-record; evaluations gets its own
low-cased copy for reads that want to filter or export evaluations by address
without the join. Three deliberate boundaries, recorded here so later edits
respect them:

- The column is NOT a key and must never participate in one: employee_id
  remains the sole identity/ownership discriminator. Email changes — name
  changes, domain migrations, typo fixes — are routine data corrections, and
  a key that moves with them cascades churn through every FK (why the
  composite (employee_id, email) key idea was rejected: a person's email
  adds no identity information beyond their employee_id).
- Consistency is maintained, not assumed. The backfill reseeds history from
  the join, and the roster apply path re-mirrors any employee whose row the
  import rewrote (services/roster_apply → evaluation_repository.sync_emails).
- Address normalization follows get_by_email's convention: stored lower-cased,
  so keying the mirror equals keying the lookup path.
"""

import sqlalchemy as sa
from alembic import op

revision = "pr_0007_email_display_mirror"
down_revision = "pr_0006_status_lifecycle"
branch_labels = None
depends_on = None

_BACKFILL = """
    UPDATE evaluations
    SET email = lower(employees.email)
    FROM employees
    WHERE evaluations.employee_id = employees.employee_id
"""


def upgrade() -> None:
    op.add_column("evaluations", sa.Column("email", sa.String(255)))
    op.execute(_BACKFILL)
    # The join above must cover every row: employee_id is a RESTRICT-bound FK
    # to employees, so no evaluation can exist without its origin row.
    op.alter_column("evaluations", "email", nullable=False)


def downgrade() -> None:
    op.drop_column("evaluations", "email")