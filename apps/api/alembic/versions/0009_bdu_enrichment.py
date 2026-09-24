"""Enrich BDU records with FSTEC xlsx columns.

Revision ID: 0009_bdu_enrichment
Revises: 0008_bdu_field_widths
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_bdu_enrichment"
down_revision: Union[str, None] = "0008_bdu_field_widths"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bdu_records", sa.Column("software_versions", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("software_type", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("os_platform", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("vuln_class", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("cvss2_vector", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("cvss3_vector", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("cvss4_vector", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("exploit_status", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("fix_info", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("exploit_method", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("fix_method", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("references_json", sa.Text(), server_default="[]", nullable=False))
    op.add_column("bdu_records", sa.Column("published_date", sa.String(length=64), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("updated_date", sa.String(length=64), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("cwe_description", sa.Text(), server_default="", nullable=False))
    op.add_column("bdu_records", sa.Column("extra_json", sa.Text(), server_default="{}", nullable=False))


def downgrade() -> None:
    for col in (
        "extra_json",
        "cwe_description",
        "updated_date",
        "published_date",
        "references_json",
        "fix_method",
        "exploit_method",
        "fix_info",
        "exploit_status",
        "cvss4_vector",
        "cvss3_vector",
        "cvss2_vector",
        "vuln_class",
        "os_platform",
        "software_type",
        "software_versions",
    ):
        op.drop_column("bdu_records", col)
