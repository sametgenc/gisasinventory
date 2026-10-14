"""Shipyard records and user administration cannot escape membership scope."""

from rest_framework.test import APITestCase
from django.test import SimpleTestCase
from types import SimpleNamespace

from apps.user.models import User
from .models import Tenant
from .middleware import TenantMiddleware, get_current_tenant, get_current_user
from apps.assets.models import Asset, AssetType


class TenantIsolationTests(APITestCase):
    def setUp(self):
        self.owner = Tenant.objects.create(name="Own secure yard")
        self.other = Tenant.objects.create(name="Other confidential yard", email="foreign@example.test")
        self.foreign_user = User.objects.create(username="foreign-member", tenant=self.other)

    def test_tenant_bound_privileged_flags_do_not_expose_other_shipyards(self):
        for index, attrs in enumerate([
            {}, {"is_staff": True}, {"role": "platform_admin"},
            {"role": "tenant_admin"}, {"is_superuser": True, "role": "tenant_admin"},
        ]):
            with self.subTest(attrs=attrs):
                user = User.objects.create(username=f"tenant-security-{index}", tenant=self.owner, **attrs)
                self.client.force_authenticate(user)
                response = self.client.get("/api/tenants/")
                self.assertEqual(response.status_code, 200)
                self.assertEqual([item["id"] for item in response.data], [self.owner.pk])
                self.assertEqual(self.client.get(f"/api/tenants/{self.other.slug}/").status_code, 404)
                self.assertEqual(self.client.get("/api/tenants/all-users/").status_code, 403)
                self.assertEqual(self.client.get("/api/tenants/export-tenants/").status_code, 403)

    def test_tenant_admin_and_bound_superuser_cannot_edit_foreign_users(self):
        for index, superuser in enumerate([False, True]):
            user = User.objects.create(username=f"bound-admin-{index}", tenant=self.owner,
                                       role="tenant_admin", is_superuser=superuser)
            self.client.force_authenticate(user)
            for endpoint in ["update-user", "update-user-role"]:
                response = self.client.patch(f"/api/tenants/{endpoint}/{self.foreign_user.pk}/", {
                    "first_name": "Unauthorized", "role": "tenant_admin",
                }, format="json")
                self.assertEqual(response.status_code, 404, response.data)
        self.foreign_user.refresh_from_db()
        self.assertEqual(self.foreign_user.first_name, "")
        self.assertEqual(self.foreign_user.role, "tenant_user")

    def test_inactive_membership_cannot_read_shipyard_contact_details(self):
        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])
        user = User.objects.create(username="disabled-yard-member", tenant=self.owner)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get("/api/tenants/").status_code, 403)
        self.assertEqual(self.client.get("/api/tenants/current/").status_code, 403)

    def test_non_superuser_platform_role_gets_no_shipyard_directory(self):
        user = User.objects.create(username="unassigned-platform-role", role="platform_admin")
        self.client.force_authenticate(user)
        response = self.client.get("/api/tenants/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_reassignment_clears_foreign_inventory_assignment(self):
        admin = User.objects.create(username="assignment-global-admin", is_superuser=True)
        asset_type = AssetType.objects.create(name="Assignment security equipment")
        asset = Asset.objects.create(tenant=self.other, asset_type=asset_type, assigned_to=self.foreign_user)
        self.client.force_authenticate(admin)
        response = self.client.post(f"/api/tenants/{self.owner.slug}/assign-user/", {
            "user_id": self.foreign_user.pk,
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        asset.refresh_from_db()
        self.foreign_user.refresh_from_db()
        self.assertIsNone(asset.assigned_to_id)
        self.assertEqual(self.foreign_user.tenant_id, self.owner.pk)


class TenantRequestContextTests(SimpleTestCase):
    def test_failed_request_does_not_leave_tenant_in_execution_context(self):
        tenant = object()
        user = SimpleNamespace(is_authenticated=True, tenant=tenant)

        def fails(request):
            self.assertIs(get_current_tenant(), tenant)
            self.assertIs(get_current_user(), user)
            raise RuntimeError("Request failed")

        with self.assertRaises(RuntimeError):
            TenantMiddleware(fails)(SimpleNamespace(user=user))
        self.assertIsNone(get_current_tenant())
        self.assertIsNone(get_current_user())
