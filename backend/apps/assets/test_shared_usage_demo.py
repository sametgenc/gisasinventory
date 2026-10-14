"""Practice data stays isolated and repeat runs preserve user changes."""

from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import TestCase, override_settings

from apps.assets.models import Asset
from apps.assets.usage_models import SharedUsageRequest
from apps.tenants.models import Tenant
from apps.user.models import User


class SharedUsageDemoTests(TestCase):
    def test_command_refuses_production_settings(self):
        with self.assertRaises(CommandError):
            call_command('seed_shared_usage_demo', stdout=StringIO())

    def test_practice_data_is_idempotent_and_keeps_user_changes(self):
        if connection.vendor != 'sqlite':
            self.skipTest('Demo command deliberately refuses PostgreSQL.')
        first = Tenant.objects.create(name='Invented demo owner')
        second = Tenant.objects.create(name='Invented demo requester')
        User.objects.create(username='invented-owner', email='yonetici@demo.gisas.test', role='tenant_admin', tenant=first)
        User.objects.create(username='invented-requester', email='diger@demo.gisas.test', role='tenant_admin', tenant=second)
        with override_settings(DEMO_MODE=True, DEMO_DATABASE_PATH=connection.settings_dict['NAME'], CROSS_TENANT_SHARING_ENABLED=True):
            call_command('seed_shared_usage_demo', stdout=StringIO())
            self.assertEqual(SharedUsageRequest.objects.count(), 3)
            self.assertEqual(set(SharedUsageRequest.objects.values_list('status', flat=True)), {'requested', 'approved', 'active'})
            asset = Asset.objects.get(inventory_code='DEMO-USAGE-STOCK')
            asset.sharing_note = 'User edit retained'
            asset.save(update_fields=['sharing_note'])
            call_command('seed_shared_usage_demo', stdout=StringIO())
            asset.refresh_from_db()
            self.assertEqual(asset.sharing_note, 'User edit retained')
            self.assertEqual(SharedUsageRequest.objects.count(), 3)
            self.assertTrue(Asset.objects.get(inventory_code='DEMO-UPDATE-RECORD').needs_update)
