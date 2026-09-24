"""Org watchlist + pg_trgm GIN indexes for search.

Revision ID: 0012_watchlist_fts
Revises: 0011_sync_run_lease
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_watchlist_fts"
down_revision: Union[str, None] = "0011_sync_run_lease"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "org_watchlist_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_key", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),  # cve | vendor | product
        sa.Column("value", sa.String(length=512), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_org_watchlist_org_key", "org_watchlist_entries", ["org_key"])
    op.create_index("ix_org_watchlist_user_id", "org_watchlist_entries", ["user_id"])
    op.create_index("ix_org_watchlist_kind_value", "org_watchlist_entries", ["kind", "value"])

    # pg_trgm — no-op on non-Postgres (tests use SQLite create_all)
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.execute("CREATE INDEX IF NOT EXISTS ix_cves_title_trgm ON cves USING gin (title gin_trgm_ops)")
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_cves_description_trgm ON cves USING gin (description gin_trgm_ops)"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_bdu_name_trgm ON bdu_records USING gin (name gin_trgm_ops)"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_bdu_description_trgm ON bdu_records USING gin (description gin_trgm_ops)"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_local_title_trgm ON local_vulns USING gin (title gin_trgm_ops)"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_local_description_trgm ON local_vulns USING gin (description gin_trgm_ops)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_local_description_trgm")
        op.execute("DROP INDEX IF EXISTS ix_local_title_trgm")
        op.execute("DROP INDEX IF EXISTS ix_bdu_description_trgm")
        op.execute("DROP INDEX IF EXISTS ix_bdu_name_trgm")
        op.execute("DROP INDEX IF EXISTS ix_cves_description_trgm")
        op.execute("DROP INDEX IF EXISTS ix_cves_title_trgm")
    op.drop_index("ix_org_watchlist_kind_value", table_name="org_watchlist_entries")
    op.drop_index("ix_org_watchlist_user_id", table_name="org_watchlist_entries")
    op.drop_index("ix_org_watchlist_org_key", table_name="org_watchlist_entries")
    op.drop_table("org_watchlist_entries")
