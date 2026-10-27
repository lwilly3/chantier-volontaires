"""figer les jours passes pour les volontaires

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa


revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('parametres', schema=None) as batch_op:
        batch_op.add_column(sa.Column('figer_jours_passes', sa.Boolean(), server_default=sa.true(), nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('parametres', schema=None) as batch_op:
        batch_op.drop_column('figer_jours_passes')
