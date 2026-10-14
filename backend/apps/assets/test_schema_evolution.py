"""Dynamic fields stay optional until an owner explicitly requires them."""

from types import SimpleNamespace
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.notifications.models import Notification
from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Asset, AssetType
from .serializers import AssetSerializer, AssetSharingSerializer, AssetTypeSerializer
from .validation import (
    default_stock_schema, missing_required_fields, schema_role_key,
    stock_quantity_from_data, validate_custom_data, validate_field_schema,
)


class DynamicSchemaValidationTests(TestCase):
    def test_code_only_manual_write_uses_indexed_lookup_and_rechecks_duplicates(self):
        tenant = Tenant.objects.create(name='Invented code-only yard')
        manager = User.objects.create(username='code-only-owner', tenant=tenant, role='tenant_admin')
        asset_type = AssetType.objects.create(name='Invented code-only type', schema=[])
        context = {'request': SimpleNamespace(user=manager)}
        with patch('apps.assets.serializers.AssetIdentityIndex') as identity_index:
            pending = AssetSerializer(data={'asset_type': str(asset_type.pk), 'inventory_code': 'ROW-01'},
                                      context=context)
            pending.is_valid(raise_exception=True)
            Asset.objects.create(tenant=tenant, asset_type=asset_type, inventory_code='ROW-01')
            with self.assertRaises(ValidationError):
                pending.save()
            duplicate = AssetSerializer(data={'asset_type': str(asset_type.pk), 'inventory_code': 'ROW-01'},
                                        context=context)
            self.assertFalse(duplicate.is_valid())
            self.assertIn('inventory_code', duplicate.errors)
            existing = Asset.objects.get(tenant=tenant, inventory_code='ROW-01')
            edit = AssetSerializer(existing, data={'inventory_code': 'ROW-01'}, partial=True, context=context)
            edit.is_valid(raise_exception=True)
            edit.save()
            independent = AssetType.objects.create(name='Other invented code-only type', schema=[])
            valid = AssetSerializer(data={'asset_type': str(independent.pk), 'inventory_code': 'ROW-01'},
                                    context=context)
            valid.is_valid(raise_exception=True)
            valid.save()
            identity_index.assert_not_called()

    def test_numeric_identifier_is_canonical_and_exact_across_manual_writes(self):
        tenant = Tenant.objects.create(name='Invented numeric identity yard')
        manager = User.objects.create(username='numeric-identity-owner', tenant=tenant, role='tenant_admin')
        asset_type = AssetType.objects.create(name='Invented numeric identity', schema=[
            {'key': 'code', 'label': 'Kod', 'type': 'number', 'role': 'identifier'},
        ])
        context = {'request': SimpleNamespace(user=manager)}
        first = AssetSerializer(data={'asset_type': str(asset_type.pk), 'custom_data': {'code': 1}}, context=context)
        first.is_valid(raise_exception=True)
        self.assertEqual(first.save().custom_data['code'], '1')
        for equivalent in ['1', '1.0', '1e0']:
            with self.subTest(equivalent=equivalent):
                duplicate = AssetSerializer(data={'asset_type': str(asset_type.pk), 'custom_data': {'code': equivalent}},
                                             context=context)
                self.assertFalse(duplicate.is_valid())
                self.assertIn('code', duplicate.errors['custom_data'])
        precise = AssetSerializer(data={'asset_type': str(asset_type.pk),
                                        'custom_data': {'code': '1.00000000000000000001'}}, context=context)
        precise.is_valid(raise_exception=True)
        self.assertEqual(precise.save().custom_data['code'], '1.00000000000000000001')
        other = Tenant.objects.create(name='Other invented numeric identity yard')
        other_manager = User.objects.create(username='other-numeric-owner', tenant=other, role='tenant_admin')
        independent = AssetSerializer(data={'asset_type': str(asset_type.pk), 'custom_data': {'code': '1.00'}},
                                       context={'request': SimpleNamespace(user=other_manager)})
        independent.is_valid(raise_exception=True)
        independent.save()

    def test_legacy_numeric_strings_are_duplicate_identities_and_stale_creates_recheck(self):
        tenant = Tenant.objects.create(name='Invented legacy number yard')
        manager = User.objects.create(username='legacy-number-owner', tenant=tenant, role='tenant_admin')
        asset_type = AssetType.objects.create(name='Invented legacy numbers', schema=[
            {'key': 'code', 'label': 'Kod', 'type': 'number', 'is_unique_key': True},
        ])
        context = {'request': SimpleNamespace(user=manager)}
        pending = AssetSerializer(data={'asset_type': str(asset_type.pk), 'custom_data': {'code': 1}}, context=context)
        pending.is_valid(raise_exception=True)
        legacy = Asset.objects.create(tenant=tenant, asset_type=asset_type, custom_data={'code': '1.00'})
        with self.assertRaises(ValidationError):
            pending.save()
        self.assertEqual(Asset.objects.filter(tenant=tenant, asset_type=asset_type).count(), 1)
        legacy.refresh_from_db()
        self.assertEqual(legacy.custom_data['code'], '1.00')

    def test_explicit_role_removal_and_reassignment_do_not_restore_legacy_roles(self):
        for field in [
            {'key': 'quantity', 'label': 'Adet', 'type': 'number', 'role': None},
            {'key': 'quantity', 'label': 'Başlık', 'type': 'number', 'role': 'display_name'},
        ]:
            schema = validate_field_schema([field])
            self.assertIsNone(schema_role_key(schema, 'quantity'))
            self.assertIsNone(stock_quantity_from_data(schema, {'quantity': 50}))
        schema = validate_field_schema([{'key': 'material_code', 'label': 'Ad', 'type': 'text',
                                        'role': 'display_name', 'is_unique_key': False}])
        self.assertIsNone(schema_role_key(schema, 'identifier'))
        self.assertEqual(schema_role_key(schema, 'display_name'), 'material_code')

    def test_unmarked_legacy_code_does_not_create_an_implicit_unique_identity(self):
        for key in ['material_code', 'asset_code', 'serial_number']:
            self.assertIsNone(schema_role_key([{'key': key, 'label': key, 'type': 'text'}], 'identifier'))
        self.assertEqual(schema_role_key([{'key': 'serial_number', 'label': 'Seri', 'type': 'text',
                                          'is_unique_key': True}], 'identifier'), 'serial_number')

    def test_manual_writes_reject_duplicate_explicit_identifier_with_other_inventory_code(self):
        tenant = Tenant.objects.create(name='Invented identity yard')
        manager = User.objects.create(username='identity-manager', role='tenant_admin', tenant=tenant)
        asset_type = AssetType.objects.create(name='Invented identity type', schema=[
            {'key': 'local', 'label': 'Kod', 'type': 'text', 'role': 'identifier'},
        ])
        request = SimpleNamespace(user=manager)
        Asset.objects.create(tenant=tenant, asset_type=asset_type, inventory_code='ROW-A',
                             custom_data={'local': 'SAME-ID'})
        serializer = AssetSerializer(data={'asset_type': str(asset_type.pk), 'inventory_code': 'ROW-B',
                                          'custom_data': {'local': 'SAME-ID'}}, context={'request': request})
        self.assertFalse(serializer.is_valid())
        self.assertIn('local', serializer.errors['custom_data'])
        self.assertEqual(Asset.objects.count(), 1)

    def test_new_stock_fields_are_suggestions_without_required_defaults(self):
        self.assertTrue(all(field['required'] is False for field in default_stock_schema()))
        self.assertEqual(validate_custom_data(default_stock_schema(), {}, 'stock'), {})

    def test_roles_use_existing_fields_and_never_invent_quantity(self):
        schema = [{'key': 'available_count', 'label': 'Adet', 'type': 'number', 'role': 'quantity'}]
        self.assertEqual(schema_role_key(schema, 'quantity'), 'available_count')
        self.assertIsNone(schema_role_key([], 'quantity'))
        self.assertEqual(stock_quantity_from_data(schema, {'available_count': '50'}), 50)
        for data in [{}, {'available_count': None}, {'available_count': True}, {'available_count': -1}]:
            self.assertIsNone(stock_quantity_from_data(schema, data))
        self.assertEqual(stock_quantity_from_data(schema, {'available_count': 0}), 0)
        self.assertIsNone(stock_quantity_from_data(schema, {'quantity': 50}))

    def test_required_fields_preserve_zero_and_false(self):
        schema = [
            {'key': 'count', 'label': 'Adet', 'type': 'number', 'required': True},
            {'key': 'checked', 'label': 'Kontrol', 'type': 'checkbox', 'required': True},
            {'key': 'code', 'label': 'Kod', 'type': 'text', 'required': True},
        ]
        self.assertEqual(missing_required_fields(schema, {'count': 0, 'checked': False, 'code': '  '}),
                         [{'key': 'code', 'label': 'Kod'}])

    def test_schema_rejects_truthy_booleans_duplicate_roles_and_wrong_quantity_type(self):
        for key in ['required', 'is_unique_key']:
            with self.subTest(key=key), self.assertRaises(ValidationError):
                validate_field_schema([{'key': 'code', 'label': 'Kod', 'type': 'text', key: 'false'}])
        for schema in [
            [{'key': 'one', 'label': '1', 'type': 'number', 'role': 'quantity'},
             {'key': 'two', 'label': '2', 'type': 'number', 'role': 'quantity'}],
            [{'key': 'count', 'label': 'Adet', 'type': 'text', 'role': 'quantity'}],
            [{'key': 'one', 'label': '1', 'type': 'text', 'role': 'identifier'},
             {'key': 'two', 'label': '2', 'type': 'text', 'is_unique_key': True}],
        ]:
            with self.subTest(schema=schema), self.assertRaises(ValidationError):
                validate_field_schema(schema)

    def test_stock_fields_can_be_removed_renamed_and_optional(self):
        schema = validate_field_schema([{'key': 'count', 'label': 'Adet', 'type': 'number', 'role': 'quantity'}])
        self.assertEqual(validate_custom_data(schema, {}, 'stock'), {})
        self.assertEqual(validate_custom_data(schema, {'count': '50', 'old_note': 'Preserved'}, 'stock'),
                         {'count': 50, 'old_note': 'Preserved'})
        with self.assertRaises(ValidationError):
            validate_custom_data(schema, {'count': 1.5}, 'stock')


