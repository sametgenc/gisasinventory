"""PostgreSQL proof for serialized approvals and compatible actor locks."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier, Event
from unittest import skipUnless
from unittest.mock import patch

from django.apps import apps
from django.db import connection, connections, transaction
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.notifications.models import Notification
from apps.tenants.models import Tenant
from apps.user.models import User

from .models import Asset, AssetType
from .usage import create_usage_request, reservation_peak, transition_usage_request
from .usage_models import SharedUsageRequest


@skipUnless(connection.vendor == "postgresql", "Row-lock concurrency requires PostgreSQL.")
@override_settings(CROSS_TENANT_SHARING_ENABLED=True)
class SharedUsageConcurrencyTests(TransactionTestCase):
    """Each worker has its own connection; SQLite cannot prove these invariants."""

    # Audit evidence has no inventory/user foreign keys. Keep its real append-only
    # PostgreSQL guards enabled and let test-database destruction remove evidence;
    # TransactionTestCase must not TRUNCATE that table while clearing app fixtures.
    available_apps = [app.name for app in apps.get_app_configs() if app.label != "audit"]

    def setUp(self):
        self.today = timezone.localdate()
        self.owner = Tenant.objects.create(name="Concurrent owner sample yard")
        self.requester = Tenant.objects.create(name="Concurrent requester sample yard")
        self.manager = User.objects.create(
            username="concurrent-owner-one", tenant=self.owner, role="tenant_admin",
        )
        self.second_manager = User.objects.create(
            username="concurrent-owner-two", tenant=self.owner, role="tenant_admin",
        )
        self.member = User.objects.create(username="concurrent-requester", tenant=self.requester)
        asset_type = AssetType.objects.create(
            name="Concurrent sample stock", tracking_mode="stock", schema=[
                {"key": "pieces", "label": "Adet", "type": "number", "required": False, "role": "quantity"},
            ],
        )
        self.asset = Asset.objects.create(
            tenant=self.owner, asset_type=asset_type, custom_data={"pieces": 50},
            is_shared=True, sharing_title="Concurrent sample equipment", sharing_quantity=20,
            sharing_availability="available",
        )

    def new_pending_request(self):
        return SharedUsageRequest.objects.create(
            asset=self.asset, owner_tenant=self.owner, requester_tenant=self.requester,
            requested_by=self.member, listing_snapshot={"title": self.asset.sharing_title},
            start_date=self.today, end_date=self.today + timedelta(days=2), quantity=20,
        )

    @staticmethod
    def run_on_separate_connection(operation):
        """Bound failures so a lock regression raises rather than hangs the suite."""
        connections["default"].close()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '5s'")
                cursor.execute("SET statement_timeout = '15s'")
            return operation()
        finally:
            connections["default"].close()

    @staticmethod
    def locked_actor(user_id):
        # Match SecurityAccessMiddleware: membership is stable while foreign-key
        # references from another shipyard remain compatible with this lock.
        return User.objects.select_for_update(no_key=True).get(pk=user_id)

    def test_simultaneous_approvals_reserve_capacity_once_and_leave_loser_unchanged(self):
        requests = [self.new_pending_request(), self.new_pending_request()]
        both_actors_locked = Barrier(2)

        def approve(user_id, usage_id):
            def operation():
                with transaction.atomic():
                    actor = self.locked_actor(user_id)
                    both_actors_locked.wait(timeout=5)
                    client = APIClient()
                    client.force_authenticate(actor)
                    response = client.post(
                        f"/api/assets/usage-requests/{usage_id}/approve/", {}, format="json",
                    )
                    return response.status_code, response.data

            return self.run_on_separate_connection(operation)

        # Keep durable notification inserts real; only suppress external dispatch.
        with patch("apps.notifications.services.dispatch_notification"), ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(approve, user.pk, usage.pk)
                for user, usage in zip((self.manager, self.second_manager), requests)
            ]
            results = [future.result(timeout=20) for future in futures]

        self.assertEqual(sorted(status for status, _data in results), [200, 409], results)
        conflict = next(data for status, data in results if status == 409)
        self.assertEqual(int(conflict["available_quantity"]), 0)
        approved = SharedUsageRequest.objects.get(status="approved")
        pending = SharedUsageRequest.objects.get(status="requested")
        self.assertEqual(approved.quantity, 20)
        self.assertIn(approved.approved_by_id, [self.manager.pk, self.second_manager.pk])
        self.assertIsNone(pending.approved_by_id)
        self.assertIsNone(pending.approved_at)
        self.assertEqual(reservation_peak(self.asset), 20)
        self.assertEqual(
            Notification.objects.filter(deduplication_key=f"usage:{approved.pk}:approved").count(), 3,
        )
        self.assertFalse(
            Notification.objects.filter(deduplication_key=f"usage:{pending.pk}:approved").exists(),
        )

    def test_error_after_status_save_rolls_back_approval_and_notifications_before_retry(self):
        usage = self.new_pending_request()
        from .usage_notifications import notify_usage_status

        def save_events_then_fail(updated):
            notify_usage_status(updated)
            raise RuntimeError("Injected failure after approval events")

        with patch("apps.notifications.services.dispatch_notification") as dispatch:
            with patch("apps.assets.usage.notify_usage_status", side_effect=save_events_then_fail):
                with self.assertRaisesRegex(RuntimeError, "Injected failure"):
                    transition_usage_request(self.manager, usage.pk, "approve")
            usage.refresh_from_db()
            self.assertEqual(usage.status, "requested")
            self.assertIsNone(usage.approved_at)
            self.assertIsNone(usage.approved_by_id)
            self.assertEqual(reservation_peak(self.asset), 0)
            self.assertFalse(Notification.objects.exists())
            dispatch.assert_not_called()
            transition_usage_request(self.manager, usage.pk, "approve")

        usage.refresh_from_db()
        self.assertEqual(usage.status, "approved")
        self.assertEqual(reservation_peak(self.asset), 20)
        self.assertEqual(Notification.objects.count(), 3)

    def test_requester_actor_lock_and_approval_notification_foreign_key_do_not_deadlock(self):
        usage = self.new_pending_request()
        asset_locked = Event()
        requester_locked = Event()
        requester_entering_asset_lock = Event()

        def approve():
            def operation():
                with transaction.atomic():
                    actor = self.locked_actor(self.manager.pk)
                    Asset.objects.select_for_update().get(pk=self.asset.pk)
                    asset_locked.set()
                    if not requester_locked.wait(timeout=5):
                        raise AssertionError("Requester did not acquire its actor lock")
                    if not requester_entering_asset_lock.wait(timeout=5):
                        raise AssertionError("Requester did not reach the held asset")
                    return transition_usage_request(actor, usage.pk, "approve").pk

            return self.run_on_separate_connection(operation)

        def request():
            def operation():
                if not asset_locked.wait(timeout=5):
                    raise AssertionError("Approver did not acquire the asset lock")
                with transaction.atomic():
                    actor = self.locked_actor(self.member.pk)
                    requester_locked.set()

                    def signal_asset_lock(execute, sql, params, many, context):
                        if '"assets_asset"' in sql and "FOR UPDATE" in sql:
                            requester_entering_asset_lock.set()
                        return execute(sql, params, many, context)

                    with connection.execute_wrapper(signal_asset_lock):
                        return create_usage_request(
                            actor, asset_id=self.asset.pk, start_date=self.today,
                            end_date=self.today + timedelta(days=2), quantity=20,
                        ).pk

            return self.run_on_separate_connection(operation)

        with patch("apps.notifications.services.dispatch_notification"), ThreadPoolExecutor(max_workers=2) as pool:
            approval = pool.submit(approve)
            request_creation = pool.submit(request)
            approved_id = approval.result(timeout=20)
            new_id = request_creation.result(timeout=20)

        self.assertEqual(approved_id, usage.pk)
        self.assertEqual(SharedUsageRequest.objects.get(pk=approved_id).status, "approved")
        self.assertEqual(SharedUsageRequest.objects.get(pk=new_id).status, "requested")
        self.assertEqual(reservation_peak(self.asset), 20)
        self.assertTrue(Notification.objects.filter(
            user=self.member, deduplication_key=f"usage:{approved_id}:approved",
        ).exists())
        self.assertTrue(Notification.objects.filter(
            user=self.manager, deduplication_key=f"usage:{new_id}:requested",
        ).exists())
