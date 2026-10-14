"""Add fictional shared-use practice records without resetting existing demo data."""

from copy import deepcopy
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from apps.assets.models import Asset, AssetType
from apps.assets.schema_evolution import notify_schema_change
from apps.assets.usage import create_usage_request, transition_usage_request
from apps.assets.usage_models import SharedUsageRequest
from apps.assets.validation import default_stock_schema
from apps.user.models import User


class Command(BaseCommand):
    help = 'Add free-use requests and incomplete inventory examples in the isolated demo only.'

    @transaction.atomic
    def handle(self, *args, **options):
        expected = getattr(settings, 'DEMO_DATABASE_PATH', None)
        if (not getattr(settings, 'DEMO_MODE', False) or expected is None
                or connection.vendor != 'sqlite'
                or Path(connection.settings_dict['NAME']).resolve() != Path(expected).resolve()):
            raise CommandError('Bu komut yalnız ayrı SQLite demo veritabanında çalışır.')
        if not getattr(settings, 'CROSS_TENANT_SHARING_ENABLED', False):
            raise CommandError('Demo ortak kullanımını CROSS_TENANT_SHARING_ENABLED=True ile açın.')
        owner = User.objects.filter(email='yonetici@demo.gisas.test', role='tenant_admin',
                                    is_active=True, tenant__is_active=True).select_related('tenant').first()
        requester = User.objects.filter(email='diger@demo.gisas.test', role='tenant_admin',
                                        is_active=True, tenant__is_active=True).select_related('tenant').first()
        if not owner or not requester or owner.tenant_id == requester.tenant_id:
            raise CommandError('Önce seed_demo ile iki kurmaca tersanenin test hesaplarını hazırlayın.')
        equipment_type, _ = AssetType.objects.get_or_create(catalog_code='DEMO-USAGE-001', defaults={
            'name': 'Ortak kullanım denemesi · İskele platformu', 'tracking_mode': 'stock',
            'category_code': 'A', 'sharing_class': 'B', 'schema': default_stock_schema(),
            'description': 'Kurmaca test kaydı. Gerçek saha veya kapasite beyanı değildir.',
        })
        equipment, created = Asset.objects.get_or_create(tenant=owner.tenant, asset_type=equipment_type,
            inventory_code='DEMO-USAGE-STOCK', defaults={
                'custom_data': {'material_code': 'DEMO-USAGE-STOCK', 'material_name': 'Deneme platformu', 'quantity': 120},
                'is_shared': True, 'sharing_title': 'Deneme platformu · bedelsiz ortak kullanım',
                'sharing_quantity': 40, 'sharing_note': 'Kurmaca örnek. Taşıma ve kullanım koşulları sahibiyle teyit edilir.',
                'shared_at': timezone.now(), 'created_by': owner,
            })
        # Seed only a newly created practice item; never overwrite user-edited requests.
        if created:
            today = timezone.localdate()
            for quantity, start, end, status in [
                (10, today, today + timedelta(days=2), 'requested'),
                (20, today + timedelta(days=4), today + timedelta(days=6), 'approved'),
                (5, today, today + timedelta(days=1), 'active'),
            ]:
                usage = create_usage_request(requester, asset_id=equipment.pk, start_date=start,
                    end_date=end, quantity=quantity, purpose='Kurmaca montaj çalışmasında erişim platformu ihtiyacı.')
                if status != SharedUsageRequest.Status.REQUESTED:
                    transition_usage_request(owner, usage.pk, 'approve')
                if status == SharedUsageRequest.Status.ACTIVE:
                    transition_usage_request(owner, usage.pk, 'handover')
        update_type, new_type = AssetType.objects.get_or_create(catalog_code='DEMO-UPDATE-001', defaults={
            'name': 'Güncelleme denemesi · Kontrol ekipmanı', 'category_code': 'I',
            'description': 'Kurmaca eksik zorunlu alan örneği.',
            'schema': [{'key': 'inspection_date', 'label': 'Son kontrol tarihi', 'type': 'date', 'required': False}],
        })
        Asset.objects.get_or_create(tenant=owner.tenant, asset_type=update_type,
                                   inventory_code='DEMO-UPDATE-RECORD', defaults={'custom_data': {}, 'created_by': owner})
        if new_type:
            previous = deepcopy(update_type.schema)
            update_type.schema[0]['required'] = True
            update_type.schema_revision += 1
            update_type.save(update_fields=['schema', 'schema_revision', 'updated_at'])
            notify_schema_change(update_type, previous)
        self.stdout.write(self.style.SUCCESS('Bedelsiz talep, teslim/iade ve eksik bilgi denemeleri hazır. Mevcut demo kayıtları korundu.'))
