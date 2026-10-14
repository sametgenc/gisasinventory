"""Owner consent, public projection, and private inventory isolation."""

import json
from io import BytesIO
from types import SimpleNamespace

import openpyxl
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework.exceptions import NotFound, ValidationError

from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Asset, AssetType
from .serializers import AssetSerializer


def import_file(rows):
    workbook = openpyxl.Workbook()
    for row in rows:
        workbook.active.append(row)
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    return SimpleUploadedFile('inventory.xlsx', stream.getvalue())


class AssetSharingTests(APITestCase):
    def setUp(self):
        self.owner = Tenant.objects.create(name='Owner yard', email='private-yard@example.test')
        self.other = Tenant.objects.create(name='Other yard')
        self.manager = User.objects.create(username='manager', role='tenant_admin', tenant=self.owner)
        self.member = User.objects.create(username='member', tenant=self.other)
        self.asset_type = AssetType.objects.create(name='Forklift', category_code='G', catalog_code='G-01',
                                                   sharing_class='B', schema=[
            {'key': 'code', 'label': 'Equipment code', 'type': 'text', 'required': True, 'is_unique_key': True},
            {'key': 'notes', 'label': 'Internal note', 'type': 'text'},
        ])
        self.asset = Asset.objects.create(tenant=self.owner, asset_type=self.asset_type,
                                          created_by=self.manager, assigned_to=self.manager,
                                          custom_data={'code': 'SECRET-123', 'notes': 'Private maintenance record'})
        self.client.force_authenticate(self.manager)

    def publish(self, **overrides):
        return self.client.patch(f'/api/assets/items/{self.asset.pk}/sharing/', {
            'is_shared': True, 'sharing_note': '3 ton forklift; contact owner to discuss conditions.',
            **overrides,
        }, format='json')

    def shared_rows(self, **filters):
        response = self.client.get('/api/assets/items/shared/', filters)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data.get('results', []) if isinstance(response.data, dict) else response.data

    def test_existing_and_new_inventory_is_private_by_default(self):
        self.assertFalse(self.asset.is_shared)
        created = self.client.post('/api/assets/items/', {
            'asset_type': str(self.asset_type.pk), 'custom_data': {'code': 'NEW-1'},
            'is_shared': True, 'sharing_note': 'Silently publish', 'shared_at': timezone.now().isoformat(),
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertFalse(created.data['is_shared'])
        self.assertEqual(created.data['sharing_note'], '')
        self.assertIsNone(created.data['shared_at'])
        self.assertEqual(self.shared_rows(), [])

    def test_owner_manager_publishes_updates_note_and_unpublishes(self):
        response = self.publish()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['is_shared'])
        self.assertTrue(response.data['is_listed_for_sharing'])
        published_at = response.data['shared_at']
        self.assertIsNotNone(published_at)
        note_update = self.client.patch(f'/api/assets/items/{self.asset.pk}/sharing/',
                                        {'sharing_note': 'Updated public note'}, format='json')
        self.assertEqual(note_update.status_code, 200, note_update.data)
        self.assertEqual(note_update.data['shared_at'], published_at)
        self.assertEqual(note_update.data['sharing_note'], 'Updated public note')
        response = self.publish(is_shared=False)
        self.assertFalse(response.data['is_shared'])
        self.assertFalse(response.data['is_listed_for_sharing'])
        self.assertIsNone(response.data['shared_at'])
        self.assertEqual(self.shared_rows(), [])

    def test_foreign_manager_cannot_publish_or_change_private_item(self):
        self.member.role = 'tenant_admin'
        self.member.save(update_fields=['role'])
        self.client.force_authenticate(self.member)
        self.assertEqual(self.publish().status_code, 404)
        self.assertEqual(self.client.get(f'/api/assets/items/{self.asset.pk}/').status_code, 404)
        self.asset.refresh_from_db()
        self.assertFalse(self.asset.is_shared)

    def test_staff_cannot_publish_or_unpublish_but_can_discover_shared_items(self):
        self.assertEqual(self.publish().status_code, 200)
        self.manager.role = 'tenant_user'
        self.manager.save(update_fields=['role'])
        self.assertEqual(self.publish().status_code, 403)
        self.assertEqual(self.publish(is_shared=False).status_code, 403)
        self.assertEqual(len(self.shared_rows()), 1)

    def test_other_shipyard_sees_only_public_projection(self):
        self.assertEqual(self.publish().status_code, 200)
        self.client.force_authenticate(self.member)
        rows = self.shared_rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(set(rows[0]), {'id', 'tenant', 'tenant_name', 'asset_type_name', 'category_code',
                                      'catalog_code', 'sharing_note', 'shared_at'})
        self.assertEqual(rows[0]['tenant'], self.owner.pk)
        self.assertEqual(rows[0]['tenant_name'], self.owner.name)
        self.assertEqual(rows[0]['asset_type_name'], 'Forklift')
        public_json = json.dumps(rows)
        for secret in ['SECRET-123', 'Private maintenance record', 'private-yard@example.test',
                       'manager', 'custom_data', 'assigned_to', 'created_by']:
            self.assertNotIn(secret, public_json)
        private = self.client.get('/api/assets/items/')
        self.assertEqual(private.data.get('results', []) if isinstance(private.data, dict) else private.data, [])
        self.assertEqual(self.client.get(f'/api/assets/items/{self.asset.pk}/').status_code, 404)

    def test_unassigned_inactive_account_and_inactive_shipyard_cannot_access_sharing(self):
        self.assertEqual(self.publish().status_code, 200)
        for kind in ['unassigned', 'inactive_user', 'inactive_tenant']:
            with self.subTest(kind=kind):
                user = User.objects.create(username=kind, role='tenant_admin',
                                            tenant=None if kind == 'unassigned' else self.other,
                                            is_active=kind != 'inactive_user')
                if kind == 'inactive_tenant':
                    self.other.is_active = False
                    self.other.save(update_fields=['is_active'])
                self.client.force_authenticate(user)
                self.assertEqual(self.client.get('/api/assets/items/shared/').status_code, 403)
                self.assertEqual(self.publish(is_shared=False).status_code, 403)

    def test_platform_admin_without_shipyard_can_read_and_manage_sharing(self):
        admin = User.objects.create(username='platform', role='platform_admin')
        self.client.force_authenticate(admin)
        self.assertEqual(self.publish().status_code, 200)
        self.assertEqual(len(self.shared_rows()), 1)

    def test_all_type_exclusion_rules_reject_publish_but_allow_unpublish(self):
        for updates in [
            {'category_code': 'K'}, {'sharing_class': 'C'}, {'exclusion_reason': 'Restricted equipment'},
        ]:
            with self.subTest(updates=updates):
                AssetType.objects.filter(pk=self.asset_type.pk).update(category_code='G', sharing_class='B',
                                                                       exclusion_reason='')
                self.assertEqual(self.publish().status_code, 200)
                AssetType.objects.filter(pk=self.asset_type.pk).update(**updates)
                self.assertEqual(self.publish().status_code, 400)
                self.assertEqual(self.shared_rows(), [])
                self.assertEqual(self.publish(is_shared=False).status_code, 200)

    def test_changed_type_policy_or_disabled_owner_hides_public_item(self):
        self.assertEqual(self.publish().status_code, 200)
        self.asset_type.exclusion_reason = 'Later restriction'
        self.asset_type.save(update_fields=['exclusion_reason'])
        self.assertEqual(self.shared_rows(), [])
        own = self.client.get(f'/api/assets/items/{self.asset.pk}/')
        self.assertTrue(own.data['is_shared'])
        self.assertFalse(own.data['is_listed_for_sharing'])
        self.asset_type.exclusion_reason = ''
        self.asset_type.save(update_fields=['exclusion_reason'])
        self.owner.is_active = False
        self.owner.save(update_fields=['is_active'])
        self.client.force_authenticate(self.member)
        self.assertEqual(self.shared_rows(), [])
        admin = User.objects.create(username='platform-disabled-owner', role='platform_admin')
        self.client.force_authenticate(admin)
        self.assertEqual(self.publish().status_code, 400)
        self.assertEqual(self.publish(is_shared=False).status_code, 200)

    def test_whitespace_only_exclusion_matches_property_policy(self):
        self.asset_type.exclusion_reason = ' \t\n '
        self.asset_type.save(update_fields=['exclusion_reason'])
        self.assertEqual(self.publish().status_code, 200)
        self.assertEqual(len(self.shared_rows()), 1)

    def test_regular_update_cannot_publish_or_replace_public_note(self):
        response = self.client.patch(f'/api/assets/items/{self.asset.pk}/', {
            'is_shared': True, 'sharing_note': 'Bypass note', 'shared_at': timezone.now().isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['is_shared'])
        self.assertEqual(response.data['sharing_note'], '')
        self.assertEqual(self.publish().status_code, 200)
        response = self.client.patch(f'/api/assets/items/{self.asset.pk}/', {'is_shared': False}, format='json')
        self.assertTrue(response.data['is_shared'])

    def test_owner_transfer_resets_consent_note_and_publication_date(self):
        self.assertEqual(self.publish().status_code, 200)
        self.manager.role = 'platform_admin'
        self.manager.save(update_fields=['role'])
        response = self.client.patch(f'/api/assets/items/{self.asset.pk}/', {
            'tenant': self.other.pk, 'assigned_to': None, 'is_shared': True,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['is_shared'])
        self.assertFalse(response.data['is_listed_for_sharing'])
        self.assertEqual(response.data['sharing_note'], '')
        self.assertIsNone(response.data['shared_at'])
        self.assertEqual(self.shared_rows(), [])

    def test_inventory_update_does_not_restore_an_unpublished_stale_row(self):
        self.assertEqual(self.publish().status_code, 200)
        stale = Asset.objects.get(pk=self.asset.pk)
        serializer = AssetSerializer(stale, data={'custom_data': {'code': 'SECRET-123', 'notes': 'Edited'}},
                                     partial=True, context={'request': SimpleNamespace(user=self.manager)})
        serializer.is_valid(raise_exception=True)
        self.assertEqual(self.publish(is_shared=False).status_code, 200)
        serializer.save()
        self.asset.refresh_from_db()
        self.assertFalse(self.asset.is_shared)
        self.assertIsNone(self.asset.shared_at)
        self.assertEqual(self.asset.custom_data['notes'], 'Edited')

    def test_inventory_update_rejects_a_row_transferred_after_validation(self):
        stale = Asset.objects.get(pk=self.asset.pk)
        serializer = AssetSerializer(stale, data={'custom_data': {'code': 'SECRET-123', 'notes': 'Edited'}},
                                     partial=True, context={'request': SimpleNamespace(user=self.manager)})
        serializer.is_valid(raise_exception=True)
        Asset.objects.filter(pk=self.asset.pk).update(tenant=self.other, assigned_to=None)
        with self.assertRaises(ValidationError):
            serializer.save()
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.tenant_id, self.other.pk)
        self.assertEqual(self.asset.custom_data['notes'], 'Private maintenance record')

    def test_inventory_update_handles_deletion_after_validation(self):
        serializer = AssetSerializer(self.asset, data={'custom_data': {'code': 'SECRET-123'}},
                                     partial=True, context={'request': SimpleNamespace(user=self.manager)})
        serializer.is_valid(raise_exception=True)
        Asset.objects.filter(pk=self.asset.pk).delete()
        with self.assertRaises(NotFound):
            serializer.save()

    def test_public_note_limit_and_unexpected_private_fields_are_rejected(self):
        self.assertEqual(self.publish(sharing_note='x' * 1001).status_code, 400)
        self.assertEqual(self.publish(custom_data={'code': 'Overwrite'}).status_code, 400)
        self.assertEqual(self.publish(shared_at=timezone.now().isoformat()).status_code, 400)
        self.asset.refresh_from_db()
        self.assertFalse(self.asset.is_shared)
        self.assertEqual(self.asset.custom_data['code'], 'SECRET-123')

    def test_both_excel_import_modes_preserve_publication_and_create_private_items(self):
        self.assertEqual(self.publish().status_code, 200)
        self.asset.refresh_from_db()
        published_at, public_note = self.asset.shared_at, self.asset.sharing_note
        template = self.client.post('/api/assets/items/bulk_import/', {
            'asset_type': str(self.asset_type.pk), 'is_shared': True,
            'file': import_file([['Equipment code', 'Internal note'], ['info'], ['example'],
                                 ['SECRET-123', 'Updated internal'], ['NEW-IMPORT-1', 'Private new record']]),
        }, format='multipart')
        self.assertEqual(template.status_code, 200, template.data)
        self.assertEqual((template.data['created_count'], template.data['updated_count']), (1, 1))
        raw = self.client.post('/api/assets/items/raw_import/', {
            'asset_type': str(self.asset_type.pk), 'is_shared': True,
            'mapping': json.dumps({'Code': 'code'}),
            'file': import_file([['Code'], ['SECRET-123'], ['NEW-IMPORT-2']]),
        }, format='multipart')
        self.assertEqual(raw.status_code, 200, raw.data)
        self.assertEqual((raw.data['created_count'], raw.data['updated_count']), (1, 1))
        self.asset.refresh_from_db()
        self.assertTrue(self.asset.is_shared)
        self.assertEqual((self.asset.shared_at, self.asset.sharing_note), (published_at, public_note))
        self.assertEqual(Asset.objects.filter(is_shared=True).count(), 1)
        self.assertEqual(Asset.objects.filter(is_shared=False).count(), 2)

    def test_public_list_search_and_filters_never_expand_visibility(self):
        self.assertEqual(self.publish().status_code, 200)
        Asset.objects.create(tenant=self.other, asset_type=self.asset_type, custom_data={'code': 'PRIVATE-OTHER'})
        self.client.force_authenticate(self.member)
        self.assertEqual(len(self.shared_rows(search='Forklift', category_code='G', tenant=self.owner.pk,
                                               asset_type=str(self.asset_type.pk))), 1)
        self.assertEqual(self.shared_rows(tenant=self.other.pk), [])
        self.assertEqual(self.shared_rows(search='SECRET-123'), [])
        self.assertEqual(len(self.shared_rows(search='contact owner')), 1)
        self.assertEqual(len(self.shared_rows(search='Owner yard')), 1)
        self.assertEqual(self.client.get('/api/assets/items/shared/', {'asset_type': 'bad-id'}).status_code, 400)

    def test_shared_list_has_stable_pagination(self):
        Asset.objects.bulk_create([
            Asset(tenant=self.owner, asset_type=self.asset_type, is_shared=True, shared_at=timezone.now())
            for _ in range(25)
        ])
        first = self.client.get('/api/assets/items/shared/')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(set(first.data), {'count', 'next', 'previous', 'results'})
        self.assertEqual(first.data['count'], 25)
        self.assertEqual(len(first.data['results']), 24)
        second = self.client.get('/api/assets/items/shared/', {'page': 2})
        self.assertEqual(len(second.data['results']), 1)
        self.assertEqual(self.client.get('/api/assets/items/shared/', {'page': 3}).status_code, 404)

    def test_anonymous_cannot_read_or_change_sharing(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/assets/items/shared/').status_code, (401, 403))
        self.assertIn(self.publish().status_code, (401, 403))
