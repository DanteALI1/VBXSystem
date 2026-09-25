"""Risk triage: finding risk/priority/SLA/acceptance + asset criticality.

Revision ID: 0022_risk_triage
Revises: 0021_ops_foundation
Create Date: 2026-09-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022_risk_triage"
down_revision: Union[str, tuple[str, ...], None] = "0021_ops_foundation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column("criticality", sa.String(length=32), nullable=False, server_default="medium"),
    )
    op.create_index("ix_assets_criticality", "assets", ["criticality"])

    op.add_column(
        "findings",
        sa.Column("risk_score", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "findings",
        sa.Column("priority", sa.String(length=32), nullable=False, server_default="medium"),
    )
    op.add_column("findings", sa.Column("due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "findings",
        sa.Column("sla_hours", sa.Integer(), nullable=True),
    )
    op.add_column(
        "findings",
        sa.Column("acceptance_reason", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "findings",
        sa.Column("accepted_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "findings",
        sa.Column("tags_json", sa.Text(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "findings",
        sa.Column("external_ref", sa.String(length=255), nullable=False, server_default=""),
    )
    op.create_index("ix_findings_risk_score", "findings", ["risk_score"])
    op.create_index("ix_findings_priority", "findings", ["priority"])
    op.create_index("ix_findings_due_at", "findings", ["due_at"])


def downgrade() -> None:
    op.drop_index("ix_findings_due_at", table_name="findings")
    op.drop_index("ix_findings_priority", table_name="findings")
    op.drop_index("ix_findings_risk_score", table_name="findings")
    op.drop_column("findings", "external_ref")
    op.drop_column("findings", "tags_json")
    op.drop_column("findings", "accepted_until")
    op.drop_column("findings", "acceptance_reason")
    op.drop_column("findings", "sla_hours")
    op.drop_column("findings", "due_at")
    op.drop_column("findings", "priority")
    op.drop_column("findings", "risk_score")
    op.drop_index("ix_assets_criticality", table_name="assets")
    op.drop_column("assets", "criticality")
