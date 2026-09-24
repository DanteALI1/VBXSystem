"""XDB exploits table.

Revision ID: 0004_xdb
Revises: 0003_vuln_core
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_xdb"
down_revision = "0003_vuln_core"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exploits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("xdb_id", sa.String(64), nullable=False),
        sa.Column("cve_id", sa.String(32), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("repo_url", sa.String(1024), nullable=False),
        sa.Column("repo_name", sa.String(512), nullable=False),
        sa.Column("author", sa.String(255), nullable=False),
        sa.Column("source", sa.String(64), nullable=False),
        sa.Column("raw_meta", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_exploits_xdb_id", "exploits", ["xdb_id"], unique=True)
    op.create_index("ix_exploits_cve_id", "exploits", ["cve_id"])
    op.create_index("ix_exploits_published_at", "exploits", ["published_at"])
    op.create_index("ix_exploits_author", "exploits", ["author"])


def downgrade() -> None:
    op.drop_index("ix_exploits_author", table_name="exploits")
    op.drop_index("ix_exploits_published_at", table_name="exploits")
    op.drop_index("ix_exploits_cve_id", table_name="exploits")
    op.drop_index("ix_exploits_xdb_id", table_name="exploits")
    op.drop_table("exploits")
