"""Behavioral proof for free shared use, shipyard scope and capacity safety."""

import json
from datetime import date, timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.notifications.models import Notification
from apps.notifications.permissions import visible_notifications
from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Asset, AssetType
from .usage import reservation_peak, validate_inventory_usage_change, validate_inventory_usage_delete
from .usage_models import SharedUsageRequest
from .validation import MAX_STOCK_QUANTITY


@override_settings(CROSS_TENANT_SHARING_ENABLED=True)
class SharedUsageTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.owner = Tenant.objects.create(name="Usage owner sample yard")
        self.requester = Tenant.objects.create(name="Usage requester sample yard")
        self.foreign = Tenant.objects.create(name="Usage unrelated sample yard")
        self.manager = User.objects.create(username="usage-owner-manager", role="tenant_admin", tenant=self.owner)
        self.owner_member = User.objects.create(username="usage-owner-member", tenant=self.owner)
        self.member = User.objects.create(username="usage-requester", tenant=self.requester)
        self.requester_manager = User.objects.create(username="usage-requester-manager", role="tenant_admin", tenant=self.requester)
        self.foreign_manager = User.objects.create(username="usage-other-manager", role="tenant_admin", tenant=self.foreign)
        self.global_admin = User.objects.create(username="usage-global-admin", is_superuser=True, role="platform_admin")
        self.asset_type = AssetType.objects.create(name="Usage scaffold stock", tracking_mode="stock", schema=[
            {"key": "pieces", "label": "Adet", "type": "number", "required": False, "role": "quantity"},
            {"key": "private_note", "label": "İç not", "type": "text", "required": False},
        ])
        self.asset = Asset.objects.create(
            tenant=self.owner, asset_type=self.asset_type,
            custom_data={"pieces": 50, "private_note": "PRIVATE-INVENTORY-SECRET"},
            is_shared=True, sharing_title="Shared scaffold clamps", sharing_quantity=20,
            sharing_capacity="Fits sample scaffold", sharing_note="Agree collection with owner",
            sharing_availability="available",
        )
        self.client.force_authenticate(self.member)

    def request_usage(self, *, asset=None, quantity=10, start=None, end=None, **extra):
        return self.client.post("/api/assets/usage-requests/", {
            "asset": str((asset or self.asset).pk), "start_date": str(start or self.today),
            "end_date": str(end or self.today + timedelta(days=2)), "quantity": quantity,
            "purpose": "PRIVATE-REQUEST-PURPOSE", **extra,
        }, format="json")

    def new_request(self, **kwargs):
        self.client.force_authenticate(self.member)
        response = self.request_usage(**kwargs)
        self.assertEqual(response.status_code, 201, response.data)
        return SharedUsageRequest.objects.get(pk=response.data["id"])

    def action(self, usage, action, user=None, **values):
        self.client.force_authenticate(user or self.manager)
        return self.client.post(f"/api/assets/usage-requests/{usage.pk}/{action}/", values, format="json")

    def test_request_has_public_snapshot_and_never_accepts_owner_or_price(self):
        response = self.request_usage(quantity=10)
        self.assertEqual(response.status_code, 201, response.data)
        usage = SharedUsageRequest.objects.get(pk=response.data["id"])
        self.assertEqual(usage.owner_tenant, self.owner)
        self.assertEqual(usage.requester_tenant, self.requester)
        self.assertEqual(usage.requested_by, self.member)
        self.assertEqual(usage.listing_snapshot["title"], "Shared scaffold clamps")
        snapshot = json.dumps(usage.listing_snapshot)
        for private in ("PRIVATE-INVENTORY-SECRET", "PRIVATE-REQUEST-PURPOSE", "custom_data", "pieces", "50"):
            self.assertNotIn(private, snapshot)
        for forbidden in ("owner_tenant", "requester_tenant", "status", "approved_by", "listing_snapshot", "price"):
            with self.subTest(field=forbidden):
                self.assertEqual(self.request_usage(**{forbidden: "injected"}).status_code, 400)

    def test_owner_manager_approves_hands_over_and_receives(self):
        usage = self.new_request()
        self.assertEqual(self.action(usage, "approve", note="Collection agreed").status_code, 200)
        usage.refresh_from_db()
        self.assertEqual(usage.approved_by, self.manager)
        self.assertEqual(usage.decision_note, "Collection agreed")
        self.assertEqual(self.action(usage, "handover").status_code, 200)
        usage.refresh_from_db()
        self.assertEqual(usage.handed_over_by, self.manager)
        self.assertEqual(usage.status, "active")
        self.assertEqual(self.action(usage, "receive").status_code, 200)
        usage.refresh_from_db()
        self.assertEqual(usage.status, "returned")
        self.assertEqual(usage.received_by, self.manager)
        self.assertIsNotNone(usage.returned_at)
        self.assertEqual(reservation_peak(self.asset), 0)

    def test_platform_other_shipyard_and_ordinary_owner_cannot_approve(self):
        usage = self.new_request()
        for user, expected in ((self.global_admin, 403), (self.foreign_manager, 404),
                               (self.member, 403), (self.requester_manager, 403), (self.owner_member, 403)):
            with self.subTest(user=user.username):
                self.assertEqual(self.action(usage, "approve", user).status_code, expected)
        usage.refresh_from_db()
        self.assertEqual(usage.status, "requested")

    def test_scope_list_details_directions_and_pagination(self):
        usage = self.new_request()
        for user in (self.member, self.manager):
            self.client.force_authenticate(user)
            response = self.client.get("/api/assets/usage-requests/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["count"], 1)
            self.assertEqual(str(response.data["results"][0]["id"]), str(usage.pk))
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get("/api/assets/usage-requests/?direction=received").data["count"], 0)
        self.assertEqual(self.client.get("/api/assets/usage-requests/?direction=sent").data["count"], 1)
        self.client.force_authenticate(self.foreign_manager)
        self.assertEqual(self.client.get("/api/assets/usage-requests/").data["count"], 0)
        self.assertEqual(self.client.get(f"/api/assets/usage-requests/{usage.pk}/").status_code, 404)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get("/api/assets/usage-requests/?direction=unknown").status_code, 400)
        self.assertEqual(self.client.get("/api/assets/usage-requests/?status=unknown").status_code, 400)
        for _ in range(25):
            self.new_request(quantity=1)
        response = self.client.get("/api/assets/usage-requests/")
        self.assertEqual(len(response.data["results"]), 24)
        self.assertIsNotNone(response.data["next"])

    def test_membership_move_and_inactive_users_lose_access(self):
        usage = self.new_request()
        self.member.tenant = self.foreign
        self.member.save()
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(f"/api/assets/usage-requests/{usage.pk}/").status_code, 404)
        self.assertEqual(self.action(usage, "cancel", self.member).status_code, 404)
        self.manager.is_active = False
        self.manager.save()
        self.assertEqual(self.action(usage, "approve").status_code, 403)

    def test_current_server_role_controls_actions(self):
        usage = self.new_request()
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.get(f"/api/assets/usage-requests/{usage.pk}/").data["allowed_actions"], ["approve", "reject"])
        self.manager.role = "tenant_user"
        self.manager.save()
        self.assertEqual(self.action(usage, "approve").status_code, 403)
        self.assertEqual(self.client.get(f"/api/assets/usage-requests/{usage.pk}/").data["allowed_actions"], [])

    def test_requester_creator_or_manager_can_cancel_but_other_member_cannot(self):
        usage = self.new_request()
        colleague = User.objects.create(username="usage-requester-colleague", tenant=self.requester)
        self.assertEqual(self.action(usage, "cancel", colleague).status_code, 403)
        self.assertEqual(self.action(usage, "cancel", self.requester_manager).status_code, 200)
        usage.refresh_from_db()
        self.assertEqual(usage.status, "cancelled")
        second = self.new_request()
        self.assertEqual(self.action(second, "cancel", self.member).status_code, 200)

    def test_active_request_cannot_cancel_or_skip_return(self):
        usage = self.new_request()
        self.assertEqual(self.action(usage, "receive").status_code, 409)
        self.action(usage, "approve")
        self.action(usage, "handover")
        self.assertEqual(self.action(usage, "cancel", self.member).status_code, 409)
        self.assertEqual(self.action(usage, "cancel").status_code, 409)
        self.assertEqual(self.action(usage, "receive", self.member).status_code, 403)

    def test_required_field_blocks_request_approval_handover_but_not_return(self):
        usage = self.new_request()
        self.asset_type.schema.append({"key": "inspection", "label": "Kontrol", "type": "text", "required": True})
        self.asset_type.save()
        self.assertEqual(self.action(usage, "approve").status_code, 409)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.request_usage().status_code, 409)
        self.asset.custom_data["inspection"] = "Checked"
        self.asset.save()
        self.action(usage, "approve")
        self.asset.custom_data.pop("inspection")
        self.asset.save()
        self.assertEqual(self.action(usage, "handover").status_code, 409)
        self.asset.custom_data["inspection"] = "Checked"
        self.asset.save()
        self.action(usage, "handover")
        self.asset.custom_data.pop("inspection")
        self.asset.save()
        self.assertEqual(self.action(usage, "receive").status_code, 200)

    def test_pending_requests_do_not_reserve_but_overlapping_approvals_do(self):
        first = self.new_request(quantity=15)
        second = self.new_request(quantity=10)
        self.assertEqual(reservation_peak(self.asset), 0)
        self.assertEqual(self.action(first, "approve").status_code, 200)
        response = self.action(second, "approve")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(int(response.data["available_quantity"]), 5)
        self.assertNotIn("50", json.dumps(response.data))
        second.refresh_from_db()
        self.assertEqual(second.status, "requested")

    def test_peak_counts_overlaps_not_sum_of_disjoint_reservations(self):
        first = self.new_request(quantity=10, start=self.today, end=self.today)
        second = self.new_request(quantity=10, start=self.today + timedelta(days=1), end=self.today + timedelta(days=1))
        third = self.new_request(quantity=10, start=self.today, end=self.today + timedelta(days=1))
        for usage in (first, second, third):
            self.assertEqual(self.action(usage, "approve").status_code, 200)
        self.assertEqual(reservation_peak(self.asset), 20)

    def test_end_dates_are_inclusive(self):
        first = self.new_request(quantity=20, end=self.today + timedelta(days=1))
        second = self.new_request(quantity=1, start=self.today + timedelta(days=1), end=self.today + timedelta(days=2))
        self.action(first, "approve")
        self.assertEqual(self.action(second, "approve").status_code, 409)

    def test_active_unreturned_remains_reserved_after_planned_end(self):
        first = self.new_request(quantity=20, start=self.today, end=self.today)
        self.action(first, "approve")
        self.action(first, "handover")
        tomorrow = self.today + timedelta(days=1)
        with patch("apps.assets.usage.timezone.localdate", return_value=tomorrow):
            self.assertEqual(reservation_peak(self.asset), 20)
            second = self.new_request(quantity=1, start=tomorrow, end=tomorrow)
            self.assertEqual(self.action(second, "approve").status_code, 409)
            self.assertEqual(self.action(first, "receive").status_code, 200)
            self.assertEqual(self.action(second, "approve").status_code, 200)

    def test_future_approval_cannot_handover_until_overdue_equipment_returns(self):
        tomorrow = self.today + timedelta(days=1)
        first = self.new_request(quantity=20, end=self.today)
        second = self.new_request(quantity=20, start=tomorrow, end=tomorrow)
        self.assertEqual(self.action(first, "approve").status_code, 200)
        self.assertEqual(self.action(second, "approve").status_code, 200)
        self.assertEqual(self.action(first, "handover").status_code, 200)
        with patch("apps.assets.usage.timezone.localdate", return_value=tomorrow):
            response = self.action(second, "handover")
            self.assertEqual(response.status_code, 409)
            self.assertEqual(int(response.data["available_quantity"]), 0)
            self.action(first, "receive")
            self.assertEqual(self.action(second, "handover").status_code, 200)

    def test_handover_rechecks_private_quantity_without_exposing_it(self):
        usage = self.new_request(quantity=15)
        self.action(usage, "approve")
        # Simulate an external inventory writer; normal UI/import guards reject this.
        self.asset.custom_data = {"pieces": 10}
        self.asset.save()
        response = self.action(usage, "handover")
        self.assertEqual(response.status_code, 409)
        self.assertNotIn("available_quantity", response.data)
        usage.refresh_from_db()
        self.assertEqual(usage.status, "approved")

    def test_withdrawal_stops_new_requests_and_approval_preserves_approved_handover(self):
        approved = self.new_request()
        pending = self.new_request()
        self.action(approved, "approve")
        self.asset.is_shared = False
        self.asset.save()
        self.assertEqual(self.action(pending, "approve").status_code, 409)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.request_usage().status_code, 404)
        self.assertEqual(self.action(approved, "handover").status_code, 200)
        self.assertEqual(self.action(approved, "receive").status_code, 200)

    def test_excluded_type_stops_handover_but_return_remains_available(self):
        usage = self.new_request()
        self.action(usage, "approve")
        self.asset_type.sharing_class = "C"
        self.asset_type.save()
        self.assertEqual(self.action(usage, "handover").status_code, 409)
        self.asset_type.sharing_class = "A"
        self.asset_type.save()
        self.action(usage, "handover")
        self.asset_type.sharing_class = "C"
        self.asset_type.save()
        self.assertEqual(self.action(usage, "receive").status_code, 200)

    def test_sharing_flag_blocks_all_actions_until_feature_is_enabled_again(self):
        usage = self.new_request()
        self.action(usage, "approve")
        with override_settings(CROSS_TENANT_SHARING_ENABLED=False):
            self.client.force_authenticate(self.member)
            self.assertEqual(self.request_usage().status_code, 403)
            self.assertEqual(self.action(usage, "handover").status_code, 403)
        self.action(usage, "handover")
        with override_settings(CROSS_TENANT_SHARING_ENABLED=False):
            self.assertEqual(self.action(usage, "receive").status_code, 403)
        self.assertEqual(self.action(usage, "receive").status_code, 200)

    def test_single_equipment_and_unknown_stock_quantities(self):
        individual = AssetType.objects.create(name="Usage individual pump", schema=[])
        asset = Asset.objects.create(tenant=self.owner, asset_type=individual, is_shared=True,
                                     sharing_quantity=1, sharing_availability="available")
        self.assertEqual(self.request_usage(asset=asset, quantity=1).status_code, 201)
        self.assertEqual(self.request_usage(asset=asset, quantity=2).status_code, 409)
        for data, offered in (({}, 20), ({"pieces": 50}, None), ({"pieces": 5}, 20)):
            self.asset.custom_data = data
            self.asset.sharing_quantity = offered
            self.asset.save()
            self.assertEqual(self.request_usage().status_code, 409)

    def test_safe_positive_quantity_and_dates(self):
        for value in (0, -1, True, False, 1.5, "1.00000000000000001", "NaN", MAX_STOCK_QUANTITY + 1):
            with self.subTest(value=value):
                self.assertEqual(self.request_usage(quantity=value).status_code, 400)
        self.assertEqual(self.request_usage(start=self.today - timedelta(days=1)).status_code, 400)
        self.assertEqual(self.request_usage(start=self.today + timedelta(days=2), end=self.today).status_code, 400)
        self.assertEqual(self.request_usage(purpose="x" * 1001).status_code, 400)

    def test_scalar_and_list_payloads_return_validation_errors_not_server_errors(self):
        usage = self.new_request()
        for payload in (123, True, [], "invalid"):
            with self.subTest(payload=payload):
                self.client.force_authenticate(self.member)
                response = self.client.post("/api/assets/usage-requests/", payload, format="json")
                self.assertEqual(response.status_code, 400)
                self.client.force_authenticate(self.manager)
                response = self.client.post(f"/api/assets/usage-requests/{usage.pk}/approve/", payload, format="json")
                self.assertEqual(response.status_code, 400)
        usage.refresh_from_db()
        self.assertEqual(usage.status, "requested")

    def test_handover_cannot_precede_start_and_old_pending_cannot_approve(self):
        future = self.new_request(start=self.today + timedelta(days=1), end=self.today + timedelta(days=2))
        self.action(future, "approve")
        self.assertEqual(self.action(future, "handover").status_code, 409)
        pending = self.new_request()
        SharedUsageRequest.objects.filter(pk=pending.pk).update(start_date=self.today - timedelta(days=2), end_date=self.today - timedelta(days=1))
        self.assertEqual(self.action(pending, "approve").status_code, 409)

    def test_actions_are_idempotent_and_notifications_deduplicated(self):
        usage = self.new_request()
        before = Notification.objects.count()
        self.assertEqual(self.action(usage, "approve").status_code, 200)
        count = Notification.objects.count()
        self.assertGreater(count, before)
        self.assertEqual(self.action(usage, "approve").status_code, 200)
        self.assertEqual(Notification.objects.count(), count)
        self.action(usage, "handover")
        self.action(usage, "receive")
        count = Notification.objects.count()
        self.assertEqual(self.action(usage, "receive").status_code, 200)
        self.assertEqual(Notification.objects.count(), count)
        payloads = json.dumps([{key: content.get(key) for key in ("title", "message")}
                               for content in Notification.objects.values_list("content", flat=True)])
        for private in ("PRIVATE-REQUEST-PURPOSE", "PRIVATE-INVENTORY-SECRET", "50"):
            self.assertNotIn(private, payloads)

    def test_requester_notifications_remain_visible_and_old_membership_or_role_hides_events(self):
        usage = self.new_request()
        self.assertEqual(visible_notifications(self.member).filter(content__usage_request_id=str(usage.pk)).count(), 1)
        self.assertEqual(visible_notifications(self.manager).filter(content__usage_request_id=str(usage.pk)).count(), 1)
        self.manager.role = "tenant_user"
        self.manager.save()
        self.assertFalse(visible_notifications(self.manager).filter(content__usage_request_id=str(usage.pk)).exists())
        self.member.tenant = self.foreign
        self.member.save()
        self.assertFalse(visible_notifications(self.member).filter(content__usage_request_id=str(usage.pk)).exists())

    def test_request_creator_demoted_from_manager_keeps_own_updates(self):
        self.client.force_authenticate(self.requester_manager)
        response = self.request_usage()
        self.assertEqual(response.status_code, 201)
        usage = SharedUsageRequest.objects.get(pk=response.data["id"])
        self.requester_manager.role = "tenant_user"
        self.requester_manager.save()
        self.assertEqual(visible_notifications(self.requester_manager).filter(content__usage_request_id=str(usage.pk)).count(), 1)

    def test_open_requests_block_owner_type_delete_and_reservations_block_reductions(self):
        usage = self.new_request(quantity=15)
        for kwargs in ({"tenant_id": self.foreign.pk}, {"asset_type_id": self.foreign.pk}):
            with self.assertRaises(ValidationError):
                validate_inventory_usage_change(self.asset, **kwargs)
        with self.assertRaises(ValidationError):
            validate_inventory_usage_delete(self.asset)
        self.action(usage, "approve")
        for kwargs in ({"custom_data": {"pieces": 14}}, {"custom_data": {}}, {"sharing_quantity": 14}, {"sharing_quantity": None}):
            with self.assertRaises(ValidationError):
                validate_inventory_usage_change(self.asset, **kwargs)
        validate_inventory_usage_change(self.asset, custom_data={"pieces": 15}, sharing_quantity=15)
        validate_inventory_usage_change(self.asset, custom_data={"pieces": 16})
        self.action(usage, "cancel")
        validate_inventory_usage_change(self.asset, tenant_id=self.foreign.pk, custom_data={"pieces": 0})
        validate_inventory_usage_delete(self.asset)

    def test_existing_future_approval_does_not_block_unrelated_inventory_edits_or_increases(self):
        self.asset.custom_data = {"pieces": 10}
        self.asset.sharing_quantity = 10
        self.asset.save()
        tomorrow = self.today + timedelta(days=1)
        first = self.new_request(quantity=10, end=self.today)
        second = self.new_request(quantity=10, start=tomorrow, end=tomorrow)
        self.action(first, "approve")
        self.action(second, "approve")
        self.action(first, "handover")
        self.assertEqual(reservation_peak(self.asset), 20)
        validate_inventory_usage_change(self.asset, custom_data={"pieces": 10, "private_note": "Updated"}, sharing_quantity=10)
        validate_inventory_usage_change(self.asset, custom_data={"pieces": 12})
        with self.assertRaises(ValidationError):
            validate_inventory_usage_change(self.asset, custom_data={"pieces": 9})

    def test_closed_request_snapshot_survives_asset_removal(self):
        usage = self.new_request()
        self.action(usage, "reject", note="Unavailable this week")
        self.asset.delete()
        usage.refresh_from_db()
        self.assertIsNone(usage.asset)
        self.assertEqual(usage.listing_snapshot["title"], "Shared scaffold clamps")
        self.client.force_authenticate(self.member)
        response = self.client.get(f"/api/assets/usage-requests/{usage.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["asset"])
        self.assertEqual(response.data["allowed_actions"], [])

    def test_capacity_extreme_end_date_has_no_overflow(self):
        usage = self.new_request(quantity=20, end=date.max)
        self.assertEqual(self.action(usage, "approve").status_code, 200)
        self.assertEqual(reservation_peak(self.asset, self.today, date.max), 20)
