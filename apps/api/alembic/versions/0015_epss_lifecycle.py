"""EPSS scores unique (cve_id, scored_at) + history indexes; dedupe + prune.

Revision ID: 0015_epss_lifecycle
Revises: 0014_sso_users
Create Date: 2026-09-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015_epss_lifecycle"
down_revision: Union[str, None] = "0014_sso_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Match apps.api.app.services.epss_sync.EPSS_KEEP_GENERATIONS
_KEEP_GENERATIONS = 3


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # Collapse duplicate (cve_id, scored_at) rows — keep highest id.
    if dialect == "postgresql":
        op.execute(
            """
            DELETE FROM epss_scores a
            USING epss_scores b
            WHERE a.cve_id = b.cve_id
              AND a.scored_at = b.scored_at
              AND a.id < b.id
            """
        )
    else:
        op.execute(
            """
            DELETE FROM epss_scores
            WHERE id NOT IN (
              SELECT MAX(id) FROM epss_scores GROUP BY cve_id, scored_at
            )
            """
        )

    # Drop generations older than the newest N distinct scored_at values.
    if dialect == "postgresql":
        op.execute(
            sa.text(
                """
                DELETE FROM epss_scores
                WHERE scored_at NOT IN (
                  SELECT scored_at FROM (
                    SELECT DISTINCT scored_at
                    FROM epss_scores
                    WHERE scored_at <> ''
                    ORDER BY scored_at DESC
                    LIMIT :keep_n
                  ) keep_dates
                )
                AND scored_at <> ''
                """
            ).bindparams(keep_n=_KEEP_GENERATIONS)
        )
    else:
        # SQLite: same idea via nested select
        rows = bind.execute(
            sa.text(
                """
                SELECT DISTINCT scored_at FROM epss_scores
                WHERE scored_at <> ''
                ORDER BY scored_at DESC
                LIMIT :keep_n
                """
            ),
            {"keep_n": _KEEP_GENERATIONS},
        ).fetchall()
        keep = [r[0] for r in rows]
        if keep:
            placeholders = ", ".join(f":d{i}" for i in range(len(keep)))
            params = {f"d{i}": v for i, v in enumerate(keep)}
            op.execute(
                sa.text(
                    f"DELETE FROM epss_scores WHERE scored_at NOT IN ({placeholders}) AND scored_at <> ''"
                ).bindparams(**params)
            )

    op.create_unique_constraint(
        "uq_epss_scores_cve_scored_at", "epss_scores", ["cve_id", "scored_at"]
    )
    op.create_index("ix_epss_scores_cve_id_id", "epss_scores", ["cve_id", "id"])
    op.create_index("ix_epss_scores_scored_at", "epss_scores", ["scored_at"])


def downgrade() -> None:
    op.drop_index("ix_epss_scores_scored_at", table_name="epss_scores")
    op.drop_index("ix_epss_scores_cve_id_id", table_name="epss_scores")
    op.drop_constraint("uq_epss_scores_cve_scored_at", "epss_scores", type_="unique")
