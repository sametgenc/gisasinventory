"""Quick entry preserves quantity, ownership and identity across one atomic batch."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from django.apps import apps
from django.db import connection, connections
from django.test import TransactionTestCase, skipUnlessDBFeature
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient, APITestCase

from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Asset, AssetBatchOperation, AssetType
from .serializers import AssetSerializer
from .validation import MAX_STOCK_QUANTITY, default_stock_schema


class BatchCreateTests(APITestCase):
    url = '/api/assets/items/batch_create/'

    def setUp(self):
        self.yard = Tenant.objects.create(name='Quick entry owner')
        self.other = Tenant.objects.create(name='Other quick entry owner')
        self.manager = User.objects.create(username='batch-manager', tenant=self.yard, role='tenant_admin')
        self.member = User.objects.create(username='batch-member', tenant=self.yard, role='tenant_user')
        self.admin = User.objects.create(username='batch-platform', role='platform_admin', is_superuser=True)
        self.crane = AssetType.objects.create(name='Quick entry crane', schema=[
            {'key': 'capacity', 'label': 'Capacity', 'type': 'number', 'required': False},
        ])
        self.stock = AssetType.objects.create(name='Quick entry stock', tracking_mode='stock', schema=default_stock_schema())
        self.client.force_authenticate(self.manager)

    def row(self, quantity=1, asset_type=None, **overrides):
        return {'asset_type': str((asset_type or self.crane).pk), 'quantity': quantity, 'custom_data': {}, **overrides}

    def post(self, rows, operation_id=None):
        return self.client.post(self.url, {'operation_id': str(operation_id or uuid.uuid4()), 'rows': rows}, format='json')

    def test_fifty_cranes_and_thirty_stock_units_need_no_optional_specification(self):
        operation_id = uuid.uuid4()
        response = self.post([self.row(50), self.row(30, self.stock)], operation_id)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data, {
            'operation_id': str(operation_id), 'created_count': 51, 'record_count': 51, 'unit_count': 80,
        })
        self.assertEqual(Asset.objects.filter(asset_type=self.crane, tenant=self.yard).count(), 50)
        stock = Asset.objects.get(asset_type=self.stock)
        self.assertEqual(stock.custom_data, {'quantity': 30})
        self.assertEqual(stock.inventory_code, f'BATCH-{operation_id.hex}-2-1')
        self.assertFalse(Asset.objects.filter(is_shared=True).exists())

    def test_active_member_can_use_same_manual_entry_rights(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.post([self.row(2)]).status_code, 201)
        self.assertTrue(all(asset.created_by_id == self.member.pk for asset in Asset.objects.all()))

    def test_foreign_tenant_rejected_without_partial_writes(self):
        response = self.post([self.row(2), self.row(1, tenant=self.other.pk)])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['rows'][0]['row'], 2)
        self.assertIn('tenant', response.data['rows'][0]['errors'])
        self.assertFalse(Asset.objects.exists())

    def test_platform_admin_must_choose_target_for_every_row(self):
        self.client.force_authenticate(self.admin)
        missing = self.post([self.row()])
        self.assertEqual(missing.status_code, 400, missing.data)
        self.assertIn('tenant', missing.data['rows'][0]['errors'])
        response = self.post([self.row(2, tenant=self.yard.pk), self.row(3, tenant=self.other.pk)])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Asset.objects.filter(tenant=self.yard).count(), 2)
        self.assertEqual(Asset.objects.filter(tenant=self.other).count(), 3)

    def test_disabled_yards_accounts_and_forged_admin_role_cannot_cross_tenants(self):
        forged = User.objects.create(username='batch-forged', role='platform_admin', tenant=self.yard)
        self.client.force_authenticate(forged)
        self.assertEqual(self.post([self.row(tenant=self.other.pk)]).status_code, 400)
        self.yard.is_active = False
        self.yard.save()
        self.client.force_authenticate(User.objects.select_related('tenant').get(pk=self.manager.pk))
        self.assertEqual(self.post([self.row()]).status_code, 403)
        self.manager.is_active = False
        self.manager.save()
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.post([self.row()]).status_code, 403)

    def test_required_fields_preserved_and_errors_identify_original_row(self):
        required = AssetType.objects.create(name='Required crane', schema=[
            {'key': 'capacity', 'label': 'Capacity', 'type': 'number', 'required': True},
        ])
        response = self.post([self.row(2), self.row(2, required)])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['rows'][0]['row'], 2)
        self.assertIn('capacity', response.data['rows'][0]['errors']['custom_data'])
        self.assertFalse(Asset.objects.exists())
        response = self.post([self.row(2, required, custom_data={'capacity': 0})])
        self.assertEqual(response.status_code, 201, response.data)

    def test_one_repeated_serial_number_is_rejected_instead_of_inventing_serials(self):
        serial_type = AssetType.objects.create(name='Serial crane', schema=[
            {'key': 'serial', 'label': 'Serial', 'type': 'text', 'role': 'identifier'},
        ])
        response = self.post([self.row(2, serial_type, custom_data={'serial': 'REAL-1'})])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('serial', response.data['rows'][0]['errors']['custom_data'])
        self.assertFalse(Asset.objects.exists())
        response = self.post([self.row(2, serial_type)])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(list(Asset.objects.values_list('custom_data', flat=True)), [{}, {}])

    def test_duplicate_identifiers_across_rows_are_rejected_and_other_tenant_identity_is_independent(self):
        serial_type = AssetType.objects.create(name='Numeric serial crane', schema=[
            {'key': 'serial', 'label': 'Serial', 'type': 'number', 'role': 'identifier'},
        ])
        response = self.post([
            self.row(1, serial_type, custom_data={'serial': 5}),
            self.row(1, serial_type, custom_data={'serial': '5.0'}),
        ])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual({row['row'] for row in response.data['rows']}, {1, 2})
        self.assertFalse(Asset.objects.exists())
        Asset.objects.create(tenant=self.other, asset_type=serial_type, custom_data={'serial': '5'})
        response = self.post([self.row(1, serial_type, custom_data={'serial': 5})])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Asset.objects.count(), 2)

    def test_existing_identifier_rejected_without_touching_existing_inventory(self):
        self.crane.schema = [{'key': 'serial', 'label': 'Serial', 'type': 'text', 'is_unique_key': True}]
        self.crane.save()
        asset = Asset.objects.create(tenant=self.yard, asset_type=self.crane, custom_data={'serial': 'A'})
        response = self.post([self.row(custom_data={'serial': 'A'})])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Asset.objects.count(), 1)
        asset.refresh_from_db()
        self.assertEqual(asset.custom_data, {'serial': 'A'})

    def test_identifier_scope_loaded_once_per_tenant_and_type_during_validation_and_save(self):
        self.crane.schema = [{'key': 'serial', 'label': 'Serial', 'type': 'number', 'role': 'identifier'}]
        self.crane.save()
        other_type = AssetType.objects.create(name='Other numeric serial type', schema=self.crane.schema)
        for tenant in (self.yard, self.other):
            for serial in range(10):
                Asset.objects.create(tenant=tenant, asset_type=self.crane, custom_data={'serial': str(serial)})
        self.client.force_authenticate(self.admin)
        with CaptureQueriesContext(connection) as captured:
            response = self.post([
                self.row(custom_data={'serial': 20}, tenant=self.yard.pk),
                self.row(custom_data={'serial': '21.0'}, tenant=self.yard.pk),
                self.row(custom_data={'serial': '20.0'}, tenant=self.other.pk),
                self.row(asset_type=other_type, custom_data={'serial': 20}, tenant=self.yard.pk),
            ])
        self.assertEqual(response.status_code, 201, response.data)
        scope_reads = [query['sql'] for query in captured.captured_queries
                       if 'FROM "assets_asset"' in query['sql'] and 'LIMIT' not in query['sql']
                       and query['sql'].startswith('SELECT')]
        self.assertEqual(len(scope_reads), 3, scope_reads)
        owner_serials = {data['serial'] for data in Asset.objects.filter(tenant=self.yard).values_list('custom_data', flat=True)}
        self.assertEqual(owner_serials, {str(serial) for serial in range(10)} | {'20', '21'})
        self.assertEqual(Asset.objects.get(tenant=self.other, custom_data__serial='20').custom_data['serial'], '20')

    def test_quantity_rejects_fraction_boolean_negative_zero_strings_and_unsafe_values(self):
        for value in [0, -1, 1.5, True, '2', None, MAX_STOCK_QUANTITY + 1]:
            with self.subTest(quantity=value):
                response = self.post([self.row(value)])
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn('quantity', response.data['rows'][0]['errors'])
        self.assertFalse(Asset.objects.exists())

    def test_expanded_and_input_row_limits_do_not_limit_stock_quantity(self):
        self.assertEqual(self.post([self.row(251), self.row(250)]).status_code, 400)
        self.assertEqual(self.post([self.row() for _ in range(501)]).status_code, 400)
        response = self.post([self.row(MAX_STOCK_QUANTITY, self.stock)])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Asset.objects.get().custom_data['quantity'], MAX_STOCK_QUANTITY)

    def test_per_unit_identifiers_can_expand_beyond_fifty_input_rows(self):
        self.crane.schema = [{'key': 'serial', 'label': 'Serial', 'type': 'text', 'role': 'identifier'}]
        self.crane.save()
        response = self.post([
            self.row(custom_data={'serial': f'REAL-{number}'}) for number in range(80)
        ])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['record_count'], 80)
        self.assertEqual(Asset.objects.count(), 80)
        self.assertEqual(len(set(Asset.objects.values_list('custom_data__serial', flat=True))), 80)

    def test_stock_quantity_role_is_used_and_conflicting_value_rejected(self):
        self.stock.schema = [{'key': 'pieces', 'label': 'Count', 'type': 'number', 'role': 'quantity'}]
        self.stock.save()
        response = self.post([self.row(30, self.stock, custom_data={'pieces': 31})])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Asset.objects.exists())
        response = self.post([self.row(30, self.stock, custom_data={'pieces': 30})])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Asset.objects.get().custom_data, {'pieces': 30})

    def test_stock_without_quantity_role_requires_catalog_fix(self):
        self.stock.schema = []
        self.stock.save()
        response = self.post([self.row(30, self.stock)])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('quantity', response.data['rows'][0]['errors'])
        self.assertFalse(Asset.objects.exists())

    def test_same_operation_cannot_create_duplicates_even_if_retry_changes_rows(self):
        operation_id = uuid.uuid4()
        self.assertEqual(self.post([self.row(2)], operation_id).status_code, 201)
        response = self.post([self.row(10, self.stock)], operation_id)
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['operation_id'], str(operation_id))
        self.assertEqual(Asset.objects.count(), 2)

    def test_retry_remains_blocked_after_editing_every_generated_inventory_code(self):
        operation_id = uuid.uuid4()
        self.assertEqual(self.post([self.row()], operation_id).status_code, 201)
        asset = Asset.objects.get()
        response = self.client.patch(f'/api/assets/items/{asset.pk}/', {'inventory_code': 'YARD-CRANE-1'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.post([self.row()], operation_id).status_code, 409)
        self.assertEqual(Asset.objects.count(), 1)
        self.assertEqual(AssetBatchOperation.objects.get().created_by, self.manager)

    def test_retry_cannot_recreate_deleted_batch_inventory(self):
        operation_id = uuid.uuid4()
        self.assertEqual(self.post([self.row()], operation_id).status_code, 201)
        asset = Asset.objects.get()
        self.assertEqual(self.client.delete(f'/api/assets/items/{asset.pk}/').status_code, 204)
        self.assertEqual(self.post([self.row()], operation_id).status_code, 409)
        self.assertFalse(Asset.objects.exists())
        self.assertEqual(AssetBatchOperation.objects.count(), 1)

    def test_validation_failure_releases_operation_for_corrected_retry(self):
        operation_id = uuid.uuid4()
        self.assertEqual(self.post([self.row(tenant=self.other.pk)], operation_id).status_code, 400)
        self.assertFalse(AssetBatchOperation.objects.exists())
        self.assertEqual(self.post([self.row()], operation_id).status_code, 201)

    def test_retry_remains_blocked_after_platform_admin_transfers_inventory(self):
        operation_id = uuid.uuid4()
        self.assertEqual(self.post([self.row()], operation_id).status_code, 201)
        asset = Asset.objects.get()
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f'/api/assets/items/{asset.pk}/', {'tenant': self.other.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.post([self.row()], operation_id).status_code, 409)
        self.assertEqual(Asset.objects.count(), 1)

    def test_retry_remains_blocked_after_creator_account_is_deleted(self):
        operation_id = uuid.uuid4()
        self.assertEqual(self.post([self.row()], operation_id).status_code, 201)
        self.manager.delete()
        self.assertIsNone(AssetBatchOperation.objects.get().created_by_id)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.post([self.row()], operation_id).status_code, 409)
        self.assertEqual(Asset.objects.count(), 1)

    def test_failed_save_rolls_back_every_preceding_record_and_operation_can_retry(self):
        operation_id = uuid.uuid4()
        original_create = AssetSerializer.create
        calls = 0

        def fail_second(serializer, validated_data):
            nonlocal calls
            calls += 1
            if calls == 2:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'custom_data': {'capacity': ['Changed while saving.']}})
            return original_create(serializer, validated_data)

        with patch.object(AssetSerializer, 'create', fail_second):
            response = self.post([self.row(2)], operation_id)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Asset.objects.exists())
        self.assertFalse(AssetBatchOperation.objects.exists())
        self.assertEqual(self.post([self.row(2)], operation_id).status_code, 201)

    def test_bad_type_shape_operation_and_empty_rows_are_validation_errors(self):
        for payload in [
            {'operation_id': 'invalid', 'rows': [self.row()]},
            {'operation_id': str(uuid.uuid4()), 'rows': []},
            {'operation_id': str(uuid.uuid4()), 'rows': ['invalid']},
            {'operation_id': str(uuid.uuid4()), 'rows': [self.row(custom_data=[])]},
            {'operation_id': str(uuid.uuid4()), 'rows': [{**self.row(), 'asset_type': str(uuid.uuid4())}]},
        ]:
            with self.subTest(payload=payload):
                response = self.client.post(self.url, payload, format='json')
                self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Asset.objects.exists())

    def test_anonymous_call_rejected(self):
        self.client.force_authenticate(None)
        self.assertIn(self.post([self.row()]).status_code, (401, 403))


class ConcurrentBatchCreateTests(TransactionTestCase):
    # Preserve append-only audit guards while TransactionTestCase flushes fixtures.
    available_apps = [app.name for app in apps.get_app_configs() if app.label != 'audit']

    @skipUnlessDBFeature('has_select_for_update')
    def test_same_operation_with_disjoint_types_has_one_winner(self):
        yard = Tenant.objects.create(name='Concurrent quick entry owner')
        users = [User.objects.create(username=f'concurrent-batch-{index}', tenant=yard) for index in range(2)]
        types = [AssetType.objects.create(name=f'Concurrent crane {index}', schema=[]) for index in range(2)]
        operation_id = uuid.uuid4()
        ready = Barrier(2)
        original_create = AssetBatchOperation.objects.create

        def claim(*args, **kwargs):
            ready.wait(timeout=10)
            return original_create(*args, **kwargs)

        def submit(index):
            connections['default'].close()
            try:
                if connection.vendor == 'postgresql':
                    with connection.cursor() as cursor:
                        cursor.execute("SET lock_timeout = '5s'")
                        cursor.execute("SET statement_timeout = '15s'")
                client = APIClient()
                client.force_authenticate(users[index])
                response = client.post(BatchCreateTests.url, {
                    'operation_id': str(operation_id),
                    'rows': [{'asset_type': str(types[index].pk), 'quantity': index + 1}],
                }, format='json')
                return response.status_code
            finally:
                connections['default'].close()

        with patch.object(AssetBatchOperation.objects, 'create', claim):
            with ThreadPoolExecutor(max_workers=2) as pool:
                statuses = list(pool.map(submit, range(2)))

        self.assertEqual(sorted(statuses), [201, 409])
        self.assertEqual(AssetBatchOperation.objects.count(), 1)
        self.assertEqual(Asset.objects.values('asset_type').distinct().count(), 1)
        self.assertIn(Asset.objects.count(), (1, 2))
