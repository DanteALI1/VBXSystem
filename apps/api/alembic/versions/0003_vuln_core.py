"""Vuln core tables: CVE, BDU, KEV, EPSS, sync runs.

Revision ID: 0003_vuln_core
Revises: 0002_auth_users
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_vuln_core"
down_revision = "0002_auth_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cves",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(64), nullable=False),
        sa.Column("source", sa.String(128), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("modified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cvss_version", sa.String(16), nullable=False),
        sa.Column("cvss_score", sa.Float(), nullable=True),
        sa.Column("cvss_severity", sa.String(32), nullable=False),
        sa.Column("cvss_vector", sa.String(128), nullable=False),
        sa.Column("is_remote", sa.Boolean(), nullable=False),
        sa.Column("is_cisa_kev", sa.Boolean(), nullable=False),
        sa.Column("cwes", sa.Text(), nullable=False),
        sa.Column("products", sa.Text(), nullable=False),
        sa.Column("references_json", sa.Text(), nullable=False),
        sa.Column("raw_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_cves_is_cisa_kev", "cves", ["is_cisa_kev"])

    op.create_table(
        "bdu_records",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(512), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(64), nullable=False),
        sa.Column("severity_level", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(64), nullable=False),
        sa.Column("solution", sa.Text(), nullable=False),
        sa.Column("vendors", sa.Text(), nullable=False),
        sa.Column("software_names", sa.Text(), nullable=False),
        sa.Column("cwes", sa.Text(), nullable=False),
        sa.Column("linked_cve_ids", sa.Text(), nullable=False),
        sa.Column("identify_date", sa.String(64), nullable=False),
        sa.Column("is_standalone", sa.Boolean(), nullable=False),
        sa.Column("raw_xml", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_bdu_records_is_standalone", "bdu_records", ["is_standalone"])

    op.create_table(
        "cve_bdu_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cve_id", sa.String(32), sa.ForeignKey("cves.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bdu_id", sa.String(64), sa.ForeignKey("bdu_records.id", ondelete="CASCADE"), nullable=False),
    )
    op.create_index("ix_cve_bdu_links_cve_id", "cve_bdu_links", ["cve_id"])
    op.create_index("ix_cve_bdu_links_bdu_id", "cve_bdu_links", ["bdu_id"])

    op.create_table(
        "cisa_kev",
        sa.Column("cve_id", sa.String(32), primary_key=True),
        sa.Column("vendor_project", sa.String(255), nullable=False),
        sa.Column("product", sa.String(255), nullable=False),
        sa.Column("vulnerability_name", sa.String(512), nullable=False),
        sa.Column("date_added", sa.String(32), nullable=False),
        sa.Column("due_date", sa.String(32), nullable=False),
        sa.Column("required_action", sa.Text(), nullable=False),
        sa.Column("known_ransomware", sa.String(64), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("raw_json", sa.Text(), nullable=False),
    )

    op.create_table(
        "epss_scores",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cve_id", sa.String(32), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("percentile", sa.Float(), nullable=False),
        sa.Column("scored_at", sa.String(32), nullable=False),
    )
    op.create_index("ix_epss_scores_cve_id", "epss_scores", ["cve_id"])

    op.create_table(
        "sync_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stats_json", sa.Text(), nullable=False),
        sa.Column("error", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sync_runs_source", "sync_runs", ["source"])
    op.create_index("ix_sync_runs_status", "sync_runs", ["status"])

    op.create_table(
        "source_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("stored_path", sa.String(1024), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sync_run_id", sa.Integer(), sa.ForeignKey("sync_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("source_files")
    op.drop_index("ix_sync_runs_status", table_name="sync_runs")
    op.drop_index("ix_sync_runs_source", table_name="sync_runs")
    op.drop_table("sync_runs")
    op.drop_index("ix_epss_scores_cve_id", table_name="epss_scores")
    op.drop_table("epss_scores")
    op.drop_table("cisa_kev")
    op.drop_index("ix_cve_bdu_links_bdu_id", table_name="cve_bdu_links")
    op.drop_index("ix_cve_bdu_links_cve_id", table_name="cve_bdu_links")
    op.drop_table("cve_bdu_links")
    op.drop_index("ix_bdu_records_is_standalone", table_name="bdu_records")
    op.drop_table("bdu_records")
    op.drop_index("ix_cves_is_cisa_kev", table_name="cves")
    op.drop_table("cves")
