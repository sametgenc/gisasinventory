"""Synthetic stock exports stay private, isolated and row based."""

from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import skipUnless
from unittest.mock import patch

import openpyxl
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import TestCase, override_settings

from apps.assets.management.commands.seed_stock_sample import (
    SAMPLE_DESCRIPTION,
    SOURCE_HEADERS,
    STOCK_CATALOG_CODE,
    STOCK_TENANT_NAME,
    STOCK_TENANT_SLUG,
    STOCK_TYPE_ID,
    stock_record_id,
)
from apps.assets.models import Asset, AssetType
from apps.tenants.models import Tenant
from apps.user.models import User


@override_settings(DEMO_MODE=True, DEMO_ALLOW_IN_MEMORY_SEED=True)
class StockSampleDemoTests(TestCase):
    def setUp(self):
        self.folder = TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.path = Path(self.folder.name) / "stock.xlsx"

    def write_export(self, rows=None, headers=SOURCE_HEADERS):
        if rows is None:
            materials = [
                ('ORNEK-STOK-01', 'Örnek yürüme platformu', 500),
                ('ORNEK-STOK-02', 'Örnek güvenlik bariyeri', 250),
                ('ORNEK-STOK-03', 'Örnek sıfır stoklu malzeme', 0),
            ]
            rows = [
                [f"example-source-{number:02}", "Örnek tersane", "2025-01-01 10:00", code, quantity, name]
                for number, (code, name, quantity) in enumerate(materials, start=1)
            ]
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = "Örnek stok"
        sheet.append(headers)
        for row in rows:
            sheet.append(row)
        workbook.save(self.path)
        workbook.close()
        return rows

    def seed(self, **options):
        call_command("seed_stock_sample", file=str(self.path), stdout=StringIO(), **options)

    def assert_no_sample_data(self):
        self.assertFalse(Tenant.objects.exists())
        self.assertFalse(AssetType.objects.exists())
        self.assertFalse(Asset.objects.exists())

    @override_settings(DEMO_MODE=False)
    def test_regular_settings_are_rejected_before_reading_or_writing(self):
        with patch("apps.assets.management.commands.seed_stock_sample.read_stock_export") as read_file:
            with self.assertRaises(CommandError):
                self.seed()
        read_file.assert_not_called()
        self.assert_no_sample_data()

    @override_settings(DEMO_ALLOW_IN_MEMORY_SEED=False, DEMO_DATABASE_PATH="/wrong/demo.sqlite3")
    def test_wrong_database_is_rejected_even_with_demo_flag(self):
        self.write_export()
        with self.assertRaises(CommandError):
            self.seed()
        self.assert_no_sample_data()

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_synthetic_export_creates_private_stock_lines_without_exploding_pieces(self):
        rows = self.write_export()
        original_bytes = self.path.read_bytes()
        admin = User.objects.create(username="demo_admin", role="platform_admin")

        self.seed()

        self.assertEqual(Asset.objects.count(), 3)
        self.assertEqual(Tenant.objects.count(), 1)
        self.assertEqual(AssetType.objects.count(), 1)
        tenant = Tenant.objects.get(slug=STOCK_TENANT_SLUG)
        self.assertEqual(tenant.name, STOCK_TENANT_NAME)
        self.assertIn("örnek", tenant.name.lower())
        asset_type = AssetType.objects.get(catalog_code=STOCK_CATALOG_CODE)
        self.assertEqual(asset_type.pk, STOCK_TYPE_ID)
        self.assertEqual(asset_type.tracking_mode, "stock")
        self.assertEqual(asset_type.category_code, "A")
        self.assertEqual(asset_type.sharing_class, "B")
        self.assertFalse(Asset.objects.filter(is_shared=True).exists())
        self.assertEqual({record.created_by_id for record in Asset.objects.all()}, {admin.pk})
        self.assertEqual(sum(record.custom_data["quantity"] for record in Asset.objects.all()), 750)
        zero = Asset.objects.get(pk=stock_record_id(rows[2][3]))
        self.assertEqual(zero.custom_data["quantity"], 0)
        first = Asset.objects.get(pk=stock_record_id(rows[0][3]))
        self.assertEqual(first.custom_data["source_record_id"], "example-source-01")
        self.assertEqual(first.custom_data["source_created_at"], "2025-01-01 10:00")
        self.assertEqual(first.custom_data["original_shipyard"], "Örnek tersane")
        self.assertNotEqual(str(first.pk), rows[0][0])
        self.assertNotEqual(first.created_at.strftime("%Y-%m-%d %H:%M"), rows[0][2])
        self.assertEqual(self.path.read_bytes(), original_bytes)
        self.assertEqual(User.objects.count(), 1)

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_rerun_preserves_manual_edits_and_sharing_choices(self):
        rows = self.write_export()
        self.seed()
        item = Asset.objects.get(pk=stock_record_id(rows[0][3]))
        item.custom_data["material_code"] = "MANUAL-CODE"
        item.custom_data["material_name"] = "Kullanıcının seçtiği ad"
        item.custom_data["quantity"] = 42
        item.is_shared = True
        item.sharing_note = "Sahibinin paylaşım kararı"
        item.save()

        self.seed()

        item.refresh_from_db()
        self.assertEqual(Asset.objects.count(), 3)
        self.assertEqual(item.custom_data["material_code"], "MANUAL-CODE")
        self.assertEqual(item.custom_data["material_name"], "Kullanıcının seçtiği ad")
        self.assertEqual(item.custom_data["quantity"], 42)
        self.assertTrue(item.is_shared)
        self.assertEqual(item.sharing_note, "Sahibinin paylaşım kararı")

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_explicit_synthetic_tenant_slug_reuses_records_and_preserves_manual_quantity(self):
        rows = self.write_export()
        tenant_slug = "synthetic-existing-stock"
        tenant_name = "Örnek özel stok tersanesi"
        self.seed(tenant_slug=tenant_slug, tenant_name=tenant_name)
        original_ids = set(Asset.objects.values_list("pk", flat=True))
        self.assertEqual(original_ids, {stock_record_id(row[3], tenant_slug) for row in rows})
        item = Asset.objects.get(pk=stock_record_id(rows[0][3], tenant_slug))
        item.custom_data["quantity"] = 17
        item.save()

        self.seed(tenant_slug=tenant_slug)

        item.refresh_from_db()
        tenant = Tenant.objects.get()
        self.assertEqual(tenant.slug, tenant_slug)
        self.assertEqual(tenant.name, tenant_name)
        self.assertEqual(item.tenant_id, tenant.pk)
        self.assertEqual(item.custom_data["quantity"], 17)
        self.assertEqual(set(Asset.objects.values_list("pk", flat=True)), original_ids)
        self.assertEqual(AssetType.objects.count(), 1)
        self.assertFalse(User.objects.exists())

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_slug_only_rerun_preserves_manually_renamed_tenant_and_stock(self):
        rows = self.write_export()
        tenant_slug = "synthetic-legacy-stock"
        self.seed(tenant_slug=tenant_slug, tenant_name="Örnek özel stok tersanesi")
        original_ids = set(Asset.objects.values_list("pk", flat=True))
        tenant = Tenant.objects.get(slug=tenant_slug)
        tenant.name = "Yerel Stok Tersanesi"
        tenant.save()
        item = Asset.objects.get(pk=stock_record_id(rows[0][3], tenant_slug))
        item.custom_data["quantity"] = 17
        item.save()

        self.seed(tenant_slug=tenant_slug)

        tenant.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(tenant.name, "Yerel Stok Tersanesi")
        self.assertEqual(tenant.slug, tenant_slug)
        self.assertEqual(item.tenant_id, tenant.pk)
        self.assertEqual(item.custom_data["quantity"], 17)
        self.assertEqual(set(Asset.objects.values_list("pk", flat=True)), original_ids)
        self.assertEqual(Tenant.objects.count(), 1)
        self.assertEqual(AssetType.objects.count(), 1)
        self.assertFalse(User.objects.exists())

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_repeated_explicit_unmarked_tenant_name_preserves_stock(self):
        rows = self.write_export()
        options = {"tenant_slug": "synthetic-unmarked-stock", "tenant_name": "Sentetik Stok Tersanesi"}
        self.seed(**options)
        original_ids = set(Asset.objects.values_list("pk", flat=True))
        item = Asset.objects.get(pk=stock_record_id(rows[0][3], options["tenant_slug"]))
        item.custom_data["quantity"] = 17
        item.save()

        self.seed(**options)

        item.refresh_from_db()
        self.assertEqual(Tenant.objects.get().name, "Sentetik Stok Tersanesi — örnek stok")
        self.assertEqual(item.custom_data["quantity"], 17)
        self.assertEqual(set(Asset.objects.values_list("pk", flat=True)), original_ids)
        self.assertEqual(AssetType.objects.count(), 1)
        self.assertFalse(User.objects.exists())

    def test_last_invalid_line_prevents_all_mutation(self):
        for value in (-1, 1.5, True, "NaN", 2 ** 53):
            with self.subTest(quantity=value):
                rows = self.write_export()
                rows[-1][4] = value
                self.write_export(rows)
                with self.assertRaises(CommandError):
                    self.seed()
                self.assert_no_sample_data()

    def test_missing_names_duplicate_codes_and_mixed_shipyards_reject_whole_file(self):
        for column, value in ((5, None), (3, "ORNEK-STOK-01"), (1, "Başka tersane"), (1, None)):
            with self.subTest(column=column, value=value):
                rows = self.write_export()
                rows[-1][column] = value
                self.write_export(rows)
                with self.assertRaises(CommandError):
                    self.seed()
                self.assert_no_sample_data()

    def test_formulas_headers_and_empty_exports_are_rejected(self):
        examples = [
            [["example-source-01", "Örnek tersane", "2025-01-01 10:00", "ORNEK-STOK-01", "=1+1", "Örnek yürüme platformu"]],
            [],
        ]
        for rows in examples:
            with self.subTest(rows=rows):
                self.write_export(rows)
                with self.assertRaises(CommandError):
                    self.seed()
                self.assert_no_sample_data()
        self.write_export(headers=("ID", "Tersane", "Tarih", "Kod", "Adet", "İsim"))
        with self.assertRaises(CommandError):
            self.seed()
        self.assert_no_sample_data()

    def test_existing_tenant_identity_conflict_is_rejected_without_overwrite(self):
        self.write_export()
        tenant = Tenant.objects.create(slug=STOCK_TENANT_SLUG, name="Başka kayıt")
        with self.assertRaises(CommandError):
            self.seed()
        tenant.refresh_from_db()
        self.assertEqual(tenant.name, "Başka kayıt")
        self.assertEqual(Tenant.objects.count(), 1)
        self.assertFalse(AssetType.objects.exists())
        self.assertFalse(Asset.objects.exists())

    def test_existing_type_conflict_rolls_back_new_sample_tenant(self):
        self.write_export()
        asset_type = AssetType.objects.create(id=STOCK_TYPE_ID, name="Mevcut bireysel tür")
        with self.assertRaises(CommandError):
            self.seed()
        asset_type.refresh_from_db()
        self.assertEqual(asset_type.tracking_mode, "individual")
        self.assertFalse(Tenant.objects.exists())
        self.assertFalse(Asset.objects.exists())

    def test_existing_record_in_another_tenant_rolls_back_new_records(self):
        rows = self.write_export()
        foreign_tenant = Tenant.objects.create(name="Başka tersane")
        foreign_type = AssetType.objects.create(name="Başka tür")
        asset = Asset.objects.create(
            id=stock_record_id(rows[-1][3]), tenant=foreign_tenant, asset_type=foreign_type,
            custom_data={"notes": "Mevcut kayıt"},
        )
        with self.assertRaises(CommandError):
            self.seed()
        self.assertEqual(Asset.objects.count(), 1)
        self.assertEqual(Tenant.objects.count(), 1)
        self.assertEqual(AssetType.objects.count(), 1)
        asset.refresh_from_db()
        self.assertEqual(asset.custom_data, {"notes": "Mevcut kayıt"})

    @skipUnless(connection.vendor == "sqlite", "Demo seeding intentionally requires isolated SQLite.")
    def test_existing_sample_tenant_and_type_do_not_create_accounts(self):
        self.write_export()
        self.seed()
        self.seed()
        self.assertEqual(Tenant.objects.get().description, SAMPLE_DESCRIPTION)
        self.assertFalse(User.objects.exists())
        self.assertEqual(Asset.objects.count(), 3)
