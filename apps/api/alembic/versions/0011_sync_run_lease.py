"""SyncRun lease fields for multi-worker claim.

Revision ID: 0011_sync_run_lease
Revises: 0010_local_vuln_nvd_parity
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_sync_run_lease"
down_revision: Union[str, None] = "0010_local_vuln_nvd_parity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sync_runs", sa.Column("lease_owner", sa.String(length=64), nullable=True))
    op.add_column("sync_runs", sa.Column("leased_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("sync_runs", "leased_at")
    op.drop_column("sync_runs", "lease_owner")
