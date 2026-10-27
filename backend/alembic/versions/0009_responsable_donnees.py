"""responsable des donnees (mentions legales)

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa


revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('parametres', schema=None) as batch_op:
        batch_op.add_column(sa.Column('responsable_donnees', sa.String(length=120), server_default='', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('parametres', schema=None) as batch_op:
        batch_op.drop_column('responsable_donnees')
