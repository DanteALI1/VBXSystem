"""Alert policies + ticket external_ref + finding project_id FK polish + scan_jobs.project_id.

Revision ID: 0023_integrations_alerts
Revises: 0022_risk_triage
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023_integrations_alerts"
down_revision: Union[str, tuple[str, ...], None] = "0022_risk_triage"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("external_ref", sa.String(length=255), nullable=False, server_default=""),
    )
    op.add_column("scan_jobs", sa.Column("project_id", sa.Integer(), nullable=True))
    op.create_index("ix_scan_jobs_project_id", "scan_jobs", ["project_id"])
    op.add_column("findings", sa.Column("project_id", sa.Integer(), nullable=True))
    op.create_index("ix_findings_project_id", "findings", ["project_id"])

    op.create_table(
        "alert_policies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("trigger", sa.String(64), nullable=False, server_default=""),
        sa.Column("filters_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("channels_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_alert_policies_trigger", "alert_policies", ["trigger"])
    op.create_index("ix_alert_policies_enabled", "alert_policies", ["enabled"])

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("org_unit_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_projects_name", "projects", ["name"])
    op.create_index("ix_projects_org_unit_id", "projects", ["org_unit_id"])


def downgrade() -> None:
    op.drop_index("ix_projects_org_unit_id", table_name="projects")
    op.drop_index("ix_projects_name", table_name="projects")
    op.drop_table("projects")
    op.drop_index("ix_alert_policies_enabled", table_name="alert_policies")
    op.drop_index("ix_alert_policies_trigger", table_name="alert_policies")
    op.drop_table("alert_policies")
    op.drop_index("ix_findings_project_id", table_name="findings")
    op.drop_column("findings", "project_id")
    op.drop_index("ix_scan_jobs_project_id", table_name="scan_jobs")
    op.drop_column("scan_jobs", "project_id")
    op.drop_column("tickets", "external_ref")
