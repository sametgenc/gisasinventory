"""Behavioral checks for the isolated practice environment."""

import importlib
import os
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import skipUnless
from unittest.mock import patch

import openpyxl
from allauth.account.models import EmailAddress
from django.contrib.auth import SESSION_KEY
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import Client, TestCase, override_settings
from rest_framework.test import APIClient

from apps.assets.management.commands.seed_demo import DEMO_PASSWORD, stable_id
from apps.assets.models import Asset, AssetType
from apps.notifications.models import Notification
from apps.tenants.models import Tenant
from apps.user.models import User


@override_settings(DEMO_MODE=True, DEMO_ALLOW_IN_MEMORY_SEED=True)
class DemoDataTests(TestCase):
    def seed(self, **options):
        call_command("seed_demo", stdout=StringIO(), **options)

    @override_settings(DEMO_MODE=False)
    def test_command_refuses_regular_settings_without_writes(self):
        with self.assertRaises(CommandError):
            self.seed()
        self.assertFalse(User.objects.exists())
        self.assertFalse(Tenant.objects.exists())

    @override_settings(DEMO_MODE=False)
    def test_model_count_demo_refuses_regular_settings_without_writes(self):
        with self.assertRaises(CommandError):
            self.seed(model_count_demo=True)
        self.assertFalse(User.objects.exists())
        self.assertFalse(Tenant.objects.exists())
        self.assertFalse(Asset.objects.exists())

    @override_settings(DEMO_ALLOW_IN_MEMORY_SEED=False, DEMO_DATABASE_PATH="/not-the-test-database.sqlite3")
    def test_command_refuses_wrong_database_even_with_demo_flag(self):
        for options in ({}, {"model_count_demo": True}):
            with self.subTest(options=options), self.assertRaises(CommandError):
                self.seed(**options)
        self.assertFalse(Tenant.objects.exists())

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_seed_is_idempotent_and_preserves_user_edits(self):
        self.seed()
        self.assertEqual((Tenant.objects.count(), User.objects.count(), AssetType.objects.count(), Asset.objects.count(), Notification.objects.count()), (3, 4, 15, 33, 12))
        user = User.objects.get(username="demo_personel")
        original_password = user.password
        user.first_name = "Kullanıcının seçtiği ad"
        user.save(update_fields=["first_name"])
        asset = Asset.objects.first()
        asset.custom_data["notes"] = "Test sırasında düzenlenen not"
        asset.save(update_fields=["custom_data"])
        notification = Notification.objects.first()
        notification.delete()
        self.seed()
        self.assertEqual((Tenant.objects.count(), User.objects.count(), AssetType.objects.count(), Asset.objects.count(), Notification.objects.count()), (3, 4, 15, 33, 12))
        user.refresh_from_db()
        asset.refresh_from_db()
        notification.refresh_from_db()
        self.assertEqual(user.password, original_password)
        self.assertEqual(user.first_name, "Kullanıcının seçtiği ad")
        self.assertEqual(asset.custom_data["notes"], "Test sırasında düzenlenen not")
        self.assertIsNotNone(notification.deleted_at)

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_model_count_demo_adds_fifty_private_records_to_one_shipyard(self):
        self.seed()
        manager = User.objects.get(username="demo_yonetici")
        other_shipyards = {
            yard.pk: Asset.objects.filter(tenant=yard).count()
            for yard in Tenant.objects.exclude(pk=manager.tenant_id)
        }

        self.seed(model_count_demo=True)

        self.assertEqual(Asset.objects.count(), 83)
        group_ids = [stable_id(f"asset:model-count-50:{number}") for number in range(1, 51)]
        records = Asset.objects.filter(pk__in=group_ids)
        self.assertEqual(records.count(), 50)
        self.assertEqual(set(records.values_list("tenant_id", flat=True)), {manager.tenant_id})
        self.assertEqual(set(records.values_list("asset_type__catalog_code", flat=True)), {"DEMO-G-01"})
        self.assertFalse(records.filter(is_shared=True).exists())
        self.assertEqual(Asset.objects.filter(is_shared=True).count(), 3)
        self.assertEqual(
            {record.custom_data["asset_code"] for record in records},
            {f"DEMO-FL-50-{number:03d}" for number in range(1, 51)},
        )
        self.assertEqual(
            {record.custom_data["serial_number"] for record in records},
            {f"DEMO-SERIAL-{number:03d}" for number in range(1, 51)},
        )
        for record in records:
            self.assertEqual(record.custom_data["brand"], "Toyota")
            self.assertEqual(record.custom_data["model"], "8FD")
            self.assertEqual(record.custom_data["capacity"], "3 ton")
        for yard_id, count in other_shipyards.items():
            self.assertEqual(Asset.objects.filter(tenant_id=yard_id).count(), count)

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_model_count_demo_reseeding_preserves_existing_record_edits(self):
        self.seed(model_count_demo=True)
        record = Asset.objects.get(pk=stable_id("asset:model-count-50:1"))
        record.custom_data["asset_code"] = "MANUAL-EDIT-001"
        record.custom_data["model"] = "Manually renamed model"
        record.custom_data["notes"] = "Owner edited this demo record"
        record.save(update_fields=["custom_data"])

        self.seed(model_count_demo=True)

        record.refresh_from_db()
        self.assertEqual(Asset.objects.count(), 83)
        self.assertEqual(record.custom_data["asset_code"], "MANUAL-EDIT-001")
        self.assertEqual(record.custom_data["model"], "Manually renamed model")
        self.assertEqual(record.custom_data["notes"], "Owner edited this demo record")

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_seeded_users_have_verified_emails_and_password_login(self):
        self.seed()
        self.assertEqual(EmailAddress.objects.filter(verified=True, primary=True).count(), 4)
        for user in User.objects.all():
            self.assertTrue(user.check_password(DEMO_PASSWORD))
            self.assertNotEqual(user.password, DEMO_PASSWORD)
        client = Client()
        response = client.post("/_allauth/browser/v1/auth/login", {"email": "yonetici@demo.gisas.test", "password": DEMO_PASSWORD}, content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["meta"]["is_authenticated"])
        self.assertEqual(str(client.session[SESSION_KEY]), str(User.objects.get(username="demo_yonetici").pk))

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_demo_member_sees_only_their_equipment_and_notifications(self):
        self.seed()
        user = User.objects.get(username="demo_personel")
        client = APIClient()
        client.force_authenticate(user)
        response = client.get("/api/assets/items/")
        self.assertEqual(response.status_code, 200)
        records = response.data.get("results", []) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(records), 11)
        self.assertTrue(all(record["tenant"] == user.tenant_id for record in records))
        foreign = Asset.objects.exclude(tenant=user.tenant).first()
        self.assertEqual(client.get(f"/api/assets/items/{foreign.pk}/").status_code, 404)
        notices = client.get("/api/notifications/")
        self.assertEqual(notices.data["count"], 3)
        self.assertTrue(all("demo_personel" in row["content"]["demo_key"] for row in notices.data["results"]))

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_every_category_and_exclusion_rule_has_demo_examples(self):
        self.seed()
        self.assertEqual(set(AssetType.objects.values_list("category_code", flat=True)), set("ABCDEFGHIJKLM"))
        self.assertEqual(set(AssetType.objects.values_list("sharing_class", flat=True)), {"A", "B", "C"})
        for code in ("DEMO-K-01", "DEMO-L-02", "DEMO-I-02"):
            self.assertTrue(AssetType.objects.get(catalog_code=code).sharing_excluded)
        for asset in Asset.objects.select_related("assigned_to"):
            if asset.assigned_to_id:
                self.assertEqual(asset.assigned_to.tenant_id, asset.tenant_id)

    @override_settings(CROSS_TENANT_SHARING_ENABLED=True)
    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_shared_examples_are_opt_in_and_preserve_manual_unpublishing(self):
        self.seed()
        self.assertEqual(Asset.objects.filter(is_shared=True).count(), 3)
        item = Asset.objects.filter(is_shared=True).first()
        item.is_shared = False
        item.shared_at = None
        item.sharing_note = 'Owner changed this note'
        item.save(update_fields=['is_shared', 'shared_at', 'sharing_note'])
        self.seed()
        item.refresh_from_db()
        self.assertFalse(item.is_shared)
        self.assertEqual(item.sharing_note, 'Owner changed this note')
        self.assertEqual(Asset.objects.filter(is_shared=True).count(), 2)
        client = APIClient()
        client.force_authenticate(User.objects.get(username='demo_personel'))
        response = client.get('/api/assets/items/shared/')
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data.get('results', []) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(rows), 2)
        self.assertTrue(all('custom_data' not in row for row in rows))

    def test_identity_conflict_rolls_back_instead_of_overwriting_users(self):
        User.objects.create(username="demo_admin", email="someone-else@example.test")
        with self.assertRaises(CommandError):
            self.seed()
        self.assertFalse(Tenant.objects.exists())
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(User.objects.get().email, "someone-else@example.test")

    @override_settings(ROOT_URLCONF="config.demo_urls")
    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_samples_download_preview_and_import_using_real_endpoints(self):
        with TemporaryDirectory() as folder, override_settings(DEMO_FILES_DIR=folder):
            self.seed(write_samples=True)
            client = APIClient()
            client.force_authenticate(User.objects.get(username="demo_admin"))
            downloaded = client.get("/demo/downloads/katalog-gecerli.xlsx")
            self.assertEqual(downloaded.status_code, 200)
            contents = b"".join(downloaded.streaming_content)
            downloaded.close()
            response = client.post("/api/assets/types/catalog_preview/", {"file": SimpleUploadedFile("katalog.xlsx", contents)}, format="multipart")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["summary"], {"create": 3, "update": 0, "skip": 0, "error": 0})
            self.assertEqual(AssetType.objects.count(), 15)
            bad_contents = (Path(folder) / "katalog-hatali.xlsx").read_bytes()
            errors = client.post("/api/assets/types/catalog_preview/", {"file": SimpleUploadedFile("katalog.xlsx", bad_contents)}, format="multipart")
            self.assertEqual(errors.data["summary"]["error"], 3)
            self.assertIsNone(errors.data["preview_token"])
            user = User.objects.get(username="demo_personel")
            client.force_authenticate(user)
            inventory = (Path(folder) / "envanter-forklift.xlsx").read_bytes()
            preview = client.post("/api/assets/items/preview_import/", {"file": SimpleUploadedFile("forklift.xlsx", inventory)}, format="multipart")
            self.assertEqual(preview.status_code, 200, preview.data)
            self.assertEqual(preview.data["detected_template"]["asset_type_name"], "Forklift")
            before = Asset.objects.filter(tenant=user.tenant).count()
            imported = client.post("/api/assets/items/bulk_import/", {"file": SimpleUploadedFile("forklift.xlsx", inventory), "asset_type": preview.data["detected_template"]["asset_type_id"]}, format="multipart")
            self.assertEqual(imported.status_code, 200, imported.data)
            self.assertEqual(imported.data["success_count"], 2, imported.data)
            self.assertEqual(Asset.objects.filter(tenant=user.tenant).count(), before + 2)
            workbook = openpyxl.load_workbook(Path(folder) / "envanter-forklift-hatali.xlsx")
            self.assertEqual(workbook["_mapping"].sheet_state, "hidden")
            workbook.close()
            self.assertEqual(client.get("/demo/downloads/unknown.xlsx").status_code, 404)
            self.assertEqual(client.get("/demo/downloads/demo.sqlite3").status_code, 404)
            self.assertEqual(client.get("/demo/health/").json(), {"demo": True, "status": "ready"})
            self.assertEqual(client.get("/api/notifications/stream/").status_code, 204)


class DemoConfigurationTests(TestCase):
    def test_demo_ignores_production_service_environment(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgres://production:secret@live.example/database", "REDIS_URL": "redis://live.example/0", "DOMAIN": "live.example"}):
            module = importlib.import_module("config.demo_settings")
            module = importlib.reload(module)
        self.assertEqual(module.DATABASES["default"]["ENGINE"], "django.db.backends.sqlite3")
        self.assertEqual(module.DATABASES["default"]["NAME"], module.DEMO_ROOT / "demo.sqlite3")
        self.assertNotIn("live.example", str(module.DATABASES))
        self.assertEqual(module.EMAIL_BACKEND, "django.core.mail.backends.console.EmailBackend")
        self.assertEqual(module.CELERY_BROKER_URL, "memory://")
        self.assertFalse(module.SESSION_COOKIE_SECURE)
