"""Scanner credential vault table.

Revision ID: 0020_scan_credentials
Revises: 0019_finding_fingerprint, 0019_asset_inventory_enhance
Create Date: 2026-09-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0020_scan_credentials"
down_revision: Union[str, tuple[str, ...], None] = (
    "0019_finding_fingerprint",
    "0019_asset_inventory_enhance",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scan_credentials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("kind", sa.String(64), nullable=False, server_default="http_form"),
        sa.Column("username", sa.String(255), nullable=False, server_default=""),
        sa.Column("password_enc", sa.Text(), nullable=False, server_default=""),
        sa.Column("extra_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_scan_credentials_name", "scan_credentials", ["name"])
    op.create_index("ix_scan_credentials_kind", "scan_credentials", ["kind"])


def downgrade() -> None:
    op.drop_index("ix_scan_credentials_kind", table_name="scan_credentials")
    op.drop_index("ix_scan_credentials_name", table_name="scan_credentials")
    op.drop_table("scan_credentials")
