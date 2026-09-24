"""Settings suite tables: notifications + API keys.

Revision ID: 0005_settings
Revises: 0004_xdb
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_settings"
down_revision = "0004_xdb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_preferences",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("new_vulns", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("kev_updates", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("nvd_sync", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("bdu_import", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("ticket_events", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("channel_toast", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("channel_modal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("prefix", sa.String(16), nullable=False),
        sa.Column("key_hash", sa.String(128), nullable=False),
        sa.Column("scopes_json", sa.Text(), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_api_keys_prefix", "api_keys", ["prefix"])
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)
    op.create_index("ix_api_keys_owner_user_id", "api_keys", ["owner_user_id"])


def downgrade() -> None:
    op.drop_index("ix_api_keys_owner_user_id", table_name="api_keys")
    op.drop_index("ix_api_keys_key_hash", table_name="api_keys")
    op.drop_index("ix_api_keys_prefix", table_name="api_keys")
    op.drop_table("api_keys")
    op.drop_table("notification_preferences")
