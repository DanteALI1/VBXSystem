"""Ticket SLA fields + setup_completed back-compat for existing installs.

Revision ID: 0017_ticket_sla_setup
Revises: 0016_dashboard_perf_indexes
Create Date: 2026-09-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_ticket_sla_setup"
down_revision: Union[str, None] = "0016_dashboard_perf_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("sla_hours", sa.Integer(), nullable=True))
    op.create_index("ix_tickets_due_date", "tickets", ["due_date"])

    # Existing installs (any user already present) must not be forced into wizard.
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        exists = bind.execute(
            sa.text("SELECT 1 FROM system_settings WHERE key = 'setup_completed' LIMIT 1")
        ).fetchone()
        users = bind.execute(sa.text("SELECT 1 FROM users LIMIT 1")).fetchone()
        if not exists and users:
            bind.execute(
                sa.text(
                    "INSERT INTO system_settings (key, value, updated_at) VALUES ('setup_completed', 'true', CURRENT_TIMESTAMP)"
                )
            )
    else:
        op.execute(
            sa.text(
                """
                INSERT INTO system_settings (key, value, updated_at)
                SELECT 'setup_completed', 'true', NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM system_settings WHERE key = 'setup_completed'
                )
                AND EXISTS (SELECT 1 FROM users LIMIT 1)
                """
            )
        )


def downgrade() -> None:
    op.drop_index("ix_tickets_due_date", table_name="tickets")
    op.drop_column("tickets", "sla_hours")
