"""Quantity stock is explicit, validated, and separate from individual equipment."""

import json
from io import BytesIO
from types import SimpleNamespace

import openpyxl
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from rest_framework.exceptions import NotFound, ValidationError

from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Asset, AssetType
from .serializers import AssetSerializer, AssetTypeSerializer
from .validation import MAX_STOCK_QUANTITY, default_stock_schema


def workbook_file(rows):
    workbook = openpyxl.Workbook()
    for row in rows:
        workbook.active.append(row)
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    return SimpleUploadedFile('stock.xlsx', stream.getvalue())


class StockTrackingTests(APITestCase):
    def setUp(self):
        self.owner = Tenant.objects.create(name='Stock sample yard')
        self.other = Tenant.objects.create(name='Other stock yard')
        self.manager = User.objects.create(username='stock-manager', role='tenant_admin', tenant=self.owner)
        self.admin = User.objects.create(username='stock-platform', role='platform_admin')
        self.stock_type = AssetType.objects.create(
            name='Scaffold stock', tracking_mode=AssetType.TrackingMode.STOCK,
            schema=default_stock_schema(),
        )
        self.client.force_authenticate(self.manager)

    def payload(self, quantity=50, **overrides):
        return {
            'asset_type': str(self.stock_type.pk),
            'custom_data': {'material_code': 'MAT-50', 'material_name': 'Scaffold clamp', 'quantity': quantity},
            **overrides,
        }

    def import_stock(self, rows, template=False, mapping=None):
        return self.client.post(f'/api/assets/items/{"bulk_import" if template else "raw_import"}/', {
            'asset_type': str(self.stock_type.pk), 'header_row': 1,
            'mapping': json.dumps(mapping or {
                'Seri Numarası': 'material_code', 'Adet': 'quantity', 'İsim': 'material_name',
            }),
            'file': workbook_file(rows),
        }, format='multipart')

    def test_existing_individual_type_and_custom_numbers_keep_their_semantics(self):
        individual = AssetType.objects.create(name='Forklift capacity', schema=[
            {'key': 'quantity', 'label': 'Measurement', 'type': 'number'},
        ])
        self.assertEqual(individual.tracking_mode, AssetType.TrackingMode.INDIVIDUAL)
        response = self.client.post('/api/assets/items/', {
            'asset_type': str(individual.pk), 'custom_data': {'quantity': -1.5},
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['custom_data']['quantity'], -1.5)
        self.assertEqual(self.client.get(f'/api/assets/types/{individual.pk}/').data['tracking_mode'], 'individual')

    def test_stock_creation_without_schema_uses_canonical_required_fields(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/assets/types/', {
            'name': 'Default material stock', 'tracking_mode': 'stock',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['schema'], default_stock_schema())
        self.assertEqual(response.data['tracking_mode'], 'stock')

    def test_stock_schema_cannot_remove_or_reinterpret_canonical_fields(self):
        self.client.force_authenticate(self.admin)
        for mutation in ['missing', 'wrong_type', 'optional', 'not_unique']:
            with self.subTest(mutation=mutation):
                schema = default_stock_schema()
                if mutation == 'missing':
                    schema.pop()
                elif mutation == 'wrong_type':
                    schema[2]['type'] = 'text'
                elif mutation == 'optional':
                    schema[1]['required'] = False
                else:
                    schema[0]['is_unique_key'] = False
                response = self.client.patch(f'/api/assets/types/{self.stock_type.pk}/', {
                    'schema': schema,
                }, format='json')
                self.assertEqual(response.status_code, 400, response.data)
        self.stock_type.refresh_from_db()
        self.assertEqual(self.stock_type.schema, default_stock_schema())

    def test_tracking_mode_changes_are_blocked_when_records_exist(self):
        self.client.force_authenticate(self.admin)
        individual = AssetType.objects.create(name='Tracked forklift')
        for asset_type, requested_mode in [(individual, 'stock'), (self.stock_type, 'individual')]:
            with self.subTest(requested_mode=requested_mode):
                Asset.objects.create(tenant=self.owner, asset_type=asset_type, custom_data={})
                response = self.client.patch(f'/api/assets/types/{asset_type.pk}/', {
                    'tracking_mode': requested_mode,
                }, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                asset_type.refresh_from_db()
                self.assertNotEqual(asset_type.tracking_mode, requested_mode)
        empty = AssetType.objects.create(name='Empty material type')
        response = self.client.patch(f'/api/assets/types/{empty.pk}/', {'tracking_mode': 'stock'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['schema'], default_stock_schema())

    def test_stale_create_revalidates_tracking_mode_immediately_before_write(self):
        empty_type = AssetType.objects.create(name='Empty type during create', schema=[])
        serializer = AssetSerializer(data={
            'asset_type': str(empty_type.pk), 'custom_data': {},
        }, context={'request': SimpleNamespace(user=self.manager)})
        serializer.is_valid(raise_exception=True)
        change_mode = AssetTypeSerializer(empty_type, data={'tracking_mode': 'stock'}, partial=True)
        change_mode.is_valid(raise_exception=True)
        change_mode.save()

        with self.assertRaises(ValidationError) as error:
            serializer.save()
        self.assertIn('custom_data', error.exception.detail)
        self.assertEqual(Asset.objects.filter(asset_type=empty_type).count(), 0)

    def test_stale_update_revalidates_target_type_and_preserves_existing_record(self):
        original_type = AssetType.objects.create(name='Original individual type', schema=[])
        empty_target = AssetType.objects.create(name='Empty type during update', schema=[])
        asset = Asset.objects.create(tenant=self.owner, asset_type=original_type,
                                     custom_data={'note': 'Keep original data'}, is_shared=True,
                                     sharing_note='Keep owner consent')
        serializer = AssetSerializer(asset, data={
            'asset_type': str(empty_target.pk), 'custom_data': {},
        }, partial=True, context={'request': SimpleNamespace(user=self.manager)})
        serializer.is_valid(raise_exception=True)
        change_mode = AssetTypeSerializer(empty_target, data={'tracking_mode': 'stock'}, partial=True)
        change_mode.is_valid(raise_exception=True)
        change_mode.save()

        with self.assertRaises(ValidationError) as error:
            serializer.save()
        self.assertIn('custom_data', error.exception.detail)
        asset.refresh_from_db()
        self.assertEqual(asset.asset_type_id, original_type.pk)
        self.assertEqual(asset.custom_data, {'note': 'Keep original data'})
        self.assertTrue(asset.is_shared)
        self.assertEqual(asset.sharing_note, 'Keep owner consent')

    def test_stale_create_uses_new_stock_schema_to_normalize_valid_stock_data(self):
        empty_type = AssetType.objects.create(name='Empty type with valid future stock data', schema=[])
        serializer = AssetSerializer(data={
            'asset_type': str(empty_type.pk),
            'custom_data': {'material_code': ' CODE-1 ', 'material_name': ' Material ', 'quantity': '50'},
        }, context={'request': SimpleNamespace(user=self.manager)})
        serializer.is_valid(raise_exception=True)
        change_mode = AssetTypeSerializer(empty_type, data={'tracking_mode': 'stock'}, partial=True)
        change_mode.is_valid(raise_exception=True)
        change_mode.save()
        asset = serializer.save()
        self.assertEqual(asset.asset_type.tracking_mode, 'stock')
        self.assertEqual(asset.custom_data, {'material_code': 'CODE-1', 'material_name': 'Material', 'quantity': 50})
        self.assertFalse(asset.is_shared)

    def test_deleted_target_type_returns_not_found_on_stale_create_or_update(self):
        original_type = AssetType.objects.create(name='Original type for deleted target', schema=[])
        asset = Asset.objects.create(tenant=self.owner, asset_type=original_type, custom_data={})
        for updating in [False, True]:
            with self.subTest(updating=updating):
                target = AssetType.objects.create(name=f'Deleted target {updating}', schema=[])
                serializer = AssetSerializer(asset if updating else None, data={
                    'asset_type': str(target.pk), 'custom_data': {},
                }, partial=updating, context={'request': SimpleNamespace(user=self.manager)})
                serializer.is_valid(raise_exception=True)
                target.delete()
                with self.assertRaises(NotFound):
                    serializer.save()
        asset.refresh_from_db()
        self.assertEqual(asset.asset_type_id, original_type.pk)
        self.assertEqual(Asset.objects.count(), 1)

    def test_stock_quantity_is_nonnegative_integral_and_safe(self):
        for invalid in [-1, 1.5, True, None, '', 'NaN', 'Infinity', str(MAX_STOCK_QUANTITY + 1),
                        '1.00000000000000000001', 10 ** 400]:
            with self.subTest(invalid=invalid):
                response = self.client.post('/api/assets/items/', self.payload(invalid), format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn('quantity', response.data['custom_data'])
        self.assertEqual(Asset.objects.count(), 0)
        for valid in [0, 50, '500', str(MAX_STOCK_QUANTITY)]:
            with self.subTest(valid=valid):
                response = self.client.post('/api/assets/items/', self.payload(valid), format='json')
                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual(response.data['custom_data']['quantity'], int(valid))
                self.assertIsInstance(response.data['custom_data']['quantity'], int)
                self.assertFalse(response.data['is_shared'])

    def test_blank_material_identity_rejected_and_surrounding_space_normalized(self):
        for key in ['material_code', 'material_name']:
            with self.subTest(key=key):
                data = self.payload()
                data['custom_data'][key] = '   '
                response = self.client.post('/api/assets/items/', data, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn(key, response.data['custom_data'])
        data = self.payload()
        data['custom_data'].update(material_code=' MAT-50 ', material_name=' Scaffold clamp ')
        response = self.client.post('/api/assets/items/', data, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['custom_data']['material_code'], 'MAT-50')
        self.assertEqual(response.data['custom_data']['material_name'], 'Scaffold clamp')

    def test_synthetic_export_import_replaces_quantities_and_keeps_zero_and_metadata(self):
        # These invented stock lines preserve the export format without using a user's data.
        materials = [
            ('ORNEK-STOK-01', 'Örnek yürüme platformu', 500),
            ('ORNEK-STOK-02', 'Örnek güvenlik bariyeri', 250),
            ('ORNEK-STOK-03', 'Örnek sıfır stoklu malzeme', 0),
        ]
        self.stock_type.schema += [
            {'key': 'source_record_id', 'label': 'Source ID', 'type': 'text'},
            {'key': 'source_created_at', 'label': 'Source date', 'type': 'text'},
        ]
        self.stock_type.save()
        rows = [['ID', 'Tersane', 'Oluşturulma Tarihi', 'Seri Numarası', 'Adet', 'İsim']]
        rows += [[f'example-source-{number:02}', 'Örnek tersane', '2025-01-01 10:00',
                  code, quantity, name]
                 for number, (code, name, quantity) in enumerate(materials, start=1)]
        mapping = {
            'ID': 'source_record_id', 'Oluşturulma Tarihi': 'source_created_at',
            'Seri Numarası': 'material_code', 'Adet': 'quantity', 'İsim': 'material_name',
        }
        foreign = Asset.objects.create(tenant=self.other, asset_type=self.stock_type,
                                      custom_data={'material_code': 'ORNEK-STOK-01', 'material_name': 'Other stock', 'quantity': 5})
        for attempt in range(2):
            if attempt:
                changed = Asset.objects.get(tenant=self.owner, custom_data__material_code='ORNEK-STOK-01')
                changed.custom_data['quantity'] = 25
                changed.save()
            response = self.import_stock(rows, mapping=mapping)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['error_count'], 0)
            self.assertEqual(response.data['created_count'], 3 if attempt == 0 else 0)
            self.assertEqual(response.data['updated_count'], 0 if attempt == 0 else 3)
        owned = Asset.objects.filter(tenant=self.owner, asset_type=self.stock_type)
        self.assertEqual(owned.count(), 3)
        self.assertEqual(sum(asset.custom_data['quantity'] for asset in owned), 750)
        self.assertEqual(owned.get(custom_data__material_code='ORNEK-STOK-02').custom_data['quantity'], 250)
        self.assertEqual(owned.get(custom_data__material_code='ORNEK-STOK-03').custom_data['quantity'], 0)
        sample = owned.get(custom_data__material_code='ORNEK-STOK-01')
        self.assertEqual(sample.custom_data['quantity'], 500)
        self.assertEqual(sample.custom_data['source_record_id'], 'example-source-01')
        self.assertEqual(sample.custom_data['source_created_at'], '2025-01-01 10:00')
        self.assertNotEqual(sample.created_at.strftime('%Y-%m-%d %H:%M'), sample.custom_data['source_created_at'])
        self.assertFalse(owned.filter(is_shared=True).exists())
        self.assertTrue(all(asset.created_by_id == self.manager.pk for asset in owned))
        foreign.refresh_from_db()
        self.assertEqual(foreign.custom_data['quantity'], 5)

    def test_raw_and_template_import_reject_invalid_counts_preserving_zero(self):
        for template in [False, True]:
            with self.subTest(template=template):
                if template:
                    rows = [['Malzeme kodu', 'Malzeme adı', 'Stok adedi'], ['Info'], ['Example']]
                    rows += [[f'T-{index}', 'Scaffold clamp', value] for index, value in enumerate(
                        [-1, 0.5, '1.00000000000000000001', str(MAX_STOCK_QUANTITY + 1), True, 0],
                    )]
                else:
                    rows = [['Seri Numarası', 'İsim', 'Adet']]
                    rows += [[f'R-{index}', 'Scaffold clamp', value] for index, value in enumerate(
                        [-1, 0.5, '1.00000000000000000001', str(MAX_STOCK_QUANTITY + 1), True, 0],
                    )]
                response = self.import_stock(rows, template=template)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['created_count'], 1, response.data)
                self.assertEqual(response.data['error_count'], 5, response.data)
        self.assertEqual(Asset.objects.count(), 2)
        self.assertEqual({asset.custom_data['quantity'] for asset in Asset.objects.all()}, {0})

    def test_stock_public_projection_does_not_disclose_private_quantity_or_code(self):
        response = self.client.post('/api/assets/items/', self.payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        response = self.client.patch(f"/api/assets/items/{response.data['id']}/sharing/", {
            'is_shared': True, 'sharing_note': 'Contact owner for availability.',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        other_user = User.objects.create(username='other-stock-manager', role='tenant_admin', tenant=self.other)
        self.client.force_authenticate(other_user)
        response = self.client.get('/api/assets/items/shared/')
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results']
        self.assertEqual(len(rows), 1)
        self.assertEqual(set(rows[0]), {'id', 'tenant', 'tenant_name', 'asset_type_name', 'category_code',
                                       'catalog_code', 'sharing_note', 'shared_at'})
        self.assertNotIn('custom_data', rows[0])
        self.assertNotIn('MAT-50', json.dumps(rows))
