"""add_monthly_fee_and_trainer_id_to_members

Revision ID: 0760cbf52b19
Revises: eb7cc9185db7
Create Date: 2026-03-12 11:55:58.811914

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0760cbf52b19'
down_revision: Union[str, None] = 'eb7cc9185db7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column('members',
        sa.Column('monthly_fee', sa.Numeric(10, 2), nullable=True, default=0)
    )
    op.add_column('members',
        sa.Column('trainer_id', sa.String, sa.ForeignKey('trainers.id'), nullable=True)
    )

def downgrade():
    op.drop_column('members', 'monthly_fee')
    op.drop_column('members', 'trainer_id')


