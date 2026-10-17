from rest_framework.test import APITestCase

from apps.user.models import User
from .models import Tenant


class TenantCreationTrustTests(APITestCase):
    def setUp(self):
        self.operator = User.objects.create(username="operator", is_superuser=True)
        self.client.force_authenticate(self.operator)

    def test_create_keeps_every_contact_field_collected_by_the_form(self):
        payload = {
            "name": "New shipyard",
            "description": "Maintenance and repair",
            "address": "Dock 12",
            "phone": "+90 212 555 0101",
            "email": "office@example.test",
        }
        response = self.client.post("/api/tenants/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        tenant = Tenant.objects.get(name=payload["name"])
        for field, value in payload.items():
            with self.subTest(field=field):
                self.assertEqual(getattr(tenant, field), value)
        self.assertTrue(tenant.is_active)

    def test_invalid_contact_information_rejects_creation_without_partial_save(self):
        response = self.client.post("/api/tenants/", {
            "name": "Invalid contact yard", "email": "not-an-email",
        }, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("email", response.data)
        self.assertFalse(Tenant.objects.filter(name="Invalid contact yard").exists())

    def test_create_stays_unavailable_to_tenant_and_catalog_managers(self):
        for role in ("tenant_user", "tenant_admin", "platform_admin"):
            with self.subTest(role=role):
                user = User.objects.create(username=role, role=role)
                self.client.force_authenticate(user)
                response = self.client.post("/api/tenants/", {"name": role}, format="json")
                self.assertEqual(response.status_code, 403)
                self.assertFalse(Tenant.objects.filter(name=role).exists())

    def test_user_list_reports_actual_global_access_separately_from_role(self):
        legacy = User.objects.create(username="legacy-role", role="platform_admin")
        response = self.client.get("/api/tenants/all-users/")
        self.assertEqual(response.status_code, 200, response.data)
        users = {item["id"]: item for item in response.data}
        self.assertIs(users[self.operator.pk].get("is_superuser"), True)
        self.assertIs(users[legacy.pk].get("is_superuser"), False)

    def test_user_update_cannot_grant_global_access(self):
        ordinary = User.objects.create(username="ordinary", email="ordinary@example.test")
        response = self.client.patch(f"/api/tenants/update-user/{ordinary.pk}/", {
            "role": "platform_admin", "is_superuser": True,
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        ordinary.refresh_from_db()
        self.assertEqual(ordinary.role, "platform_admin")
        self.assertFalse(ordinary.is_superuser)
