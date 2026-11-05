"""recurrence, purchases, coin ledger, indexes

Revision ID: b16d9b830376
Revises: 3320152ff66b
Create Date: 2026-11-05 18:06:24.952416

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b16d9b830376'
down_revision: Union[str, Sequence[str], None] = '3320152ff66b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'purchases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('family_id', sa.Integer(), nullable=False),
        sa.Column('item_key', sa.String(), nullable=False),
        sa.Column('item_name', sa.String(), nullable=False),
        sa.Column('price', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['family_id'], ['families.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'item_key', name='uq_purchases_user_item'),
    )
    with op.batch_alter_table('purchases', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_purchases_family_id'), ['family_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_purchases_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_purchases_user_id'), ['user_id'], unique=False)

    op.create_table(
        'coin_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('balance_after', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=True),
        sa.Column('purchase_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint('amount != 0', name='ck_coin_transactions_amount_nonzero'),
        sa.ForeignKeyConstraint(['purchase_id'], ['purchases.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('coin_transactions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_coin_transactions_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_coin_transactions_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_coin_transactions_user_id'), ['user_id'], unique=False)

    # --- Calendar: the boolean flag becomes an explicit recurrence rule. ---
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('recurrence', sa.String(), nullable=False, server_default='none')
        )
        batch_op.add_column(sa.Column('recurrence_day', sa.Integer(), nullable=True))

    # Preserve existing schedules: is_recurring meant "daily".
    op.execute(
        "UPDATE events SET recurrence = 'daily' WHERE is_recurring "
        "AND (recurrence IS NULL OR recurrence = 'none')"
    )

    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_events_family_id'), ['family_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_events_user_id'), ['user_id'], unique=False)
        batch_op.drop_column('is_recurring')

    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_expenses_date'), ['date'], unique=False)
        batch_op.create_index(batch_op.f('ix_expenses_family_id'), ['family_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_expenses_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tasks_assigned_to_id'), ['assigned_to_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_tasks_family_id'), ['family_id'], unique=False)

    # Existing rows may contain NULL, which would break the NOT NULL constraint.
    op.execute("UPDATE users SET coins = 0 WHERE coins IS NULL")
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('coins', existing_type=sa.INTEGER(), nullable=False)
        batch_op.create_index(batch_op.f('ix_users_family_id'), ['family_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_family_id'))
        batch_op.alter_column('coins', existing_type=sa.INTEGER(), nullable=True)

    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tasks_family_id'))
        batch_op.drop_index(batch_op.f('ix_tasks_assigned_to_id'))

    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_expenses_user_id'))
        batch_op.drop_index(batch_op.f('ix_expenses_family_id'))
        batch_op.drop_index(batch_op.f('ix_expenses_date'))

    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_recurring', sa.BOOLEAN(), nullable=True))
        batch_op.drop_index(batch_op.f('ix_events_user_id'))
        batch_op.drop_index(batch_op.f('ix_events_family_id'))

    op.execute(
        "UPDATE events SET is_recurring = (recurrence IS NOT NULL AND recurrence != 'none')"
    )

    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.drop_column('recurrence_day')
        batch_op.drop_column('recurrence')

    with op.batch_alter_table('coin_transactions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_coin_transactions_user_id'))
        batch_op.drop_index(batch_op.f('ix_coin_transactions_id'))
        batch_op.drop_index(batch_op.f('ix_coin_transactions_created_at'))

    op.drop_table('coin_transactions')

    with op.batch_alter_table('purchases', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_purchases_user_id'))
        batch_op.drop_index(batch_op.f('ix_purchases_id'))
        batch_op.drop_index(batch_op.f('ix_purchases_family_id'))

    op.drop_table('purchases')
