"""Widen BDU text fields for FSTEC xlsx severity/name lengths.

Revision ID: 0008_bdu_field_widths
Revises: 0007_local_vulns
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_bdu_field_widths"
down_revision: Union[str, None] = "0007_local_vulns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "bdu_records",
        "name",
        existing_type=sa.String(length=512),
        type_=sa.Text(),
        existing_nullable=False,
    )
    op.alter_column(
        "bdu_records",
        "severity",
        existing_type=sa.String(length=64),
        type_=sa.Text(),
        existing_nullable=False,
    )
    op.alter_column(
        "bdu_records",
        "status",
        existing_type=sa.String(length=64),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "bdu_records",
        "status",
        existing_type=sa.Text(),
        type_=sa.String(length=64),
        existing_nullable=False,
    )
    op.alter_column(
        "bdu_records",
        "severity",
        existing_type=sa.Text(),
        type_=sa.String(length=64),
        existing_nullable=False,
    )
    op.alter_column(
        "bdu_records",
        "name",
        existing_type=sa.Text(),
        type_=sa.String(length=512),
        existing_nullable=False,
    )
