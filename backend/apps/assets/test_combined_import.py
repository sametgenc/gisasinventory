"""Invented files exercise atomic, tenant-scoped multi-sheet import."""

import json
from datetime import timedelta
from io import BytesIO
from unittest.mock import patch

import openpyxl
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase, APIRequestFactory, force_authenticate

from apps.tenants.models import Tenant
from apps.user.models import User
from apps.notifications.models import Notification
from .combined_views import WorkbookCommitView, WorkbookPreviewView, WorkbookTemplateView
from .models import Asset, AssetType
from .usage_models import SharedUsageRequest


WORKBOOK_FIXTURES = {}


def workbook_file(sheets):
    fixture_key = json.dumps(sheets, default=str)
    if fixture_key in WORKBOOK_FIXTURES:
        return SimpleUploadedFile('fictional-combined.xlsx', WORKBOOK_FIXTURES[fixture_key])
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    for title, rows in sheets:
        sheet = workbook.create_sheet(title)
        for row in rows:
            sheet.append(row)
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    # Reuse the actual file inspected in preview. Rebuilding XLSX later changes
    # workbook/ZIP timestamps and correctly fails the production file-hash check.
    WORKBOOK_FIXTURES[fixture_key] = stream.getvalue()
    return SimpleUploadedFile('fictional-combined.xlsx', stream.getvalue())


class CombinedWorkbookTests(APITestCase):
    def test_numeric_legacy_identity_reimports_match_semantically_and_stay_shipyard_scoped(self):
        asset_type = AssetType.objects.create(name='Invented numeric workbook type', catalog_code='NUMERIC-EXAMPLE',
                                               schema=[{'key': 'code', 'label': 'Sayısal kod', 'type': 'number',
                                                        'role': 'identifier'}])
        existing = Asset.objects.create(tenant=self.yard, asset_type=asset_type, custom_data={'code': '1.00'})
        foreign = Asset.objects.create(tenant=self.other, asset_type=asset_type, custom_data={'code': 1})
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Sayısal kod'],
                                ['NUMERIC-EXAMPLE', 'ROW-ONE', '1.0']])]
        preview = self.preview(sheets, tenant=self.yard)
        self.assertTrue(preview.data['can_commit'], preview.data)
        self.assertEqual(preview.data['summary']['assets_updated'], 1)
        response = self.commit(sheets, preview, tenant=self.yard)
        self.assertEqual(response.status_code, 200, response.data)
        existing.refresh_from_db()
        foreign.refresh_from_db()
        self.assertEqual(existing.inventory_code, 'ROW-ONE')
        self.assertEqual(existing.custom_data['code'], '1')
        self.assertEqual(foreign.custom_data['code'], 1)
        self.assertEqual(Asset.objects.count(), 2)

    def test_numeric_duplicate_rows_and_ambiguous_legacy_ids_require_manual_review(self):
        asset_type = AssetType.objects.create(name='Invented duplicate numeric workbook', catalog_code='DUP-NUMERIC',
                                               schema=[{'key': 'code', 'label': 'Sayısal kod', 'type': 'number',
                                                        'role': 'identifier'}])
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Sayısal kod'],
                                ['DUP-NUMERIC', 'ROW-A', 1], ['DUP-NUMERIC', 'ROW-B', '1.00']])]
        preview = self.preview(sheets, tenant=self.yard)
        self.assertFalse(preview.data['can_commit'])
        self.assertEqual(len(preview.data['errors']), 2)
        Asset.objects.create(tenant=self.yard, asset_type=asset_type, custom_data={'code': '1.00'})
        Asset.objects.create(tenant=self.yard, asset_type=asset_type, custom_data={'code': 1})
        preview = self.preview([('Envanter', [sheets[0][1][0], sheets[0][1][1]])], tenant=self.yard)
        self.assertFalse(preview.data['can_commit'])
        self.assertIn('birden fazla mevcut', str(preview.data['errors']))

    def test_preview_candidate_queries_do_not_grow_per_existing_inventory_row(self):
        asset_type = self.stock_type()
        Asset.objects.bulk_create([
            Asset(tenant=self.yard, asset_type=asset_type, inventory_code=f'ROW-{number}',
                  custom_data={'code': f'ITEM-{number}', 'count': 1}) for number in range(2000)
        ])
        counts = []
        for size in (100, 2000):
            sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Adet']] + [
                ['INV-STOCK', f'ROW-{number}', 2] for number in range(size)
            ])]
            with CaptureQueriesContext(connection) as queries:
                preview = self.preview(sheets, tenant=self.yard)
            self.assertTrue(preview.data['can_commit'], preview.data)
            self.assertEqual(preview.data['summary']['assets_updated'], size)
            counts.append(len(queries))
        self.assertLessEqual(counts[1], counts[0] + 2)
        self.assertLess(counts[1], 20)

    def test_type_preview_exposes_metadata_removal_without_private_inventory(self):
        asset_type = AssetType.objects.create(name='Invented old catalog metadata', catalog_code='META-EXAMPLE',
                                               exclusion_reason='Invented inspection limit',
                                               description='Invented source note')
        sheets = [('Ekipman türleri', [['Katalog kodu', 'Ekipman türü', 'Açıklama', 'Kapsam dışı nedeni'],
                                       ['META-EXAMPLE', asset_type.name, None, None]])]
        preview = self.preview(sheets)
        self.assertTrue(preview.data['can_commit'], preview.data)
        row = next(row for row in preview.data['rows'] if row['kind'] == 'type')
        self.assertEqual(row['changes']['description'], {'before': 'Invented source note', 'after': ''})
        self.assertEqual(row['changes']['exclusion_reason'], {'before': 'Invented inspection limit', 'after': ''})
        self.assertNotIn('schema', row['changes'])
        asset_type.refresh_from_db()
        self.assertEqual(asset_type.exclusion_reason, 'Invented inspection limit')

    def setUp(self):
        self.yard = Tenant.objects.create(name='Invented workbook yard')
        self.other = Tenant.objects.create(name='Another invented workbook yard')
        self.admin = User.objects.create(username='workbook-global', is_superuser=True, role='platform_admin')
        self.manager = User.objects.create(username='workbook-owner', tenant=self.yard, role='tenant_admin')
        self.member = User.objects.create(username='workbook-member', tenant=self.yard, role='user')
        self.factory = APIRequestFactory()

    def call(self, view, sheets=None, *, user=None, tenant=None, **extra):
        data = dict(extra)
        if tenant is not None:
            data['tenant'] = str(tenant.pk)
        if 'decisions' in data and not isinstance(data['decisions'], str):
            data['decisions'] = json.dumps(data['decisions'])
        if sheets is None:
            request = self.factory.get('/workbook/template/', data)
        else:
            request = self.factory.post('/workbook/', {'file': workbook_file(sheets), **data}, format='multipart')
        force_authenticate(request, user=user or self.admin)
        return view.as_view()(request)

    def preview(self, sheets, **extra):
        return self.call(WorkbookPreviewView, sheets, **extra)

    def commit(self, sheets, preview, **extra):
        return self.call(WorkbookCommitView, sheets, preview_token=preview.data['preview_token'], **extra)

    def stock_type(self):
        return AssetType.objects.create(name='Invented stock', catalog_code='INV-STOCK', tracking_mode='stock', schema=[
            {'key': 'code', 'label': 'Malzeme kodu', 'type': 'text', 'role': 'identifier'},
            {'key': 'title', 'label': 'Malzeme adı', 'type': 'text', 'role': 'display_name'},
            {'key': 'count', 'label': 'Adet', 'type': 'number', 'role': 'quantity'},
        ])

    def combined(self):
        return [
            ('Ekipman türleri', [['Katalog kodu', 'Ekipman türü', 'Kategori kodu', 'Ön paylaşım sınıfı', 'Takip biçimi'],
                                ['EXAMPLE-001', 'Invented clamps', 'A', 'B', 'stock']]),
            ('Alanlar', [['Katalog kodu', 'Alan kodu', 'Alan adı', 'Alan türü', 'Zorunlu', 'Görevi'],
                        ['EXAMPLE-001', 'title', 'Malzeme adı', 'text', None, 'display_name'],
                        ['EXAMPLE-001', 'count', 'Adet', 'number', None, 'quantity']]),
            ('Envanter', [['Katalog kodu', 'Envanter kodu', 'Malzeme adı', 'Adet'],
                          ['EXAMPLE-001', 'YARD-001', 'Fictional clamp', 50]]),
        ]

    def test_creates_types_fields_and_inventory_atomically_without_publication(self):
        sheets = self.combined()
        preview = self.preview(sheets, tenant=self.yard)
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertTrue(preview.data['can_commit'], preview.data)
        self.assertEqual(preview.data['summary']['types_created'], 1)
        self.assertEqual(preview.data['summary']['assets_created'], 1)
        self.assertEqual(AssetType.objects.count(), 0)
        response = self.commit(sheets, preview, tenant=self.yard)
        self.assertEqual(response.status_code, 200, response.data)
        asset = Asset.objects.get()
        self.assertEqual(asset.tenant, self.yard)
        self.assertEqual(asset.inventory_code, 'YARD-001')
        self.assertEqual(asset.custom_data, {'title': 'Fictional clamp', 'count': 50})
        self.assertFalse(asset.is_shared)
        self.assertTrue(all(item['required'] is False for item in asset.asset_type.schema))

    def test_inventory_only_updates_own_rows_and_preserves_other_shipyard(self):
        stock = self.stock_type()
        own = Asset.objects.create(tenant=self.yard, asset_type=stock, inventory_code='LOCAL', custom_data={'count': 2})
        foreign = Asset.objects.create(tenant=self.other, asset_type=stock, inventory_code='LOCAL', custom_data={'count': 99})
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Adet'], ['INV-STOCK', 'LOCAL', 50]])]
        preview = self.preview(sheets, user=self.manager)
        self.assertTrue(preview.data['can_commit'], preview.data)
        response = self.commit(sheets, preview, user=self.manager)
        self.assertEqual(response.status_code, 200, response.data)
        own.refresh_from_db()
        foreign.refresh_from_db()
        self.assertEqual(own.custom_data['count'], 50)
        self.assertEqual(foreign.custom_data['count'], 99)
        self.assertEqual(Asset.objects.count(), 2)

    def test_foreign_owner_parameter_rejected_in_preview_and_commit(self):
        self.stock_type()
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu'], ['INV-STOCK', 'ONE']])]
        response = self.preview(sheets, user=self.manager, tenant=self.other)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Asset.objects.count(), 0)

    def test_member_and_forged_role_cannot_import(self):
        forged = User.objects.create(username='workbook-forged', role='platform_admin')
        for user in (self.member, forged):
            response = self.preview(self.combined(), user=user)
            self.assertEqual(response.status_code, 403)

    def test_shipyard_manager_cannot_create_global_type(self):
        response = self.preview(self.combined(), user=self.manager)
        self.assertFalse(response.data['can_commit'])
        self.assertIsNone(response.data['preview_token'])
        self.assertTrue(any('platform yöneticisi' in message for row in response.data['errors'] for message in row['errors']))
        self.assertEqual(AssetType.objects.count(), 0)

    def test_type_only_file_requires_no_target_and_creates_no_inventory(self):
        sheets = [('Katalog', [['Ekipman türü', 'Kategori kodu', 'Ön paylaşım sınıfı'], ['Invented crane', 'B', 'B']])]
        preview = self.preview(sheets)
        self.assertTrue(preview.data['can_commit'], preview.data)
        code = preview.data['types'][0]['catalog_code']
        self.assertTrue(code.startswith('CAT-'))
        response = self.commit(sheets, preview)
        self.assertEqual(response.status_code, 200, response.data)
        equipment = AssetType.objects.get()
        self.assertEqual(equipment.catalog_code, code)
        self.assertEqual(equipment.schema, [])
        self.assertEqual(Asset.objects.count(), 0)

    def test_identical_reimport_preserves_catalog_and_updates_same_inventory(self):
        sheets = self.combined()
        first = self.preview(sheets, tenant=self.yard)
        self.assertEqual(self.commit(sheets, first, tenant=self.yard).status_code, 200)
        original = AssetType.objects.get()
        revision = original.schema_revision
        second = self.preview(sheets, tenant=self.yard)
        self.assertTrue(second.data['can_commit'], second.data)
        self.assertEqual(second.data['summary']['types_created'], 0)
        self.assertEqual(second.data['summary']['types_updated'], 0)
        self.assertEqual(second.data['summary']['assets_updated'], 1)
        self.assertEqual(self.commit(sheets, second, tenant=self.yard).status_code, 200)
        original.refresh_from_db()
        self.assertEqual(original.schema_revision, revision)
        self.assertEqual(AssetType.objects.count(), 1)
        self.assertEqual(Asset.objects.count(), 1)

    def test_commit_failure_rolls_back_catalog_and_all_inventory(self):
        sheets = self.combined()
        first = self.preview(sheets, tenant=self.yard)
        self.assertTrue(first.data['can_commit'], first.data)
        with patch('apps.assets.combined_import.AssetSerializer.save', side_effect=ValidationError('Invented write conflict')):
            response = self.commit(sheets, first, tenant=self.yard)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(AssetType.objects.count(), 0)
        self.assertEqual(Asset.objects.count(), 0)

    def test_required_field_import_previews_impact_and_notifies_owner_once(self):
        stock = self.stock_type()
        for number in range(2):
            Asset.objects.create(tenant=self.yard, asset_type=stock, inventory_code=f'REQUIRED-{number}',
                                 custom_data={'count': 50})
        sheets = [('Alanlar', [['Katalog kodu', 'Alan kodu', 'Alan adı', 'Alan türü', 'Zorunlu'],
                              ['INV-STOCK', 'inspection', 'Kontrol tarihi', 'date', 'Evet']])]
        first = self.preview(sheets)
        self.assertTrue(first.data['can_commit'], first.data)
        self.assertEqual(first.data['types'][0]['impact']['affected_asset_count'], 2)
        self.assertEqual(self.commit(sheets, first).status_code, 200)
        notifications = Notification.objects.filter(user=self.manager, content__event_type='asset_schema_updated')
        self.assertEqual(notifications.count(), 1)
        self.assertEqual(notifications.get().content['affected_asset_count'], 2)
        second = self.preview(sheets)
        self.assertEqual(second.data['summary']['types_updated'], 0)
        self.assertEqual(self.commit(sheets, second).status_code, 200)
        self.assertEqual(notifications.count(), 1)

    def test_taxonomy_categories_are_not_catalog_codes_and_repeated_tabs_ignored(self):
        headers = ['Kod', 'Ana kategori', 'Ekipman', 'Kullanım amacı', 'Ölçü birimi', 'Mobilite',
                   'Kritiklik', 'Sertifikasyon / kontrol', 'Ön paylaşım sınıfı']
        rows = [headers, ['A', 'Invented access', 'Invented scaffold', 'Access', 'm', 'Mobile', 'High', 'Check', '**A**'],
                ['A', 'Invented access', 'Invented platform', 'Access', 'm', 'Mobile', 'High', 'Check', 'B']]
        sheets = [('1-TAKSONOMI', rows), ('A category repeated', rows)]
        preview = self.preview(sheets)
        self.assertTrue(preview.data['can_commit'], preview.data)
        self.assertEqual(preview.data['summary']['types_created'], 2)
        codes = [item['catalog_code'] for item in preview.data['types']]
        self.assertEqual(len(set(codes)), 2)
        self.assertNotIn('A', codes)
        response = self.commit(sheets, preview)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(AssetType.objects.count(), 2)
        self.assertEqual(Asset.objects.count(), 0)
        self.assertIn('Ölçü birimi: m', AssetType.objects.get(name='Invented scaffold').description)

    def test_ambiguous_source_class_requires_explicit_choice_bound_to_preview(self):
        sheets = [('1-TAKSONOMI', [['Kod', 'Ekipman', 'Ön paylaşım sınıfı'], ['C', 'Invented manipulator', 'B/C']])]
        preview = self.preview(sheets)
        self.assertFalse(preview.data['can_commit'])
        self.assertEqual(preview.data['action_required'][0]['code'], 'classification_required')
        self.assertIsNone(preview.data['preview_token'])
        decisions = {'classifications': {'1-TAKSONOMI:2': 'C'}}
        chosen = self.preview(sheets, decisions=decisions)
        self.assertTrue(chosen.data['can_commit'], chosen.data)
        wrong = self.commit(sheets, chosen, decisions={'classifications': {'1-TAKSONOMI:2': 'B'}})
        self.assertEqual(wrong.status_code, 400)
        response = self.commit(sheets, chosen, decisions=decisions)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(AssetType.objects.get().sharing_excluded)

    def test_generated_code_stable_after_source_reordering(self):
        headers = ['Ekipman türü']
        first = self.preview([('Katalog', [headers, ['Invented one'], ['Invented two']])])
        reordered = self.preview([('Katalog', [headers, ['Invented two'], ['Invented one']])])
        self.assertEqual({item['name']: item['catalog_code'] for item in first.data['types']},
                         {item['name']: item['catalog_code'] for item in reordered.data['types']})

    def test_formulas_and_unknown_columns_block_all_rows(self):
        sheets = self.combined()
        sheets[2][1].append(['EXAMPLE-001', 'BAD', 'Fictional', '=1+1'])
        preview = self.preview(sheets, tenant=self.yard)
        self.assertFalse(preview.data['can_commit'])
        self.assertIsNone(preview.data['preview_token'])
        self.assertEqual(Asset.objects.count(), 0)
        self.assertEqual(AssetType.objects.count(), 0)
        decisions = {'exclude_rows': {'Envanter': [3]}}
        reviewed = self.preview(sheets, tenant=self.yard, decisions=decisions)
        self.assertTrue(reviewed.data['can_commit'], reviewed.data)
        self.assertEqual(reviewed.data['summary']['skipped_rows_count'], 1)
        self.assertEqual(self.commit(sheets, reviewed, tenant=self.yard, decisions=decisions).status_code, 200)
        self.assertEqual(Asset.objects.count(), 1)

    def test_automatic_totals_skip_but_real_total_identifier_retained(self):
        stock = self.stock_type()
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Malzeme adı', 'Adet'],
                               ['INV-STOCK', 'TOTAL', 'Real item called total', 5],
                               ['TOPLAM', None, None, '=SUM(D2:D2)']])]
        preview = self.preview(sheets, tenant=self.yard)
        self.assertTrue(preview.data['can_commit'], preview.data)
        self.assertEqual(preview.data['summary']['assets_created'], 1)
        self.assertEqual(preview.data['summary']['skipped_rows_count'], 1)
        response = self.commit(sheets, preview, tenant=self.yard)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Asset.objects.get(asset_type=stock).inventory_code, 'TOTAL')

    def test_duplicate_identity_blocks_both_rows_and_never_sums(self):
        self.stock_type()
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Adet'],
                               ['INV-STOCK', 'SAME', 3], ['INV-STOCK', 'SAME', 7]])]
        preview = self.preview(sheets, tenant=self.yard)
        self.assertFalse(preview.data['can_commit'])
        self.assertEqual(len(preview.data['errors']), 2)
        self.assertEqual(Asset.objects.count(), 0)

    def test_different_inventory_codes_cannot_share_unique_dynamic_identifier(self):
        self.stock_type()
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Malzeme kodu', 'Adet'],
                               ['INV-STOCK', 'ROW-A', 'SAME-ID', 3],
                               ['INV-STOCK', 'ROW-B', 'SAME-ID', 7]])]
        preview = self.preview(sheets, tenant=self.yard)
        self.assertFalse(preview.data['can_commit'])
        self.assertIsNone(preview.data['preview_token'])
        self.assertEqual(len(preview.data['errors']), 2)
        self.assertEqual(Asset.objects.count(), 0)
        corrected = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Malzeme kodu', 'Adet'],
                                  ['INV-STOCK', 'ROW-A', 'UNIQUE-A', 3],
                                  ['INV-STOCK', 'ROW-B', 'UNIQUE-B', 7]])]
        first = self.preview(corrected, tenant=self.yard)
        self.assertTrue(first.data['can_commit'], first.data)
        self.assertEqual(self.commit(corrected, first, tenant=self.yard).status_code, 200)
        second = self.preview(corrected, tenant=self.yard)
        self.assertTrue(second.data['can_commit'], second.data)
        self.assertEqual(second.data['summary']['assets_updated'], 2)
        self.assertEqual(self.commit(corrected, second, tenant=self.yard).status_code, 200)
        self.assertEqual(Asset.objects.count(), 2)

    def test_no_identity_requires_manual_review(self):
        self.stock_type()
        sheets = [('Envanter', [['Katalog kodu', 'Adet'], ['INV-STOCK', 50]])]
        preview = self.preview(sheets, tenant=self.yard)
        self.assertFalse(preview.data['can_commit'])
        self.assertIsNone(preview.data['preview_token'])

    def test_legacy_identifier_upserts_and_adds_inventory_code(self):
        stock = self.stock_type()
        asset = Asset.objects.create(tenant=self.yard, asset_type=stock, custom_data={'code': 'LEGACY', 'count': 3})
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Malzeme kodu', 'Adet'],
                               ['INV-STOCK', 'NEW-FIXED', 'LEGACY', 9]])]
        preview = self.preview(sheets, tenant=self.yard)
        self.assertTrue(preview.data['can_commit'], preview.data)
        self.assertEqual(preview.data['summary']['assets_updated'], 1)
        response = self.commit(sheets, preview, tenant=self.yard)
        self.assertEqual(response.status_code, 200, response.data)
        asset.refresh_from_db()
        self.assertEqual(asset.inventory_code, 'NEW-FIXED')
        self.assertEqual(asset.custom_data['count'], 9)
        self.assertEqual(Asset.objects.count(), 1)

    def test_existing_required_values_preserved_on_partial_inventory_columns(self):
        stock = self.stock_type()
        stock.schema[0]['required'] = True
        stock.save()
        asset = Asset.objects.create(tenant=self.yard, asset_type=stock, inventory_code='PRESERVE',
                                     custom_data={'code': 'EXISTING', 'count': 3})
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Adet'], ['INV-STOCK', 'PRESERVE', 8]])]
        preview = self.preview(sheets, tenant=self.yard)
        self.assertTrue(preview.data['can_commit'], preview.data)
        self.assertEqual(self.commit(sheets, preview, tenant=self.yard).status_code, 200)
        asset.refresh_from_db()
        self.assertEqual(asset.custom_data, {'code': 'EXISTING', 'count': 8})

    def test_type_and_inventory_stale_previews_rejected_without_writes(self):
        stock = self.stock_type()
        asset = Asset.objects.create(tenant=self.yard, asset_type=stock, inventory_code='STALE', custom_data={'count': 2})
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Adet'], ['INV-STOCK', 'STALE', 8]])]
        first = self.preview(sheets, tenant=self.yard)
        Asset.objects.filter(pk=asset.pk).update(custom_data={'count': 4})
        response = self.commit(sheets, first, tenant=self.yard)
        self.assertEqual(response.status_code, 409, response.data)
        asset.refresh_from_db()
        self.assertEqual(asset.custom_data['count'], 4)
        second = self.preview(sheets, tenant=self.yard)
        stock.schema.append({'key': 'extra', 'label': 'Extra', 'type': 'text'})
        stock.save()
        response = self.commit(sheets, second, tenant=self.yard)
        self.assertEqual(response.status_code, 409, response.data)
        asset.refresh_from_db()
        self.assertEqual(asset.custom_data['count'], 4)

    def test_file_target_and_user_are_bound_to_preview(self):
        self.stock_type()
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu'], ['INV-STOCK', 'BOUND']])]
        preview = self.preview(sheets, tenant=self.yard)
        changed_file = [('Envanter', [['Katalog kodu', 'Envanter kodu'], ['INV-STOCK', 'DIFFERENT']])]
        for call_sheets, extra in [(changed_file, {'tenant': self.yard}), (sheets, {'tenant': self.other}),
                                   (sheets, {'user': self.manager})]:
            response = self.commit(call_sheets, preview, **extra)
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Asset.objects.count(), 0)

    def test_template_has_empty_import_pages_and_clear_guide(self):
        response = self.call(WorkbookTemplateView, user=self.manager)
        self.assertEqual(response.status_code, 200)
        workbook = openpyxl.load_workbook(BytesIO(response.content))
        try:
            self.assertEqual(workbook.sheetnames, ['Ekipman türleri', 'Alanlar', 'Envanter', 'Rehber'])
            for name in workbook.sheetnames[:3]:
                self.assertEqual(workbook[name].max_row, 1)
            self.assertTrue(any('ücretsizdir' in str(row[1].value) for row in workbook['Rehber']
                                if len(row) > 1))
        finally:
            workbook.close()

    def test_invalid_decisions_and_formula_header_rejected(self):
        for decisions in ('{bad', {'exclude_rows': {'Envanter': [True]}}, {'tracking_modes': {'X': 'paid'}}):
            response = self.preview(self.combined(), tenant=self.yard, decisions=decisions)
            self.assertEqual(response.status_code, 400, response.data)

    def test_hybrid_headers_and_duplicate_fields_require_review(self):
        sheets = self.combined()
        sheets[1][1].append(['EXAMPLE-001', 'count', 'Another count', 'number', None, 'quantity'])
        preview = self.preview(sheets, tenant=self.yard)
        self.assertFalse(preview.data['can_commit'])
        self.assertIsNone(preview.data['preview_token'])

    def test_approved_usage_capacity_cannot_be_reduced_by_import(self):
        stock = self.stock_type()
        asset = Asset.objects.create(tenant=self.yard, asset_type=stock, inventory_code='RESERVED',
                                     custom_data={'count': 50}, sharing_quantity=20)
        today = timezone.localdate()
        SharedUsageRequest.objects.create(asset=asset, owner_tenant=self.yard, requester_tenant=self.other,
            requested_by=self.manager, quantity=20, status='approved', start_date=today,
            end_date=today + timedelta(days=3))
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Adet'], ['INV-STOCK', 'RESERVED', 5]])]
        preview = self.preview(sheets, tenant=self.yard)
        self.assertFalse(preview.data['can_commit'])
        self.assertTrue(any('onaylanan' in message for row in preview.data['errors'] for message in row['errors']))
        asset.refresh_from_db()
        self.assertEqual(asset.custom_data['count'], 50)

    @override_settings(CROSS_TENANT_SHARING_ENABLED=True)
    def test_stock_reduction_pauses_public_offer(self):
        stock = self.stock_type()
        asset = Asset.objects.create(tenant=self.yard, asset_type=stock, inventory_code='OFFER',
                                     custom_data={'count': 50}, is_shared=True, sharing_quantity=40)
        sheets = [('Envanter', [['Katalog kodu', 'Envanter kodu', 'Adet'], ['INV-STOCK', 'OFFER', 20]])]
        preview = self.preview(sheets, tenant=self.yard)
        self.assertTrue(preview.data['can_commit'], preview.data)
        response = self.commit(sheets, preview, tenant=self.yard)
        self.assertEqual(response.status_code, 200, response.data)
        asset.refresh_from_db()
        self.assertFalse(asset.is_shared)
        self.assertEqual(response.data['summary']['sharing_paused_count'], 1)
