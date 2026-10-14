from rest_framework.test import APITestCase
from apps.user.models import User
from .models import Tenant
from apps.assets.tests import workbook_file


class TenantUserPermissionsTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Yard")
        self.admin = User.objects.create(username="manager", tenant=self.tenant, role="tenant_admin")
        self.member = User.objects.create(username="member", tenant=self.tenant)
        self.client.force_authenticate(self.admin)

    def test_available_users_is_superuser_only(self):
        for user in (self.member, self.admin):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get("/api/tenants/available-users/").status_code, 403)

    def test_platform_role_can_choose_shipyard_without_management_permissions(self):
        other = Tenant.objects.create(name='Another yard')
        platform = User.objects.create(username='catalog-manager', role='platform_admin')
        self.client.force_authenticate(platform)
        response = self.client.get('/api/tenants/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({item['id'] for item in response.data}, {self.tenant.pk, other.pk})
        self.assertEqual(self.client.post('/api/tenants/', {'name': 'Forbidden'}, format='json').status_code, 403)
        self.assertEqual(self.client.get('/api/tenants/all-users/').status_code, 403)

    def test_tenant_admin_cannot_change_privileged_accounts(self):
        for attrs in ({"is_superuser": True}, {"role": "platform_admin"}):
            self.member.is_superuser = attrs.get("is_superuser", False)
            self.member.role = attrs.get("role", "tenant_user")
            self.member.save()
            for endpoint, data in (("update-user", {"password": "New-Unique-Password-2026!"}),
                                   ("update-user-role", {"role": "tenant_user"})):
                response = self.client.patch(f"/api/tenants/{endpoint}/{self.member.pk}/", data, format="json")
                self.assertEqual(response.status_code, 403, response.data)

    def test_tenant_admin_can_update_ordinary_member(self):
        response = self.client.patch(f"/api/tenants/update-user/{self.member.pk}/", {"first_name": "Jane", "is_active": False}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.member.refresh_from_db()
        self.assertEqual(self.member.first_name, "Jane")
        self.assertFalse(self.member.is_active)

    def test_invalid_update_does_not_persist_any_fields(self):
        response = self.client.patch(f"/api/tenants/update-user/{self.member.pk}/", {
            "first_name": "Changed", "email": "invalid-email",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.member.refresh_from_db()
        self.assertEqual(self.member.first_name, "")

    def test_common_password_is_rejected(self):
        response = self.client.patch(f"/api/tenants/update-user/{self.member.pk}/", {"password": "12345678"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_unassigned_admin_cannot_manage_unassigned_users(self):
        self.admin.tenant = None
        self.admin.save()
        self.member.tenant = None
        self.member.save()
        response = self.client.patch(f"/api/tenants/update-user/{self.member.pk}/", {"first_name": "Changed"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_bulk_user_import_rejects_missing_password(self):
        self.admin.is_superuser = True
        self.admin.save()
        response = self.client.post('/api/tenants/bulk-import-users/', {
            'file': workbook_file([
                ['Username', 'Email', 'First', 'Last', 'Password', 'Role', 'Tenant'],
                ['info'], ['example'], ['new-user', 'new@example.com', '', '', None, 'tenant_user', 'Yard'],
            ]),
        }, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['success_count'], 0)
        self.assertEqual(response.data['error_count'], 1)
        self.assertFalse(User.objects.filter(username='new-user').exists())
