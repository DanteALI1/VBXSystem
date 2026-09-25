"""Add pg_trgm GIN index on cves.products for search.

Revision ID: 0015_cves_products_trgm
Revises: 0014_sso_users
Create Date: 2026-09-25
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0015_cves_products_trgm"
down_revision: Union[str, None] = "0014_sso_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    # title/description already in 0012; products (CPE JSON text) was missing
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_cves_products_trgm ON cves USING gin (products gin_trgm_ops)"
    )
    # Re-assert title/description in case 0012 was skipped on older DBs
    op.execute("CREATE INDEX IF NOT EXISTS ix_cves_title_trgm ON cves USING gin (title gin_trgm_ops)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_cves_description_trgm ON cves USING gin (description gin_trgm_ops)"
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("DROP INDEX IF EXISTS ix_cves_products_trgm")
