"""Scanner module core: assets, scan_jobs, findings, module_registry.

Revision ID: 0018_scan_modules
Revises: 0017_ticket_sla_setup
Create Date: 2026-09-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018_scan_modules"
down_revision: Union[str, None] = "0017_ticket_sla_setup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "module_registry",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("version", sa.String(64), nullable=False, server_default=""),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("capabilities_json", sa.Text(), nullable=False, server_default="[]"),
    )

    op.create_table(
        "assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(64), nullable=False, server_default="host"),
        sa.Column("hostname", sa.String(255), nullable=False, server_default=""),
        sa.Column("ip", sa.String(64), nullable=False, server_default=""),
        sa.Column("ports_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("tags_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_assets_hostname", "assets", ["hostname"])
    op.create_index("ix_assets_ip", "assets", ["ip"])
    op.create_index("ix_assets_kind", "assets", ["kind"])

    op.create_table(
        "scan_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("module_id", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("params_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("progress_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_owner", sa.String(128), nullable=True),
        sa.Column("leased_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_scan_jobs_module_id", "scan_jobs", ["module_id"])
    op.create_index("ix_scan_jobs_status", "scan_jobs", ["status"])
    op.create_index("ix_scan_jobs_created_by", "scan_jobs", ["created_by"])
    op.create_index("ix_scan_jobs_created_at", "scan_jobs", ["created_at"])

    op.create_table(
        "findings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "scan_job_id",
            sa.Integer(),
            sa.ForeignKey("scan_jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("module_id", sa.String(128), nullable=False),
        sa.Column(
            "asset_id",
            sa.Integer(),
            sa.ForeignKey("assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(512), nullable=False, server_default=""),
        sa.Column("severity", sa.String(32), nullable=False, server_default="MEDIUM"),
        sa.Column("status", sa.String(32), nullable=False, server_default="open"),
        sa.Column("evidence_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("raw_ref", sa.String(512), nullable=False, server_default=""),
        sa.Column("linked_cve_ids_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("linked_bdu_ids_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column(
            "ticket_id",
            sa.Integer(),
            sa.ForeignKey("tickets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_findings_scan_job_id", "findings", ["scan_job_id"])
    op.create_index("ix_findings_module_id", "findings", ["module_id"])
    op.create_index("ix_findings_asset_id", "findings", ["asset_id"])
    op.create_index("ix_findings_severity", "findings", ["severity"])
    op.create_index("ix_findings_status", "findings", ["status"])
    op.create_index("ix_findings_ticket_id", "findings", ["ticket_id"])
    op.create_index("ix_findings_created_at", "findings", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_findings_created_at", table_name="findings")
    op.drop_index("ix_findings_ticket_id", table_name="findings")
    op.drop_index("ix_findings_status", table_name="findings")
    op.drop_index("ix_findings_severity", table_name="findings")
    op.drop_index("ix_findings_asset_id", table_name="findings")
    op.drop_index("ix_findings_module_id", table_name="findings")
    op.drop_index("ix_findings_scan_job_id", table_name="findings")
    op.drop_table("findings")
    op.drop_index("ix_scan_jobs_created_at", table_name="scan_jobs")
    op.drop_index("ix_scan_jobs_created_by", table_name="scan_jobs")
    op.drop_index("ix_scan_jobs_status", table_name="scan_jobs")
    op.drop_index("ix_scan_jobs_module_id", table_name="scan_jobs")
    op.drop_table("scan_jobs")
    op.drop_index("ix_assets_kind", table_name="assets")
    op.drop_index("ix_assets_ip", table_name="assets")
    op.drop_index("ix_assets_hostname", table_name="assets")
    op.drop_table("assets")
    op.drop_table("module_registry")
