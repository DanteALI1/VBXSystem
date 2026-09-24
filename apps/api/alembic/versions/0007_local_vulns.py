"""Local vulns + sequences (W9 enrichment).

Revision ID: 0007_local_vulns
Revises: 0006_tickets
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_local_vulns"
down_revision = "0006_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "local_id_sequences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("prefix", sa.String(16), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("last_number", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("prefix", "year", name="uq_local_id_prefix_year"),
    )
    op.create_table(
        "local_vulns",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(32), nullable=False),
        sa.Column("status", sa.String(64), nullable=False),
        sa.Column("vendor", sa.Text(), nullable=False),
        sa.Column("product_name", sa.Text(), nullable=False),
        sa.Column("remediation", sa.Text(), nullable=False),
        sa.Column("linked_cve_ids", sa.Text(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_local_vulns_severity", "local_vulns", ["severity"])


def downgrade() -> None:
    op.drop_index("ix_local_vulns_severity", table_name="local_vulns")
    op.drop_table("local_vulns")
    op.drop_table("local_id_sequences")
