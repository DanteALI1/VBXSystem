"""Asset inventory: segment, owner, partial unique indexes, tags taxonomy.

Revision ID: 0019_asset_inventory_enhance
Revises: 0018_scan_modules
Create Date: 2026-09-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019_asset_inventory_enhance"
down_revision: Union[str, None] = "0018_scan_modules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_TAGS_JSON = '["prod","stage","dev","dmz","critical","legacy","corp-lan"]'


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column("segment", sa.String(128), nullable=False, server_default=""),
    )
    op.add_column(
        "assets",
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_assets_segment", "assets", ["segment"])
    op.create_index("ix_assets_owner_user_id", "assets", ["owner_user_id"])
    op.create_foreign_key(
        "fk_assets_owner_user_id_users",
        "assets",
        "users",
        ["owner_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Partial unique indexes work on both PostgreSQL and SQLite.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_ip_nonempty "
        "ON assets (ip) WHERE ip != ''"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_hostname_nonempty "
        "ON assets (hostname) WHERE hostname != ''"
    )

    # Suggested tags taxonomy in system_settings (idempotent seed).
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        op.execute(
            sa.text(
                """
                INSERT OR IGNORE INTO system_settings (key, value, updated_at)
                VALUES ('assets_tags_taxonomy_json', :val, CURRENT_TIMESTAMP)
                """
            ).bindparams(val=DEFAULT_TAGS_JSON)
        )
    else:
        op.execute(
            sa.text(
                """
                INSERT INTO system_settings (key, value, updated_at)
                VALUES ('assets_tags_taxonomy_json', :val, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO NOTHING
                """
            ).bindparams(val=DEFAULT_TAGS_JSON)
        )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_assets_hostname_nonempty")
    op.execute("DROP INDEX IF EXISTS uq_assets_ip_nonempty")
    op.drop_constraint("fk_assets_owner_user_id_users", "assets", type_="foreignkey")
    op.drop_index("ix_assets_owner_user_id", table_name="assets")
    op.drop_index("ix_assets_segment", table_name="assets")
    op.drop_column("assets", "owner_user_id")
    op.drop_column("assets", "segment")
    op.execute(
        sa.text("DELETE FROM system_settings WHERE key = 'assets_tags_taxonomy_json'")
    )
