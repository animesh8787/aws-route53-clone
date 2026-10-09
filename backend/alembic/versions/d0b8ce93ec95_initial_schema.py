"""initial schema

Revision ID: d0b8ce93ec95
Revises: 
Create Date: 2026-10-09 12:26:32.110665

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd0b8ce93ec95'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands schema operations ###
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('display_name', sa.String(length=100), nullable=False),
    sa.Column('account_id', sa.String(length=12), nullable=False),
    sa.Column('failed_logins', sa.Integer(), nullable=False),
    sa.Column('locked_until', sa.DateTime(), nullable=True),
    sa.Column('password_changed_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('activity_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('action', sa.String(length=32), nullable=False),
    sa.Column('resource_type', sa.String(length=40), nullable=False),
    sa.Column('resource_name', sa.String(length=255), nullable=False),
    sa.Column('href', sa.String(length=255), nullable=True),
    sa.Column('detail', sa.String(length=255), nullable=False),
    sa.Column('is_read', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_activity_owner_created', 'activity_events', ['owner_id', 'created_at'], unique=False)
    op.create_table('health_checks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('health_check_id', sa.String(length=40), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('type', sa.String(length=20), nullable=False),
    sa.Column('endpoint', sa.String(length=255), nullable=False),
    sa.Column('port', sa.Integer(), nullable=False),
    sa.Column('path', sa.String(length=255), nullable=False),
    sa.Column('search_string', sa.String(length=255), nullable=True),
    sa.Column('request_interval', sa.Integer(), nullable=False),
    sa.Column('failure_threshold', sa.Integer(), nullable=False),
    sa.Column('regions', sa.JSON(), nullable=False),
    sa.Column('inverted', sa.Boolean(), nullable=False),
    sa.Column('disabled', sa.Boolean(), nullable=False),
    sa.Column('status', sa.String(length=12), nullable=False),
    sa.Column('history', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_health_checks_health_check_id'), 'health_checks', ['health_check_id'], unique=True)
    op.create_index(op.f('ix_health_checks_owner_id'), 'health_checks', ['owner_id'], unique=False)
    op.create_table('hosted_zones',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('zone_id', sa.String(length=32), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('is_private', sa.Boolean(), nullable=False),
    sa.Column('comment', sa.String(length=256), nullable=False),
    sa.Column('tags', sa.JSON(), nullable=False),
    sa.Column('dnssec', sa.JSON(), nullable=True),
    sa.Column('record_count', sa.Integer(), nullable=False),
    sa.Column('created_by', sa.String(length=100), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_id', 'name', 'is_private', name='uq_zone_owner_name_type')
    )
    op.create_index(op.f('ix_hosted_zones_name'), 'hosted_zones', ['name'], unique=False)
    op.create_index(op.f('ix_hosted_zones_owner_id'), 'hosted_zones', ['owner_id'], unique=False)
    op.create_index(op.f('ix_hosted_zones_zone_id'), 'hosted_zones', ['zone_id'], unique=True)
    op.create_table('resources',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.String(length=32), nullable=False),
    sa.Column('public_id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=128), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=True),
    sa.Column('data', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_id', 'kind', 'name', name='uq_resource_owner_kind_name')
    )
    op.create_index('ix_resources_owner_kind', 'resources', ['owner_id', 'kind'], unique=False)
    op.create_index(op.f('ix_resources_public_id'), 'resources', ['public_id'], unique=True)
    op.create_table('sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('user_agent', sa.String(length=255), nullable=False),
    sa.Column('ip_address', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sessions_token_hash'), 'sessions', ['token_hash'], unique=True)
    op.create_index(op.f('ix_sessions_user_id'), 'sessions', ['user_id'], unique=False)
    op.create_table('dns_records',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('hosted_zone_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('type', sa.String(length=8), nullable=False),
    sa.Column('ttl', sa.Integer(), nullable=True),
    sa.Column('values', sa.JSON(), nullable=False),
    sa.Column('routing_policy', sa.String(length=16), nullable=False),
    sa.Column('set_identifier', sa.String(length=128), nullable=False),
    sa.Column('weight', sa.Integer(), nullable=True),
    sa.Column('region', sa.String(length=32), nullable=True),
    sa.Column('failover', sa.String(length=10), nullable=True),
    sa.Column('geo_continent', sa.String(length=2), nullable=True),
    sa.Column('geo_country', sa.String(length=2), nullable=True),
    sa.Column('geo_subdivision', sa.String(length=3), nullable=True),
    sa.Column('cidr_collection_id', sa.String(length=64), nullable=True),
    sa.Column('cidr_location', sa.String(length=64), nullable=True),
    sa.Column('policy_record_id', sa.String(length=64), nullable=True),
    sa.Column('alias_target', sa.String(length=255), nullable=True),
    sa.Column('alias_target_type', sa.String(length=20), nullable=True),
    sa.Column('alias_hosted_zone_id', sa.String(length=32), nullable=True),
    sa.Column('evaluate_target_health', sa.Boolean(), nullable=False),
    sa.Column('health_check_id', sa.Integer(), nullable=True),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['health_check_id'], ['health_checks.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['hosted_zone_id'], ['hosted_zones.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('hosted_zone_id', 'name', 'type', 'set_identifier', name='uq_record_identity')
    )
    op.create_index(op.f('ix_dns_records_cidr_collection_id'), 'dns_records', ['cidr_collection_id'], unique=False)
    op.create_index(op.f('ix_dns_records_policy_record_id'), 'dns_records', ['policy_record_id'], unique=False)
    op.create_index(op.f('ix_dns_records_type'), 'dns_records', ['type'], unique=False)
    op.create_index('ix_records_zone_name_type', 'dns_records', ['hosted_zone_id', 'name', 'type'], unique=False)
    op.create_table('vpc_associations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('hosted_zone_id', sa.Integer(), nullable=False),
    sa.Column('vpc_id', sa.String(length=32), nullable=False),
    sa.Column('region', sa.String(length=32), nullable=False),
    sa.ForeignKeyConstraint(['hosted_zone_id'], ['hosted_zones.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vpc_associations_hosted_zone_id'), 'vpc_associations', ['hosted_zone_id'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands schema operations ###
    op.drop_index(op.f('ix_vpc_associations_hosted_zone_id'), table_name='vpc_associations')
    op.drop_table('vpc_associations')
    op.drop_index('ix_records_zone_name_type', table_name='dns_records')
    op.drop_index(op.f('ix_dns_records_type'), table_name='dns_records')
    op.drop_index(op.f('ix_dns_records_policy_record_id'), table_name='dns_records')
    op.drop_index(op.f('ix_dns_records_cidr_collection_id'), table_name='dns_records')
    op.drop_table('dns_records')
    op.drop_index(op.f('ix_sessions_user_id'), table_name='sessions')
    op.drop_index(op.f('ix_sessions_token_hash'), table_name='sessions')
    op.drop_table('sessions')
    op.drop_index(op.f('ix_resources_public_id'), table_name='resources')
    op.drop_index('ix_resources_owner_kind', table_name='resources')
    op.drop_table('resources')
    op.drop_index(op.f('ix_hosted_zones_zone_id'), table_name='hosted_zones')
    op.drop_index(op.f('ix_hosted_zones_owner_id'), table_name='hosted_zones')
    op.drop_index(op.f('ix_hosted_zones_name'), table_name='hosted_zones')
    op.drop_table('hosted_zones')
    op.drop_index(op.f('ix_health_checks_owner_id'), table_name='health_checks')
    op.drop_index(op.f('ix_health_checks_health_check_id'), table_name='health_checks')
    op.drop_table('health_checks')
    op.drop_index('ix_activity_owner_created', table_name='activity_events')
    op.drop_table('activity_events')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    # ### end Alembic commands ###
