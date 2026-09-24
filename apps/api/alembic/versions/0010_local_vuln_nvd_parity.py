"""Local vulns NVD-parity fields for red-team cards.

Revision ID: 0010_local_vuln_nvd_parity
Revises: 0009_bdu_enrichment
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_local_vuln_nvd_parity"
down_revision: Union[str, None] = "0009_bdu_enrichment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("local_vulns", sa.Column("cvss_version", sa.String(length=16), server_default="", nullable=False))
    op.add_column("local_vulns", sa.Column("cvss_score", sa.Float(), nullable=True))
    op.add_column("local_vulns", sa.Column("cvss_severity", sa.String(length=32), server_default="", nullable=False))
    op.add_column("local_vulns", sa.Column("cvss_vector", sa.String(length=256), server_default="", nullable=False))
    op.add_column("local_vulns", sa.Column("is_remote", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("local_vulns", sa.Column("cwes", sa.Text(), server_default="[]", nullable=False))
    op.add_column("local_vulns", sa.Column("products", sa.Text(), server_default="[]", nullable=False))
    op.add_column("local_vulns", sa.Column("references_json", sa.Text(), server_default="[]", nullable=False))
    op.add_column("local_vulns", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("local_vulns", sa.Column("modified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("local_vulns", sa.Column("analysis_status", sa.String(length=64), server_default="", nullable=False))
    op.add_column("local_vulns", sa.Column("linked_bdu_ids", sa.Text(), server_default="[]", nullable=False))
    op.add_column("local_vulns", sa.Column("discovery_source", sa.String(length=128), server_default="", nullable=False))
    op.add_column("local_vulns", sa.Column("notes", sa.Text(), server_default="", nullable=False))


def downgrade() -> None:
    for col in (
        "notes",
        "discovery_source",
        "linked_bdu_ids",
        "analysis_status",
        "modified_at",
        "published_at",
        "references_json",
        "products",
        "cwes",
        "is_remote",
        "cvss_vector",
        "cvss_severity",
        "cvss_score",
        "cvss_version",
    ):
        op.drop_column("local_vulns", col)
