"""Read-only storage visibility stays inside the existing global-admin boundary."""

import tempfile
import time
from pathlib import Path
from types import SimpleNamespace
from unittest import skipUnless
from unittest.mock import MagicMock, patch

from allauth.mfa.models import Authenticator
from django.db import DatabaseError, connection
from django.test import SimpleTestCase, override_settings
from django.utils.dateparse import parse_datetime
from rest_framework.test import APITestCase

from apps.tenants.models import Tenant
from apps.user.models import User, UserRole


UNAVAILABLE_DISK = {
    "status": "unavailable", "total_bytes": None, "used_bytes": None,
    "free_bytes": None, "used_percent": None,
}
DISK = {
    "status": "ok", "total_bytes": 1000, "used_bytes": 250,
    "free_bytes": 750, "used_percent": 25.0,
}
DATABASE = {
    "status": "ok", "engine": "postgresql", "size_bytes": 1234,
    "capacity_bytes": None, "used_percent": None,
}


class StorageAccessTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            "storage-global", "storage-global@example.test", "password"
        )
        self.client.force_authenticate(self.admin)

    def test_admin_endpoint_exists_and_returns_private_snapshot(self):
        response = self.client.get("/api/settings/storage/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.data),
            {"checked_at", "application_disk", "media_disk", "database"},
        )
        self.assertIsNotNone(parse_datetime(response.data["checked_at"]))
        self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_snapshot_uses_configured_directories_without_disclosing_paths(self):
        with override_settings(BASE_DIR="/private/app", MEDIA_ROOT="/private/uploads"):
            with patch("apps.settings.storage.disk_metrics", return_value=DISK) as disks:
                with patch("apps.settings.storage.database_metrics", return_value=DATABASE):
                    response = self.client.get("/api/settings/storage/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([call.args[0] for call in disks.call_args_list], [
            "/private/app", "/private/uploads",
        ])
        self.assertEqual(response.data["application_disk"], DISK)
        self.assertEqual(response.data["media_disk"], DISK)
        self.assertEqual(response.data["database"], DATABASE)
        self.assertNotIn("/private", str(response.data))

    def test_unauthorized_roles_are_denied_before_any_metrics_are_read(self):
        tenant = Tenant.objects.create(name="Storage private yard")
        personnel = User.objects.create_user("storage-personnel", tenant=tenant)
        tenant_admin = User.objects.create_user(
            "storage-tenant-admin", tenant=tenant, role=UserRole.TENANT_ADMIN
        )
        tenant_superuser = User.objects.create_user(
            "storage-tenant-superuser", tenant=tenant, is_superuser=True, is_staff=True
        )
        role_only = User.objects.create_user(
            "storage-role-label", role=UserRole.PLATFORM_ADMIN
        )
        inactive = User.objects.create_superuser(
            "storage-inactive", "storage-inactive@example.test", "password",
            is_active=False,
        )
        with patch("apps.settings.storage.disk_metrics") as disks:
            with patch("apps.settings.storage.database_metrics") as database:
                for user in (None, personnel, tenant_admin, tenant_superuser, role_only, inactive):
                    with self.subTest(user=getattr(user, "username", "anonymous")):
                        self.client.force_authenticate(user)
                        self.assertIn(
                            self.client.get("/api/settings/storage/").status_code, (401, 403)
                        )
                disks.assert_not_called()
                database.assert_not_called()

    def test_mutating_methods_are_rejected_without_reading_metrics(self):
        with patch("apps.settings.storage.disk_metrics") as disks:
            with patch("apps.settings.storage.database_metrics") as database:
                for method in ("post", "put", "patch", "delete"):
                    with self.subTest(method=method):
                        response = getattr(self.client, method)(
                            "/api/settings/storage/", {}, format="json"
                        )
                        self.assertEqual(response.status_code, 405)
                disks.assert_not_called()
                database.assert_not_called()

    def test_unavailable_disk_does_not_hide_other_results(self):
        with patch("apps.settings.storage.disk_metrics", side_effect=[UNAVAILABLE_DISK, DISK]):
            with patch("apps.settings.storage.database_metrics", return_value=DATABASE):
                response = self.client.get("/api/settings/storage/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["application_disk"], UNAVAILABLE_DISK)
        self.assertEqual(response.data["media_disk"], DISK)
        self.assertEqual(response.data["database"], DATABASE)

    def test_unavailable_database_does_not_hide_disk_results(self):
        unavailable = {
            **DATABASE, "status": "unavailable", "size_bytes": None,
        }
        with patch("apps.settings.storage.disk_metrics", return_value=DISK):
            with patch("apps.settings.storage.database_metrics", return_value=unavailable):
                response = self.client.get("/api/settings/storage/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["application_disk"], DISK)
        self.assertEqual(response.data["media_disk"], DISK)
        self.assertEqual(response.data["database"], unavailable)

    @override_settings(ADMIN_REQUIRE_MFA=True)
    def test_existing_mfa_policy_applies_before_metrics(self):
        self.client.force_authenticate(None)
        self.client.force_login(self.admin)
        with patch("apps.settings.storage.disk_metrics", return_value=DISK) as disks:
            with patch("apps.settings.storage.database_metrics", return_value=DATABASE):
                response = self.client.get("/api/settings/storage/")
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()["code"], "mfa_setup_required")
                disks.assert_not_called()
                factor = Authenticator.objects.create(user=self.admin, type="totp", data={})
                session = self.client.session
                session["account_authentication_methods"] = [{
                    "method": "mfa", "type": "totp", "id": factor.pk, "at": time.time(),
                }]
                session.save()
                self.assertEqual(self.client.get("/api/settings/storage/").status_code, 200)

    def test_snapshot_preserves_existing_accounts_and_settings(self):
        from .models import SmtpSettings

        before = list(User.objects.order_by("pk").values())
        before_settings = list(SmtpSettings.objects.values())
        response = self.client.get("/api/settings/storage/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(User.objects.order_by("pk").values()), before)
        self.assertEqual(list(SmtpSettings.objects.values()), before_settings)

    @skipUnless(connection.vendor == "postgresql", "Requires PostgreSQL transaction-abort semantics")
    def test_database_sql_failure_preserves_disk_snapshot_and_audit_event(self):
        from apps.audit.models import AuditEvent
        from .models import SmtpSettings

        before_users = list(User.objects.order_by("pk").values())
        before_settings = list(SmtpSettings.objects.values())
        failed_size_queries = []

        def fail_database_size(execute, sql, params, many, context):
            if sql == "SELECT pg_database_size(current_database())":
                failed_size_queries.append(sql)
                return execute("SELECT 1/0", params, many, context)
            return execute(sql, params, many, context)

        with tempfile.TemporaryDirectory() as directory:
            with override_settings(BASE_DIR=directory, MEDIA_ROOT=directory):
                with connection.execute_wrapper(fail_database_size):
                    response = self.client.get("/api/settings/storage/")

        self.assertEqual(failed_size_queries, ["SELECT pg_database_size(current_database())"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["database"], {
            "status": "unavailable", "engine": "postgresql", "size_bytes": None,
            "capacity_bytes": None, "used_percent": None,
        })
        for key in ("application_disk", "media_disk"):
            self.assertIn(response.data[key]["status"], ("ok", "warning", "critical"))
            self.assertGreater(response.data[key]["total_bytes"], 0)
        self.assertTrue(AuditEvent.objects.filter(
            request_id=response["X-Request-ID"], action="http.read", outcome="success",
            route="api/settings/storage/", status_code=200,
        ).exists())
        self.assertEqual(list(User.objects.order_by("pk").values()), before_users)
        self.assertEqual(list(SmtpSettings.objects.values()), before_settings)


class DiskMetricsTests(SimpleTestCase):
    def test_capacity_thresholds_use_unrounded_values(self):
        from .storage import disk_metrics

        with tempfile.TemporaryDirectory() as directory:
            for used, status in (
                (849_999, "ok"), (850_000, "warning"), (949_999, "warning"),
                (950_000, "critical"), (1_000_000, "critical"), (0, "ok"),
            ):
                with self.subTest(used=used):
                    usage = SimpleNamespace(total=1_000_000, used=used, free=1_000_000 - used)
                    with patch("apps.settings.storage.shutil.disk_usage", return_value=usage):
                        metrics = disk_metrics(directory)
                    self.assertEqual(metrics["status"], status)
                    self.assertEqual(metrics["total_bytes"], 1_000_000)
                    self.assertEqual(metrics["used_bytes"], used)
                    self.assertEqual(metrics["free_bytes"], 1_000_000 - used)
                    self.assertAlmostEqual(metrics["used_percent"], used / 10_000, places=1)

    def test_missing_directory_does_not_fall_back_to_parent_or_create_it(self):
        from .storage import disk_metrics

        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "missing-media"
            with patch("apps.settings.storage.shutil.disk_usage") as usage:
                self.assertEqual(disk_metrics(missing), UNAVAILABLE_DISK)
                usage.assert_not_called()
            self.assertFalse(missing.exists())

    def test_file_is_not_reported_as_media_filesystem(self):
        from .storage import disk_metrics

        with tempfile.NamedTemporaryFile() as file:
            with patch("apps.settings.storage.shutil.disk_usage") as usage:
                self.assertEqual(disk_metrics(file.name), UNAVAILABLE_DISK)
                usage.assert_not_called()

    def test_disk_errors_are_sanitized_and_do_not_claim_zero_usage(self):
        from .storage import disk_metrics

        with tempfile.TemporaryDirectory() as directory:
            with patch("apps.settings.storage.shutil.disk_usage", side_effect=OSError("private-volume-secret")):
                self.assertEqual(disk_metrics(directory), UNAVAILABLE_DISK)

    def test_zero_or_invalid_total_is_unavailable(self):
        from .storage import disk_metrics

        with tempfile.TemporaryDirectory() as directory:
            for total, used, free in ((0, 0, 0), (-1, 0, 0), (100, -1, 101), (100, 101, -1)):
                with self.subTest(total=total, used=used, free=free):
                    usage = SimpleNamespace(total=total, used=used, free=free)
                    with patch("apps.settings.storage.shutil.disk_usage", return_value=usage):
                        self.assertEqual(disk_metrics(directory), UNAVAILABLE_DISK)


class DatabaseMetricsTests(SimpleTestCase):
    def connection(self, vendor, name="private-database-name"):
        connection = MagicMock()
        connection.vendor = vendor
        connection.settings_dict = {"NAME": name}
        return connection

    def assert_unavailable(self, metrics, engine):
        self.assertEqual(metrics, {
            "status": "unavailable", "engine": engine, "size_bytes": None,
            "capacity_bytes": None, "used_percent": None,
        })

    def test_postgresql_reads_only_current_database_size(self):
        from .storage import database_metrics

        connection = self.connection("postgresql")
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = (1234,)
        with patch("apps.settings.storage.connection", connection):
            self.assertEqual(database_metrics(), DATABASE)
        cursor.execute.assert_called_once_with("SELECT pg_database_size(current_database())")
        cursor.fetchone.assert_called_once_with()

    def test_postgresql_query_failure_is_sanitized_and_capacity_unknown(self):
        from .storage import database_metrics

        connection = self.connection("postgresql")
        connection.cursor.side_effect = DatabaseError("private-password-and-path")
        with patch("apps.settings.storage.connection", connection):
            metrics = database_metrics()
        self.assert_unavailable(metrics, "postgresql")
        self.assertNotIn("private", str(metrics))

    def test_invalid_postgresql_size_is_unavailable(self):
        from .storage import database_metrics

        connection = self.connection("postgresql")
        cursor = connection.cursor.return_value.__enter__.return_value
        for result in (None, (), (None,), (-1,), (True,), ("1234",)):
            with self.subTest(result=result):
                cursor.fetchone.return_value = result
                with patch("apps.settings.storage.connection", connection):
                    self.assert_unavailable(database_metrics(), "postgresql")

    def test_sqlite_reports_actual_file_size_without_opening_or_changing_file(self):
        from .storage import database_metrics

        with tempfile.NamedTemporaryFile() as file:
            file.write(b"sqlite-test-bytes")
            file.flush()
            before = Path(file.name).read_bytes()
            with patch("apps.settings.storage.connection", self.connection("sqlite", file.name)):
                metrics = database_metrics()
            self.assertEqual(metrics, {
                "status": "ok", "engine": "sqlite", "size_bytes": len(before),
                "capacity_bytes": None, "used_percent": None,
            })
            self.assertEqual(Path(file.name).read_bytes(), before)

    def test_sqlite_memory_uri_missing_file_and_directory_are_unavailable(self):
        from .storage import database_metrics

        with tempfile.TemporaryDirectory() as directory:
            for name in (":memory:", "file:memorydb?mode=memory&cache=shared", "", None, directory, Path(directory) / "missing.sqlite3"):
                with self.subTest(name=name):
                    with patch("apps.settings.storage.connection", self.connection("sqlite", name)):
                        self.assert_unavailable(database_metrics(), "sqlite")
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_sqlite_stat_failure_is_sanitized(self):
        from .storage import database_metrics

        with patch("apps.settings.storage.connection", self.connection("sqlite", "/private/db.sqlite3")):
            with patch("apps.settings.storage.Path.stat", side_effect=OSError("private-mount")):
                self.assert_unavailable(database_metrics(), "sqlite")

    def test_unknown_engine_does_not_execute_queries(self):
        from .storage import database_metrics

        connection = self.connection("mysql")
        with patch("apps.settings.storage.connection", connection):
            self.assert_unavailable(database_metrics(), "other")
        connection.cursor.assert_not_called()