@override_settings(CROSS_TENANT_SHARING_ENABLED=True)
class SchemaEvolutionTests(TestCase):
    def setUp(self):
        self.owner = Tenant.objects.create(name='Invented schema yard')
        self.other = Tenant.objects.create(name='Other invented schema yard')
        self.manager = User.objects.create(username='schema-owner', tenant=self.owner, role='tenant_admin')
        self.employee = User.objects.create(username='schema-employee', tenant=self.owner, role='tenant_user')
        self.other_manager = User.objects.create(username='schema-other', tenant=self.other, role='tenant_admin')
        self.asset_type = AssetType.objects.create(name='Invented dynamic equipment', schema=[])
        self.asset = Asset.objects.create(tenant=self.owner, asset_type=self.asset_type,
                                          custom_data={'historic_field': 'Keep this'}, is_shared=True)

    def edit(self, schema):
        serializer = AssetTypeSerializer(self.asset_type, data={'schema': schema}, partial=True)
        serializer.is_valid(raise_exception=True)
        self.asset_type = serializer.save()
        return self.asset_type

    def test_catalog_code_is_stable_generated_only_for_new_blank_types(self):
        generated = self.asset_type.catalog_code
        self.assertTrue(generated.startswith('CAT-'))
        self.asset_type.name = 'Renamed invented equipment'
        self.asset_type.save()
        self.assertEqual(self.asset_type.catalog_code, generated)
        explicit = AssetType.objects.create(name='Explicit invented equipment', catalog_code='EXAMPLE-01')
        self.assertEqual(explicit.catalog_code, 'EXAMPLE-01')
        AssetType.objects.filter(pk=explicit.pk).update(catalog_code=None)
        explicit.refresh_from_db()
        explicit.save()
        self.assertIsNone(explicit.catalog_code)

    @patch('apps.notifications.services.dispatch_notification')
    def test_new_required_field_notifies_each_affected_owner_once_without_rewriting_assets(self, dispatch):
        Asset.objects.create(tenant=self.owner, asset_type=self.asset_type, custom_data={})
        Asset.objects.create(tenant=self.other, asset_type=self.asset_type, custom_data={'inspection': '2026-10-14'})
        schema = [{'key': 'inspection', 'label': 'Kontrol tarihi', 'type': 'date', 'required': True}]
        with self.captureOnCommitCallbacks(execute=True):
            self.edit(schema)
        self.assertEqual(self.asset_type.schema_revision, 2)
        notifications = Notification.objects.filter(content__event_type='asset_schema_updated')
        self.assertEqual(notifications.count(), 1)
        self.assertEqual(notifications.get().user_id, self.manager.pk)
        self.assertEqual(notifications.get().tenant_id, self.owner.pk)
        self.assertEqual(notifications.get().content['affected_asset_count'], 2)
        self.edit(schema)
        self.assertEqual(self.asset_type.schema_revision, 2)
        self.assertEqual(notifications.count(), 1)
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.custom_data, {'historic_field': 'Keep this'})
        self.assertTrue(self.asset.is_shared)
        self.assertTrue(self.asset.needs_update)
        self.assertFalse(self.asset.is_listed_for_sharing)
        self.assertEqual(AssetSerializer(self.asset).data['missing_required_fields'],
                         [{'key': 'inspection', 'label': 'Kontrol tarihi'}])

    def test_optional_field_revision_does_not_raise_update_notifications(self):
        self.edit([{'key': 'note', 'label': 'Not', 'type': 'text', 'required': False}])
        self.assertEqual(self.asset_type.schema_revision, 2)
        self.assertFalse(Notification.objects.filter(content__event_type='asset_schema_updated').exists())
        self.assertFalse(self.asset.needs_update)

    def test_missing_required_fields_block_publication_until_completed(self):
        self.edit([{'key': 'inspection', 'label': 'Kontrol tarihi', 'type': 'date', 'required': True}])
        self.asset.refresh_from_db()
        serializer = AssetSharingSerializer(self.asset, data={'is_shared': True}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn('is_shared', serializer.errors)
        serializer = AssetSerializer(self.asset, data={'custom_data': {'inspection': '2026-10-14'}}, partial=True,
                                     context={'request': SimpleNamespace(user=self.manager)})
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        self.assertFalse(updated.needs_update)
        self.assertEqual(updated.custom_data['historic_field'], 'Keep this')

    def test_inventory_identity_is_unique_only_inside_shipyard_and_type(self):
        self.asset.inventory_code = 'EXAMPLE-01'
        self.asset.save()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Asset.objects.create(tenant=self.owner, asset_type=self.asset_type, inventory_code='EXAMPLE-01')
        Asset.objects.create(tenant=self.other, asset_type=self.asset_type, inventory_code='EXAMPLE-01')
        Asset.objects.create(tenant=self.owner, asset_type=self.asset_type, inventory_code='')
        Asset.objects.create(tenant=self.owner, asset_type=self.asset_type, inventory_code='')

    def test_custom_quantity_role_controls_offer_validation(self):
        stock_type = AssetType.objects.create(name='Invented alternate stock', tracking_mode='stock', schema=[
            {'key': 'available_count', 'label': 'Adet', 'type': 'number', 'role': 'quantity'},
        ])
        stock = Asset.objects.create(tenant=self.owner, asset_type=stock_type,
                                     custom_data={'available_count': 50}, sharing_quantity=30)
        self.assertTrue(stock.sharing_quantity_is_valid)
        stock.custom_data = {'quantity': 100}
        self.assertFalse(stock.sharing_quantity_is_valid)


@override_settings(CROSS_TENANT_SHARING_ENABLED=True)
class SchemaEvolutionApiTests(APITestCase):
    def setUp(self):
        self.owner = Tenant.objects.create(name='Invented field API yard')
        self.other = Tenant.objects.create(name='Other invented field API yard')
        self.manager = User.objects.create(username='schema-api-owner', tenant=self.owner, role='tenant_admin')
        self.admin = User.objects.create(username='schema-api-platform', is_superuser=True, role='platform_admin')
        self.schema = [
            {'key': 'code', 'label': 'Kod', 'type': 'text', 'required': True},
            {'key': 'count', 'label': 'Adet', 'type': 'number', 'required': True},
            {'key': 'checked', 'label': 'Kontrol', 'type': 'checkbox', 'required': True},
        ]
        self.asset_type = AssetType.objects.create(name='Invented API type', schema=self.schema)
        self.complete = Asset.objects.create(tenant=self.owner, asset_type=self.asset_type,
                                             custom_data={'code': 'EXAMPLE', 'count': 0, 'checked': False}, is_shared=True)
        self.missing = []
        for value in [None, '', ' \t\n']:
            self.missing.append(Asset.objects.create(
                tenant=self.owner, asset_type=self.asset_type,
                custom_data={'code': value, 'count': 0, 'checked': False}, is_shared=True,
            ))
        self.missing.append(Asset.objects.create(tenant=self.owner, asset_type=self.asset_type,
                                                 custom_data={'count': 0, 'checked': False}, is_shared=True))
        self.foreign = Asset.objects.create(tenant=self.other, asset_type=self.asset_type, custom_data={})

    def test_update_filter_preserves_zero_false_and_private_shipyard_scope(self):
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/assets/items/', {'needs_update': 'true', 'asset_type': str(self.asset_type.pk)})
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data.get('results', []) if isinstance(response.data, dict) else response.data
        self.assertEqual({row['id'] for row in rows}, {str(asset.pk) for asset in self.missing})
        self.assertTrue(all(row['needs_update'] for row in rows))
        self.assertNotIn(str(self.foreign.pk), {row['id'] for row in rows})

    def test_shared_query_hides_missing_required_records_without_rewriting_consent(self):
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/assets/items/shared/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.complete.pk))
        self.assertTrue(Asset.objects.filter(pk__in=[asset.pk for asset in self.missing], is_shared=True).exists())

    def test_schema_impact_is_platform_only_and_contains_counts_without_private_values(self):
        url = f'/api/assets/types/{self.asset_type.pk}/schema_impact/'
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(url, {'schema': self.schema}, format='json').status_code, 403)
        self.client.force_authenticate(self.admin)
        response = self.client.post(url, {'schema': self.schema}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['asset_count'], 6)
        self.assertEqual(response.data['affected_asset_count'], 5)
        self.assertEqual(response.data['affected_tenant_count'], 2)
        self.assertEqual({tenant['asset_count'] for tenant in response.data['tenants']}, {1, 4})
        self.assertNotIn('EXAMPLE', str(response.data))
        self.assertEqual(self.client.post(url, {'schema': [{'key': 'bad'}]}, format='json').status_code, 400)
