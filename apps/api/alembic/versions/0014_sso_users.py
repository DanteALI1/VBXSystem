"""Add SSO identity fields on users.

Revision ID: 0014_sso_users
Revises: 0013_dashboard_layouts
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_sso_users"
down_revision: Union[str, None] = "0013_dashboard_layouts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("auth_provider", sa.String(length=32), nullable=False, server_default="local"),
    )
    op.add_column("users", sa.Column("external_sub", sa.String(length=255), nullable=True))
    op.create_index("ix_users_external_sub", "users", ["external_sub"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_external_sub", table_name="users")
    op.drop_column("users", "external_sub")
    op.drop_column("users", "auth_provider")
