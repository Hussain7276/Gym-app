"""merge_heads

Revision ID: eb7cc9185db7
Revises: 0004_fix_members_fk_to_tier_id, b7807f61c0a1
Create Date: 2026-03-12 11:35:44.530193

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'eb7cc9185db7'
down_revision: Union[str, None] = ('0004_fix_members_fk_to_tier_id', 'b7807f61c0a1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass