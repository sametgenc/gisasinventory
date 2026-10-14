"""Explicit offer details never disclose private stock or copy private contacts."""

import json
from types import SimpleNamespace
from unittest.mock import patch

from django.db import connection
from django.apps import apps
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.test import APITestCase

from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Asset, AssetType
from .serializers import AssetSerializer, AssetSharingSerializer, SHARING_DETAIL_FIELDS
from .test_sharing import import_file
from .validation import MAX_STOCK_QUANTITY, default_stock_schema


@override_settings(CROSS_TENANT_SHARING_ENABLED=True)
class SharingDetailTests(APITestCase):
    def setUp(self):
        self.owner = Tenant.objects.create(name='Offer sample yard', email='internal-yard@example.test')
        self.other = Tenant.objects.create(name='Other offer sample yard')
        self.manager = User.objects.create(username='offer-manager', role='tenant_admin', tenant=self.owner)
        self.member = User.objects.create(username='offer-reader', role='tenant_user', tenant=self.other)
        self.stock_type = AssetType.objects.create(name='Offer scaffold stock', tracking_mode='stock',
                                                  schema=default_stock_schema())
        self.individual_type = AssetType.objects.create(name='Offer forklift', schema=[])
        self.asset = Asset.objects.create(
            tenant=self.owner, asset_type=self.stock_type,
            custom_data={'material_code': 'PRIVATE-OFFER-01', 'material_name': 'Private material name',
                         'quantity': 50, 'contact_email': 'private-person@example.test',
                         'contact_phone': '+90 555 111 2222', 'internal_note': 'Private maintenance'},
        )
        self.client.force_authenticate(self.manager)

    def sharing(self, asset=None, **data):
        return self.client.patch(f'/api/assets/items/{(asset or self.asset).pk}/sharing/', data, format='json')

    def offer(self, **overrides):
        return self.sharing(**{
            'is_shared': True, 'sharing_title': 'Scaffold clamps for shared use', 'sharing_quantity': 20,
            'sharing_capacity': 'Fits standard scaffold tubes',
            'sharing_note': 'Agree collection and return with owner.\nInspect before use.',
            'sharing_availability': 'available', 'sharing_availability_note': 'Weekdays by arrangement',
            'sharing_contact_name': 'Sample equipment desk', 'sharing_contact_email': 'public-offer@example.test',
            'sharing_contact_phone': '+90 (555) 987-6543', **overrides,
        })

    def public_rows(self, **filters):
        self.client.force_authenticate(self.member)
        response = self.client.get('/api/assets/items/shared/', filters)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['results']

    def test_defaults_and_legacy_publication_never_copy_inventory_or_contacts(self):
        response = self.sharing(is_shared=True, sharing_note='Ask owner about availability.')
        self.assertEqual(response.status_code, 200, response.data)
        row = self.public_rows()[0]
        self.assertIsNone(row['sharing_quantity'])
        self.assertEqual(row['sharing_availability'], 'by_arrangement')
        self.assertEqual(row['tracking_mode'], 'stock')
        for field in SHARING_DETAIL_FIELDS:
            if field not in ('sharing_quantity', 'sharing_availability', 'sharing_note'):
                self.assertEqual(row[field], '')
        public = json.dumps(row)
        for secret in ['PRIVATE-OFFER-01', 'Private material name', 'private-person@example.test',
                       'internal-yard@example.test', 'Private maintenance', '+90 555 111 2222',
                       'custom_data', 'sharing_needs_review']:
            self.assertNotIn(secret, public)

    def test_public_offer_is_explicit_allowlist_and_keeps_private_stock_hidden(self):
        response = self.offer()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['sharing_needs_review'])
        row = self.public_rows()[0]
        self.assertEqual(set(row), {
            'id', 'tenant', 'tenant_name', 'asset_type_name', 'category_code', 'catalog_code',
            'tracking_mode', 'shared_at', *SHARING_DETAIL_FIELDS,
        })
        self.assertEqual(row['sharing_quantity'], 20)
        self.assertEqual(row['sharing_contact_email'], 'public-offer@example.test')
        self.assertNotIn('quantity', row)
        self.assertNotIn('custom_data', row)
        self.assertNotIn('PRIVATE-OFFER-01', json.dumps(row))

    def test_single_line_fields_reject_raw_control_characters_before_trim(self):
        for field in ['sharing_title', 'sharing_capacity', 'sharing_availability_note', 'sharing_contact_name',
                      'sharing_contact_email', 'sharing_contact_phone']:
            for control in ['\r', '\n', '\t', '\x00', '\x1f', '\x7f']:
                with self.subTest(field=field, control=repr(control)):
                    response = self.sharing(**{field: f'{control}valid{control}'})
                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertIn(field, response.data)
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.sharing_title, '')

    def test_email_and_phone_values_are_safe_contacts_not_schemes_or_encoded_links(self):
        for phone in ['tel:+905559876543', 'https://example.test', '+90%0a5559876543', '90+5559876543',
                      '12345', '1234567890123456', '555/9876543', '５５５９８７６５４３']:
            with self.subTest(phone=phone):
                self.assertEqual(self.sharing(sharing_contact_phone=phone).status_code, 400)
        for email in ['not-an-email', 'mailto:public-offer@example.test', 'person%0a@example.test\r',
                      'person@example.test?body=example']:
            with self.subTest(email=email):
                self.assertEqual(self.sharing(sharing_contact_email=email).status_code, 400)
        response = self.sharing(sharing_contact_phone=' +90 (555) 987.6543 ',
                                sharing_contact_email=' public-offer@example.test ', sharing_contact_name=' Desk ')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['sharing_contact_phone'], '+90 (555) 987.6543')
        self.assertEqual(response.data['sharing_contact_email'], 'public-offer@example.test')
        self.assertEqual(response.data['sharing_contact_name'], 'Desk')

    def test_quantity_range_precision_and_current_stock_are_enforced(self):
        for quantity in [True, False, 0, -1, 1.5, '1.00000000000000001', MAX_STOCK_QUANTITY + 1,
                         str(MAX_STOCK_QUANTITY + 1), 'NaN', 'Infinity', 51]:
            with self.subTest(quantity=quantity):
                response = self.sharing(is_shared=True, sharing_quantity=quantity)
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn('sharing_quantity', response.data)
        for quantity in [1, 20, '50']:
            response = self.sharing(is_shared=True, sharing_quantity=quantity)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['sharing_quantity'], int(quantity))
        self.asset.custom_data['quantity'] = MAX_STOCK_QUANTITY
        self.asset.save(update_fields=['custom_data'])
        response = self.sharing(is_shared=True, sharing_quantity=str(MAX_STOCK_QUANTITY))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['sharing_quantity'], MAX_STOCK_QUANTITY)

    def test_contact_email_database_length_is_enforced_before_write(self):
        address = 'a' * 64 + '@' + 'b' * 63 + '.' + 'c' * 63 + '.' + 'd' * 61
        self.assertEqual(len(address), 254)
        response = self.sharing(sharing_contact_email=address)
        self.assertEqual(response.status_code, 200, response.data)
        for extra_length in [1, 8]:
            response = self.sharing(sharing_contact_email=address + 'd' * extra_length)
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('sharing_contact_email', response.data)
            self.asset.refresh_from_db()
            self.assertEqual(self.asset.sharing_contact_email, address)

    def test_available_requires_quantity_but_arrangement_and_unavailable_may_omit_it(self):
        for shared in [False, True]:
            response = self.sharing(is_shared=shared, sharing_availability='available', sharing_quantity=None)
            self.assertEqual(response.status_code, 400, response.data)
        for availability in ['by_arrangement', 'unavailable']:
            response = self.sharing(is_shared=True, sharing_availability=availability, sharing_quantity=None)
            self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.sharing(sharing_availability='unknown').status_code, 400)

    def test_individual_equipment_can_only_offer_one_and_stock_zero_cannot_offer_one(self):
        individual = Asset.objects.create(tenant=self.owner, asset_type=self.individual_type)
        self.assertEqual(self.sharing(individual, is_shared=True, sharing_quantity=2).status_code, 400)
        self.assertEqual(self.sharing(individual, is_shared=True, sharing_quantity=1,
                                      sharing_availability='available').status_code, 200)
        self.asset.custom_data['quantity'] = 0
        self.asset.save(update_fields=['custom_data'])
        self.assertEqual(self.sharing(is_shared=True, sharing_quantity=1).status_code, 400)

    def test_regular_inventory_writes_cannot_set_offer_details_and_unknown_action_fields_rejected(self):
        details = {field: 'Bypass' for field in SHARING_DETAIL_FIELDS}
        details.update(sharing_quantity=2, sharing_availability='available', is_shared=True)
        response = self.client.patch(f'/api/assets/items/{self.asset.pk}/', details, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['is_shared'])
        self.assertIsNone(response.data['sharing_quantity'])
        self.assertEqual(response.data['sharing_contact_email'], '')
        for private in ['custom_data', 'tenant', 'shared_at', 'sharing_needs_review']:
            self.assertEqual(self.sharing(**{private: 'Bypass'}).status_code, 400)

    def test_new_details_do_not_expand_manager_or_member_permissions(self):
        self.manager.role = 'tenant_user'
        self.manager.save(update_fields=['role'])
        self.assertEqual(self.offer().status_code, 403)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.offer().status_code, 403)
        self.member.role = 'tenant_admin'
        self.member.save(update_fields=['role'])
        self.assertEqual(self.offer().status_code, 404)

    def test_owner_transfer_clears_every_public_detail_and_consent(self):
        self.assertEqual(self.offer().status_code, 200)
        self.manager.role = 'platform_admin'
        self.manager.is_superuser = True
        self.manager.tenant = None
        self.manager.save(update_fields=['role', 'is_superuser', 'tenant'])
        response = self.client.patch(f'/api/assets/items/{self.asset.pk}/', {'tenant': self.other.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['is_shared'])
        self.assertIsNone(response.data['shared_at'])
        self.assertIsNone(response.data['sharing_quantity'])
        self.assertEqual(response.data['sharing_availability'], 'by_arrangement')
        for field in SHARING_DETAIL_FIELDS:
            if field not in ('sharing_quantity', 'sharing_availability'):
                self.assertEqual(response.data[field], '')
        self.assertEqual(response.data['custom_data']['quantity'], 50)

    def test_stock_decrease_pauses_offer_keeps_draft_and_stock_increase_never_republishes(self):
        self.assertEqual(self.offer().status_code, 200)
        response = self.client.patch(f'/api/assets/items/{self.asset.pk}/',
                                     {'custom_data': {'quantity': '10'}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['custom_data']['quantity'], 10)
        self.assertEqual(response.data['custom_data']['internal_note'], 'Private maintenance')
        self.assertFalse(response.data['is_shared'])
        self.assertIsNone(response.data['shared_at'])
        self.assertEqual(response.data['sharing_quantity'], 20)
        self.assertTrue(response.data['sharing_needs_review'])
        self.assertEqual(response.data['sharing_contact_name'], 'Sample equipment desk')
        self.assertEqual(self.public_rows(), [])
        self.client.force_authenticate(self.manager)
        response = self.client.patch(f'/api/assets/items/{self.asset.pk}/',
                                     {'custom_data': {'quantity': 50}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['is_shared'])
        self.assertFalse(response.data['sharing_needs_review'])
        self.assertEqual(self.sharing(is_shared=True).status_code, 200)

    def test_stock_decrease_that_still_covers_offer_keeps_publication_date(self):
        response = self.offer()
        published_at = response.data['shared_at']
        response = self.client.patch(f'/api/assets/items/{self.asset.pk}/',
                                     {'custom_data': {'quantity': 20}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['is_shared'])
        self.assertEqual(response.data['shared_at'], published_at)

    def test_invalid_offer_from_type_change_is_paused_without_rejecting_inventory_change(self):
        self.assertEqual(self.offer().status_code, 200)
        response = self.client.patch(f'/api/assets/items/{self.asset.pk}/', {
            'asset_type': str(self.individual_type.pk), 'custom_data': {},
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['is_shared'])
        self.assertTrue(response.data['sharing_needs_review'])
        self.assertEqual(response.data['sharing_quantity'], 20)
        self.assertIsNone(response.data['shared_at'])
        self.assertEqual(self.sharing(is_shared=False).status_code, 200)
        self.assertEqual(self.sharing(is_shared=True, sharing_quantity=1).status_code, 200)

    def test_every_type_change_pauses_publication_even_with_valid_or_legacy_quantity(self):
        alternate_stock_type = AssetType.objects.create(
            name='Alternate offer stock', tracking_mode='stock', schema=default_stock_schema(),
        )
        alternate_individual_type = AssetType.objects.create(name='Alternate individual equipment', schema=[])
        for source_type, target_type, quantity in [
            (self.stock_type, alternate_stock_type, 20),
            (self.individual_type, alternate_individual_type, 1),
            (self.stock_type, alternate_stock_type, None),
        ]:
            with self.subTest(tracking_mode=source_type.tracking_mode, quantity=quantity):
                asset = Asset.objects.create(
                    tenant=self.owner, asset_type=source_type, custom_data={
                        **self.asset.custom_data, 'material_code': f'TYPE-CHANGE-{source_type.tracking_mode}-{quantity}',
                    },
                )
                published = self.sharing(
                    asset, is_shared=True, sharing_quantity=quantity, sharing_title='Owner-approved original offer',
                    sharing_note='Original use conditions', sharing_capacity='Original technical capacity',
                    sharing_contact_email='original-contact@example.test',
                )
                self.assertEqual(published.status_code, 200, published.data)
                response = self.client.patch(f'/api/assets/items/{asset.pk}/', {
                    'asset_type': str(target_type.pk),
                }, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                self.assertFalse(response.data['is_shared'])
                self.assertIsNone(response.data['shared_at'])
                self.assertFalse(response.data['sharing_needs_review'])
                self.assertEqual(response.data['sharing_quantity'], quantity)
                self.assertEqual(response.data['sharing_title'], 'Owner-approved original offer')
                self.assertEqual(response.data['sharing_note'], 'Original use conditions')
                self.assertEqual(response.data['sharing_capacity'], 'Original technical capacity')
                self.assertEqual(response.data['sharing_contact_email'], 'original-contact@example.test')

    def test_explicit_unchanged_type_preserves_valid_publication_and_details(self):
        published = self.offer()
        self.assertEqual(published.status_code, 200, published.data)
        response = self.client.patch(f'/api/assets/items/{self.asset.pk}/', {
            'asset_type': str(self.stock_type.pk),
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['is_shared'])
        self.assertEqual(response.data['shared_at'], published.data['shared_at'])
        for field in SHARING_DETAIL_FIELDS:
            self.assertEqual(response.data[field], published.data[field])

    def test_invalid_draft_can_unpublish_without_changing_details(self):
        self.assertEqual(self.offer().status_code, 200)
        Asset.objects.filter(pk=self.asset.pk).update(custom_data={**self.asset.custom_data, 'quantity': 0})
        response = self.sharing(is_shared=False)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['sharing_needs_review'])
        self.assertEqual(response.data['sharing_quantity'], 20)
        self.assertEqual(response.data['sharing_contact_email'], 'public-offer@example.test')
        self.assertEqual(self.sharing(is_shared=True).status_code, 400)

    def test_stale_sharing_write_revalidates_stock_type_and_owner_under_lock(self):
        for change in ['stock', 'type', 'owner', 'delete']:
            with self.subTest(change=change):
                asset = Asset.objects.create(tenant=self.owner, asset_type=self.stock_type,
                                            custom_data=dict(self.asset.custom_data))
                serializer = AssetSharingSerializer(asset, data={
                    'is_shared': True, 'sharing_quantity': 20, 'sharing_availability': 'available',
                }, partial=True)
                serializer.is_valid(raise_exception=True)
                if change == 'stock':
                    Asset.objects.filter(pk=asset.pk).update(custom_data={**asset.custom_data, 'quantity': 1})
                elif change == 'type':
                    Asset.objects.filter(pk=asset.pk).update(asset_type=self.individual_type)
                elif change == 'owner':
                    Asset.objects.filter(pk=asset.pk).update(tenant=self.other)
                else:
                    Asset.objects.filter(pk=asset.pk).delete()
                with self.assertRaises(NotFound if change == 'delete' else ValidationError):
                    serializer.save()
                if change != 'delete':
                    asset.refresh_from_db()
                    self.assertFalse(asset.is_shared)

    def test_stale_inventory_patch_preserves_newer_stock_when_only_an_unrelated_field_changes(self):
        self.assertEqual(self.offer().status_code, 200)
        serializer = AssetSerializer(self.asset, data={'custom_data': {'internal_note': 'Edited note'}},
                                     partial=True, context={'request': SimpleNamespace(user=self.manager)})
        serializer.is_valid(raise_exception=True)
        Asset.objects.filter(pk=self.asset.pk).update(custom_data={**self.asset.custom_data, 'quantity': 10})
        result = serializer.save()
        self.assertTrue(serializer.sharing_paused)
        self.assertFalse(result.is_shared)
        self.assertEqual(result.custom_data['quantity'], 10)
        self.assertEqual(result.custom_data['internal_note'], 'Edited note')

    def test_both_excel_paths_update_inventory_pause_invalid_offer_and_report_count(self):
        for template in [False, True]:
            with self.subTest(template=template):
                self.asset.custom_data['quantity'] = 50
                self.asset.save(update_fields=['custom_data'])
                self.assertEqual(self.offer().status_code, 200)
                rows = [['Malzeme kodu', 'Malzeme adı', 'Stok adedi']]
                if template:
                    rows.extend([['Information'], ['Example']])
                rows.extend([['PRIVATE-OFFER-01', 'Updated material', 0],
                             [f'NEW-OFFER-{template}', 'Private new material', 1]])
                response = self.client.post(f'/api/assets/items/{"bulk_import" if template else "raw_import"}/', {
                    'file': import_file(rows), 'asset_type': str(self.stock_type.pk),
                    'mapping': json.dumps({'Malzeme kodu': 'material_code', 'Malzeme adı': 'material_name',
                                           'Stok adedi': 'quantity'}),
                }, format='multipart')
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['sharing_paused_count'], 1)
                self.assertEqual(response.data['updated_count'], 1)
                self.assertEqual(response.data['created_count'], 1)
                self.assertEqual(response.data['error_count'], 0)
                self.asset.refresh_from_db()
                self.assertEqual(self.asset.custom_data['quantity'], 0)
                self.assertEqual(self.asset.custom_data['internal_note'], 'Private maintenance')
                self.assertFalse(self.asset.is_shared)
                self.assertEqual(self.asset.sharing_quantity, 20)
                self.assertTrue(self.asset.sharing_needs_review)

    def test_malformed_legacy_offer_returns_unspecified_quantity_without_capping_to_private_stock(self):
        for quantity, availability in [(100, 'available'), (0, 'available'), (MAX_STOCK_QUANTITY + 1, 'available'),
                                       (None, 'available')]:
            with self.subTest(quantity=quantity):
                Asset.objects.filter(pk=self.asset.pk).update(is_shared=True, sharing_quantity=quantity,
                                                            sharing_availability=availability)
                row = self.public_rows()[0]
                self.assertIsNone(row['sharing_quantity'])
                self.assertEqual(row['sharing_availability'], 'by_arrangement')
                self.assertNotIn('custom_data', row)
                self.assertNotIn('quantity', row)

    def test_both_excel_paths_merge_mapped_values_with_newer_unmapped_private_metadata(self):
        original_is_valid = AssetSerializer.is_valid
        asset_id = self.asset.pk

        def concurrent_private_edit(serializer, *args, **kwargs):
            result = original_is_valid(serializer, *args, **kwargs)
            current = Asset.objects.get(pk=asset_id)
            Asset.objects.filter(pk=asset_id).update(custom_data={
                **current.custom_data, 'internal_note': 'Newer private note during import',
            })
            return result

        for template in [False, True]:
            with self.subTest(template=template):
                self.asset.custom_data['internal_note'] = 'Original private note'
                self.asset.save(update_fields=['custom_data'])
                rows = [['Malzeme kodu', 'Malzeme adı', 'Stok adedi']]
                if template:
                    rows.extend([['Information'], ['Example']])
                rows.append(['PRIVATE-OFFER-01', 'Updated mapped material', 10])
                with patch.object(AssetSerializer, 'is_valid', concurrent_private_edit):
                    response = self.client.post(f'/api/assets/items/{"bulk_import" if template else "raw_import"}/', {
                        'file': import_file(rows), 'asset_type': str(self.stock_type.pk),
                        'mapping': json.dumps({'Malzeme kodu': 'material_code', 'Malzeme adı': 'material_name',
                                               'Stok adedi': 'quantity'}),
                    }, format='multipart')
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['updated_count'], 1)
                self.assertEqual(response.data['error_count'], 0)
                self.asset.refresh_from_db()
                self.assertEqual(self.asset.custom_data['quantity'], 10)
                self.assertEqual(self.asset.custom_data['material_name'], 'Updated mapped material')
                self.assertEqual(self.asset.custom_data['internal_note'], 'Newer private note during import')

    def test_shared_search_uses_explicit_title_and_capacity_without_private_inventory_search(self):
        self.assertEqual(self.offer().status_code, 200)
        self.assertEqual(len(self.public_rows(search='shared use')), 1)
        self.assertEqual(len(self.public_rows(search='standard scaffold tubes')), 1)
        self.assertEqual(self.public_rows(search='PRIVATE-OFFER-01'), [])


class SharingDetailsMigrationTests(TransactionTestCase):
    """Forward/reverse/repeated migration preserves all pre-existing owner decisions."""

    old_target = [('assets', '0005_assettype_tracking_mode')]
    new_target = [('assets', '0006_asset_sharing_details')]
    available_apps = [app.name for app in apps.get_app_configs() if app.label != 'audit']

    def test_additive_migration_preserves_existing_inventory_and_publication(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.old_target)
        try:
            old_apps = executor.loader.project_state(self.old_target).apps
            old_tenant = old_apps.get_model('tenants', 'Tenant').objects.create(name='Migration example yard', slug='migration-example')
            old_type = old_apps.get_model('assets', 'AssetType').objects.create(name='Migration example stock', tracking_mode='stock')
            old_asset = old_apps.get_model('assets', 'Asset')
            published_at = timezone.now()
            private_data = {'material_code': 'MIGRATION-EXAMPLE-01', 'material_name': 'Example material', 'quantity': 50}
            published = old_asset.objects.create(tenant=old_tenant, asset_type=old_type, custom_data=private_data,
                                                 is_shared=True, sharing_note='Owner-approved public note', shared_at=published_at)
            private = old_asset.objects.create(tenant=old_tenant, asset_type=old_type,
                                               custom_data={'material_code': 'MIGRATION-EXAMPLE-02'}, is_shared=False)
            for target in [self.new_target, self.new_target, self.old_target, self.new_target]:
                executor = MigrationExecutor(connection)
                executor.migrate(target)
                apps = executor.loader.project_state(target).apps
                migrated = apps.get_model('assets', 'Asset').objects.get(pk=published.pk)
                self.assertEqual(migrated.tenant_id, old_tenant.pk)
                self.assertEqual(migrated.asset_type_id, old_type.pk)
                self.assertEqual(migrated.custom_data, private_data)
                self.assertTrue(migrated.is_shared)
                self.assertEqual(migrated.sharing_note, 'Owner-approved public note')
                self.assertEqual(migrated.shared_at, published_at)
                self.assertFalse(apps.get_model('assets', 'Asset').objects.get(pk=private.pk).is_shared)
                self.assertEqual(apps.get_model('assets', 'Asset').objects.count(), 2)
                self.assertEqual(apps.get_model('assets', 'AssetType').objects.get(pk=old_type.pk).tracking_mode, 'stock')
                if target == self.new_target:
                    self.assertIsNone(migrated.sharing_quantity)
                    self.assertEqual(migrated.sharing_availability, 'by_arrangement')
                    for field in SHARING_DETAIL_FIELDS:
                        if field not in ('sharing_note', 'sharing_quantity', 'sharing_availability'):
                            self.assertEqual(getattr(migrated, field), '')
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
