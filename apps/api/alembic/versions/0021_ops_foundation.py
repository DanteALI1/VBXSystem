"""Ops foundation: schedules, job kind/parent, finding assignee/closed, saved filters, alert outbox, finding events.

Revision ID: 0021_ops_foundation
Revises: 0020_scan_credentials
Create Date: 2026-09-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021_ops_foundation"
down_revision: Union[str, tuple[str, ...], None] = "0020_scan_credentials"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scan_jobs",
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="scan"),
    )
    op.add_column(
        "scan_jobs",
        sa.Column("parent_job_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_scan_jobs_kind", "scan_jobs", ["kind"])
    op.create_index("ix_scan_jobs_parent_job_id", "scan_jobs", ["parent_job_id"])
    op.create_foreign_key(
        "fk_scan_jobs_parent_job_id",
        "scan_jobs",
        "scan_jobs",
        ["parent_job_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "findings",
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "findings",
        sa.Column("assignee_user_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_findings_assignee_user_id", "findings", ["assignee_user_id"])
    op.create_foreign_key(
        "fk_findings_assignee_user_id",
        "findings",
        "users",
        ["assignee_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "scan_schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("module_id", sa.String(128), nullable=False, server_default=""),
        sa.Column("params_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("interval_sec", sa.Integer(), nullable=False, server_default="3600"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_scan_schedules_module_id", "scan_schedules", ["module_id"])
    op.create_index("ix_scan_schedules_enabled", "scan_schedules", ["enabled"])
    op.create_index("ix_scan_schedules_next_run_at", "scan_schedules", ["next_run_at"])

    op.create_table(
        "saved_filters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scope", sa.String(64), nullable=False, server_default="findings"),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("query_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_saved_filters_scope", "saved_filters", ["scope"])
    op.create_index("ix_saved_filters_user_id", "saved_filters", ["user_id"])

    op.create_table(
        "alert_outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("channel", sa.String(64), nullable=False, server_default="webhook"),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_alert_outbox_status", "alert_outbox", ["status"])
    op.create_index("ix_alert_outbox_channel", "alert_outbox", ["channel"])

    op.create_table(
        "finding_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("finding_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(64), nullable=False, server_default=""),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("meta_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["finding_id"], ["findings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_finding_events_finding_id", "finding_events", ["finding_id"])
    op.create_index("ix_finding_events_event_type", "finding_events", ["event_type"])
    op.create_index("ix_finding_events_created_at", "finding_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_finding_events_created_at", table_name="finding_events")
    op.drop_index("ix_finding_events_event_type", table_name="finding_events")
    op.drop_index("ix_finding_events_finding_id", table_name="finding_events")
    op.drop_table("finding_events")

    op.drop_index("ix_alert_outbox_channel", table_name="alert_outbox")
    op.drop_index("ix_alert_outbox_status", table_name="alert_outbox")
    op.drop_table("alert_outbox")

    op.drop_index("ix_saved_filters_user_id", table_name="saved_filters")
    op.drop_index("ix_saved_filters_scope", table_name="saved_filters")
    op.drop_table("saved_filters")

    op.drop_index("ix_scan_schedules_next_run_at", table_name="scan_schedules")
    op.drop_index("ix_scan_schedules_enabled", table_name="scan_schedules")
    op.drop_index("ix_scan_schedules_module_id", table_name="scan_schedules")
    op.drop_table("scan_schedules")

    op.drop_constraint("fk_findings_assignee_user_id", "findings", type_="foreignkey")
    op.drop_index("ix_findings_assignee_user_id", table_name="findings")
    op.drop_column("findings", "assignee_user_id")
    op.drop_column("findings", "closed_at")

    op.drop_constraint("fk_scan_jobs_parent_job_id", "scan_jobs", type_="foreignkey")
    op.drop_index("ix_scan_jobs_parent_job_id", table_name="scan_jobs")
    op.drop_index("ix_scan_jobs_kind", table_name="scan_jobs")
    op.drop_column("scan_jobs", "parent_job_id")
    op.drop_column("scan_jobs", "kind")
