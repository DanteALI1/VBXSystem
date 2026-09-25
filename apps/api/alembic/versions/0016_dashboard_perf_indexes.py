"""Dashboard query indexes + merge concurrent 0015 heads.

Revision ID: 0016_dashboard_perf_indexes
Revises: 0015_cves_products_trgm, 0015_epss_lifecycle
Create Date: 2026-09-25
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0016_dashboard_perf_indexes"
down_revision: Union[str, tuple[str, ...], None] = (
    "0015_cves_products_trgm",
    "0015_epss_lifecycle",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_cves_published_at", "cves", ["published_at"])
    op.create_index("ix_cves_cvss_score", "cves", ["cvss_score"])
    op.create_index("ix_cisa_kev_date_added", "cisa_kev", ["date_added"])


def downgrade() -> None:
    op.drop_index("ix_cisa_kev_date_added", table_name="cisa_kev")
    op.drop_index("ix_cves_cvss_score", table_name="cves")
    op.drop_index("ix_cves_published_at", table_name="cves")
