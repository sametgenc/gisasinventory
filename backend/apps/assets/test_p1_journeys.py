"""Role journeys expose only participant-safe request information."""

from datetime import timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Asset, AssetType


@override_settings(CROSS_TENANT_SHARING_ENABLED=True)
class P1JourneyTests(APITestCase):
    def setUp(self):
        self.owner = Tenant.objects.create(name="Journey owner")
        self.requester = Tenant.objects.create(name="Journey requester")
        self.other = Tenant.objects.create(name="Journey unrelated")
        self.member = User.objects.create(username="journey-member", first_name="Elif", last_name="Sample", email="PRIVATE@example.test", tenant=self.requester)
        self.manager = User.objects.create(username="journey-owner", role="tenant_admin", tenant=self.owner)
        self.foreign = User.objects.create(username="journey-foreign", tenant=self.other)
        self.global_admin = User.objects.create(username="journey-platform", role="platform_admin", is_superuser=True)
        asset_type = AssetType.objects.create(name="Journey stock", tracking_mode="stock", schema=[{"key": "quantity", "type": "number", "role": "quantity", "label": "Quantity"}])
        asset = Asset.objects.create(tenant=self.owner, asset_type=asset_type, custom_data={"quantity": 50}, is_shared=True, sharing_quantity=10, sharing_availability="available")
        self.client.force_authenticate(self.member)
        response = self.client.post("/api/assets/usage-requests/", {"asset": str(asset.pk), "quantity": 2, "start_date": str(timezone.localdate()), "end_date": str(timezone.localdate() + timedelta(days=1))}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.request_id = response.data["id"]

    def test_creator_display_available_only_to_participants_without_email(self):
        for user in (self.member, self.manager):
            self.client.force_authenticate(user)
            response = self.client.get(f"/api/assets/usage-requests/{self.request_id}/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["requested_by_display"], "Elif Sample")
            self.assertNotIn("PRIVATE@example.test", str(response.data))
        for user, expected in ((self.foreign, 404), (self.global_admin, 403)):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(f"/api/assets/usage-requests/{self.request_id}/").status_code, expected)

    def test_creator_display_is_read_only_and_keeps_allowed_actions(self):
        self.assertEqual(self.client.post("/api/assets/usage-requests/", {"requested_by_display": "Injected"}, format="json").status_code, 400)
        self.client.force_authenticate(self.manager)
        detail = self.client.get(f"/api/assets/usage-requests/{self.request_id}/").data
        self.assertEqual(detail["allowed_actions"], ["approve", "reject"])
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(f"/api/assets/usage-requests/{self.request_id}/").data["allowed_actions"], ["cancel"])

    def test_deleted_creator_has_empty_display(self):
        self.member.delete()
        self.client.force_authenticate(self.manager)
        response = self.client.get(f"/api/assets/usage-requests/{self.request_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["requested_by_display"], "")
