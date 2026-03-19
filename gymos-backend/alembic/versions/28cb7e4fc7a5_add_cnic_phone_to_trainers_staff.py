"""add_cnic_phone_to_trainers_staff

Revision ID: 28cb7e4fc7a5
Revises: 0760cbf52b19
Create Date: 2026-03-12 12:14:45.606452

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '28cb7e4fc7a5'
down_revision: Union[str, None] = '0760cbf52b19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column('trainers', sa.Column('cnic',  sa.String(15), nullable=True))
    op.add_column('trainers', sa.Column('phone', sa.String(20), nullable=True))
    op.add_column('staff',    sa.Column('cnic',  sa.String(15), nullable=True))
    op.add_column('staff',    sa.Column('phone', sa.String(20), nullable=True))

def downgrade():
    op.drop_column('trainers', 'cnic')
    op.drop_column('trainers', 'phone')
    op.drop_column('staff',    'cnic')
    op.drop_column('staff',    'phone')