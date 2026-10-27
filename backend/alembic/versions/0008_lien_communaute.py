"""lien de la communaute WhatsApp

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa


revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('parametres', schema=None) as batch_op:
        batch_op.add_column(sa.Column('lien_communaute', sa.String(length=300), server_default='', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('parametres', schema=None) as batch_op:
        batch_op.drop_column('lien_communaute')
