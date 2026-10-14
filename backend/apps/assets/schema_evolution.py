"""Schema revisions and one update request for each affected shipyard manager."""

from collections import Counter

from apps.notifications.services import create_notification
from apps.user.models import User, UserRole
from .models import Asset, AssetType
from .validation import missing_required_fields


def _semantic_schema(schema):
    """Omitted optional flags and explicit false express the same requirement."""
    return [{**field, 'required': field.get('required', False),
             'is_unique_key': field.get('is_unique_key', False)} for field in schema or []]


def advance_schema_revision(asset_type: AssetType, previous_schema: list) -> bool:
    """Caller holds the type row lock and saves the returned revision in its transaction."""
    changed = _semantic_schema(previous_schema) != _semantic_schema(asset_type.schema)
    if changed:
        asset_type.schema_revision += 1
    return changed


def schema_impact(asset_type: AssetType, schema: list) -> dict:
    """Read private records only to count missing fields; never expose their values."""
    required = [field for field in schema or [] if field.get('required') is True]
    records = Asset.objects.filter(asset_type=asset_type)
    asset_count = records.count()
    affected = Counter()
    if required:
        for tenant_id, data in records.values_list('tenant_id', 'custom_data').iterator(chunk_size=2000):
            if missing_required_fields(required, data):
                affected[tenant_id] += 1
    from apps.tenants.models import Tenant
    tenants = Tenant.objects.filter(pk__in=affected).order_by('name').values('id', 'name')
    return {
        'asset_count': asset_count,
        'affected_asset_count': sum(affected.values()),
        'affected_tenant_count': len(affected),
        'tenants': [{'id': str(tenant['id']), 'name': tenant['name'],
                     'asset_count': affected[tenant['id']]} for tenant in tenants],
        'required_fields': [{'key': field['key'], 'label': field['label']} for field in required],
    }


def notify_schema_change(asset_type: AssetType, previous_schema: list) -> list:
    """A newly required field triggers one durable event per manager and revision."""
    previously_required = {field['key'] for field in previous_schema or [] if field.get('required') is True}
    newly_required = [field for field in asset_type.schema or []
                      if field.get('required') is True and field['key'] not in previously_required]
    if not newly_required:
        return []
    impact = schema_impact(asset_type, newly_required)
    affected = {tenant['id']: tenant['asset_count'] for tenant in impact['tenants']}
    recipients = User.objects.filter(
        tenant_id__in=affected, tenant__is_active=True, role=UserRole.TENANT_ADMIN, is_active=True,
    ).select_related('tenant')
    notifications = []
    for user in recipients:
        count = affected[str(user.tenant_id)]
        if user.preferred_language == 'en':
            title = 'Inventory needs an update'
            message = (f'{asset_type.name} has new required fields. '
                       f'Complete the missing information in {count} inventory records.')
        else:
            title = 'Envanter bilgilerini güncelleyin'
            message = (f'{asset_type.name} türüne zorunlu alan eklendi. '
                       f'{count} envanter kaydındaki eksik bilgileri tamamlayın.')
        notifications.append(create_notification(user, {
            'title': title, 'message': message, 'type': 'warning', 'event_type': 'asset_schema_updated',
            'url': f'/assets?asset_type={asset_type.pk}&needs_update=true',
            'asset_type_id': str(asset_type.pk), 'schema_revision': asset_type.schema_revision,
            'affected_asset_count': count, 'audience_tenant_id': str(user.tenant_id),
            'audience_role': UserRole.TENANT_ADMIN,
        }, event_key=f'asset-schema:{asset_type.pk}:{asset_type.schema_revision}'))
    return notifications
