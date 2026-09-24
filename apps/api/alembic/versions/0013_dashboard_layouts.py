"""Dashboard layouts + user prefs.

Revision ID: 0013_dashboard_layouts
Revises: 0012_watchlist_fts
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_dashboard_layouts"
down_revision: Union[str, None] = "0012_watchlist_fts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dashboard_layouts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("layout_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_dashboard_layouts_user_id", "dashboard_layouts", ["user_id"])
    op.create_index("ix_dashboard_layouts_slug", "dashboard_layouts", ["slug"])
    op.create_index("ix_dashboard_layouts_is_system", "dashboard_layouts", ["is_system"])

    op.create_table(
        "user_dashboard_prefs",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "active_layout_id",
            sa.Integer(),
            sa.ForeignKey("dashboard_layouts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("user_dashboard_prefs")
    op.drop_index("ix_dashboard_layouts_is_system", table_name="dashboard_layouts")
    op.drop_index("ix_dashboard_layouts_slug", table_name="dashboard_layouts")
    op.drop_index("ix_dashboard_layouts_user_id", table_name="dashboard_layouts")
    op.drop_table("dashboard_layouts")
