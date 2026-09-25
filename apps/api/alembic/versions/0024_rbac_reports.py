"""Org units RBAC + report templates.

Revision ID: 0024_rbac_reports
Revises: 0023_integrations_alerts
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024_rbac_reports"
down_revision: Union[str, tuple[str, ...], None] = "0023_integrations_alerts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "org_units",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["org_units.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_org_units_name", "org_units", ["name"])
    op.create_index("ix_org_units_parent_id", "org_units", ["parent_id"])

    op.create_table(
        "user_org_units",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("org_unit_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_unit_id"], ["org_units.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "org_unit_id"),
    )

    op.add_column("assets", sa.Column("org_unit_id", sa.Integer(), nullable=True))
    op.create_index("ix_assets_org_unit_id", "assets", ["org_unit_id"])
    op.create_foreign_key(
        "fk_assets_org_unit_id", "assets", "org_units", ["org_unit_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_projects_org_unit_id",
        "projects",
        "org_units",
        ["org_unit_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "report_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("sections_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
    )


def downgrade() -> None:
    op.drop_table("report_templates")
    op.drop_constraint("fk_projects_org_unit_id", "projects", type_="foreignkey")
    op.drop_constraint("fk_assets_org_unit_id", "assets", type_="foreignkey")
    op.drop_index("ix_assets_org_unit_id", table_name="assets")
    op.drop_column("assets", "org_unit_id")
    op.drop_table("user_org_units")
    op.drop_index("ix_org_units_parent_id", table_name="org_units")
    op.drop_index("ix_org_units_name", table_name="org_units")
    op.drop_table("org_units")
