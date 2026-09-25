"""Finding fingerprint + last_seen + occurrence_count for rescans dedupe.

Revision ID: 0019_finding_fingerprint
Revises: 0018_scan_modules
Create Date: 2026-09-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019_finding_fingerprint"
down_revision: Union[str, None] = "0018_scan_modules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "findings",
        sa.Column("fingerprint", sa.String(64), nullable=False, server_default=""),
    )
    op.add_column(
        "findings",
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "findings",
        sa.Column("occurrence_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_findings_fingerprint", "findings", ["fingerprint"])


def downgrade() -> None:
    op.drop_index("ix_findings_fingerprint", table_name="findings")
    op.drop_column("findings", "occurrence_count")
    op.drop_column("findings", "last_seen_at")
    op.drop_column("findings", "fingerprint")
