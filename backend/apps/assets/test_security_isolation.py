"""Tenant boundaries remain closed across roles, forged IDs, and exports."""

from io import BytesIO

import openpyxl
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Asset, AssetType
from .tests import workbook_file
from .usage_models import SharedUsageRequest
from .test_combined_import import workbook_file as combined_workbook_file


@override_settings(CROSS_TENANT_SHARING_ENABLED=False)
class StrictAssetIsolationTests(APITestCase):
    def setUp(self):
        self.owner = Tenant.objects.create(name="Security owner yard")
        self.other = Tenant.objects.create(name="Confidential foreign yard")
        self.asset_type = AssetType.objects.create(name="Security forklift", schema=[
            {"key": "serial", "label": "Serial", "type": "text", "is_unique_key": True},
        ])
        self.owned = Asset.objects.create(tenant=self.owner, asset_type=self.asset_type,
                                         custom_data={"serial": "OWN-SERIAL"})
        self.foreign = Asset.objects.create(
            tenant=self.other, asset_type=self.asset_type, custom_data={"serial": "FOREIGN-SECRET"},
            is_shared=True, shared_at=timezone.now(), sharing_contact_email="secret@example.test",
        )

    def actors(self):
        for index, attrs in enumerate([
            {}, {"is_staff": True}, {"role": "tenant_admin"},
            {"role": "platform_admin"}, {"is_superuser": True},
        ]):
            yield User.objects.create(username=f"isolation-{index}", tenant=self.owner, **attrs)

    def test_all_tenant_bound_roles_cannot_read_edit_delete_or_export_foreign_inventory(self):
        for user in self.actors():
            with self.subTest(role=user.role, staff=user.is_staff, superuser=user.is_superuser):
                self.client.force_authenticate(user)
                listing = self.client.get("/api/assets/items/", {"tenant": self.other.pk, "search": "Security"})
                self.assertEqual(listing.status_code, 200, listing.data)
                self.assertNotIn("FOREIGN-SECRET", str(listing.data))
                url = f"/api/assets/items/{self.foreign.pk}/"
                self.assertEqual(self.client.get(url).status_code, 404)
                self.assertEqual(self.client.patch(url, {"custom_data": {"serial": "changed"}}, format="json").status_code, 404)
                self.assertEqual(self.client.delete(url).status_code, 404)
                exported = self.client.get("/api/assets/items/export/", {
                    "tenant": self.other.pk, "asset_type": str(self.asset_type.pk),
                })
                self.assertEqual(exported.status_code, 200)
                workbook = openpyxl.load_workbook(BytesIO(exported.content), read_only=True)
                values = str(list(workbook.active.values))
                workbook.close()
                self.assertNotIn("FOREIGN-SECRET", values)
                self.assertNotIn(self.other.name, values)
        self.foreign.refresh_from_db()
        self.assertEqual(self.foreign.custom_data, {"serial": "FOREIGN-SECRET"})

    def test_tenant_bound_superuser_cannot_transfer_or_create_in_foreign_yard(self):
        user = User.objects.create(username="bound-superuser", tenant=self.owner, is_superuser=True)
        self.client.force_authenticate(user)
        payload = {"tenant": self.other.pk, "asset_type": str(self.asset_type.pk), "custom_data": {"serial": "new"}}
        self.assertEqual(self.client.post("/api/assets/items/", payload, format="json").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/assets/items/{self.owned.pk}/", {"tenant": self.other.pk}, format="json").status_code, 400)
        self.owned.refresh_from_db()
        self.assertEqual(self.owned.tenant_id, self.owner.pk)

    def test_import_cannot_write_to_forged_foreign_tenant(self):
        for user in self.actors():
            with self.subTest(role=user.role, superuser=user.is_superuser):
                self.client.force_authenticate(user)
                response = self.client.post("/api/assets/items/raw_import/", {
                    "tenant": self.other.pk, "asset_type": str(self.asset_type.pk),
                    "mapping": '{"Serial": "serial"}',
                    "file": workbook_file([["Serial"], ["FOREIGN-SECRET"]]),
                }, format="multipart")
                self.assertEqual(response.status_code, 400, response.data)
        self.foreign.refresh_from_db()
        self.assertEqual(self.foreign.custom_data, {"serial": "FOREIGN-SECRET"})

    def test_disabled_sharing_hides_existing_published_rows_and_blocks_publication(self):
        user = User.objects.create(username="sharing-owner", tenant=self.owner, role="tenant_admin")
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get("/api/assets/items/shared/", {"tenant": self.other.pk}).status_code, 403)
        response = self.client.patch(f"/api/assets/items/{self.owned.pk}/sharing/", {"is_shared": True}, format="json")
        self.assertEqual(response.status_code, 403)
        self.owned.refresh_from_db()
        self.assertFalse(self.owned.is_shared)
        self.foreign.tenant = self.owner
        self.foreign.save(update_fields=["tenant"])
        own = self.client.get(f"/api/assets/items/{self.foreign.pk}/")
        self.assertFalse(own.data["is_listed_for_sharing"])

    def test_unassigned_role_only_account_cannot_access_inventory(self):
        user = User.objects.create(username="role-only", role="platform_admin")
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get("/api/assets/items/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/assets/items/{self.foreign.pk}/").status_code, 403)

    def test_only_unassigned_active_superuser_has_explicit_global_inventory_access(self):
        user = User.objects.create(username="global-superuser", is_superuser=True)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get(f"/api/assets/items/{self.foreign.pk}/").status_code, 200)
        user.is_active = False
        user.save(update_fields=["is_active"])
        self.assertEqual(self.client.get(f"/api/assets/items/{self.foreign.pk}/").status_code, 403)

    def test_inactive_tenant_and_malformed_uuid_filters_fail_closed(self):
        user = User.objects.create(username="filter-user", tenant=self.owner)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get("/api/assets/items/", {"asset_type": "not-a-uuid"}).status_code, 400)
        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])
        self.assertEqual(self.client.get("/api/assets/items/").status_code, 403)

    def test_disabled_sharing_blocks_usage_history_details_creation_and_every_action(self):
        user = User.objects.create(username="usage-isolation-member", tenant=self.owner, role="tenant_admin")
        agreement = SharedUsageRequest.objects.create(
            asset=self.foreign, owner_tenant=self.other, requester_tenant=self.owner, requested_by=user,
            start_date=timezone.localdate(), end_date=timezone.localdate(), quantity=1,
            listing_snapshot={"sharing_contact_email": "private-previous-partner@example.test"},
        )
        self.client.force_authenticate(user)
        collection = "/api/assets/usage-requests/"
        detail = f"{collection}{agreement.pk}/"
        for url in [collection, detail]:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 403, response.data)
            self.assertNotIn("private-previous-partner", str(response.data))
            self.assertEqual(self.client.head(url).status_code, 403)
        self.assertEqual(self.client.post(collection, {
            "asset": str(self.foreign.pk), "start_date": timezone.localdate().isoformat(),
            "end_date": timezone.localdate().isoformat(), "quantity": 1,
        }, format="json").status_code, 403)
        for action in ["approve", "reject", "cancel", "handover", "receive"]:
            response = self.client.post(f"{detail}{action}/", {"note": "Unauthorized"}, format="json")
            self.assertEqual(response.status_code, 403, response.data)
        agreement.refresh_from_db()
        self.assertEqual(agreement.status, SharedUsageRequest.Status.REQUESTED)
        self.assertEqual(SharedUsageRequest.objects.count(), 1)

    def test_combined_workbook_endpoints_reject_forged_foreign_tenant_for_bound_roles(self):
        for user in self.actors():
            with self.subTest(role=user.role, superuser=user.is_superuser):
                self.client.force_authenticate(user)
                template = self.client.get("/api/assets/workbook/template/", {"tenant": self.other.pk})
                self.assertEqual(template.status_code, 403, template.data)
                for action in ["preview", "commit"]:
                    response = self.client.post(f"/api/assets/workbook/{action}/", {
                        "tenant": self.other.pk,
                        "file": workbook_file([["Serial"], ["FOREIGN-SECRET"]]),
                    }, format="multipart")
                    self.assertEqual(response.status_code, 403, response.data)
        self.foreign.refresh_from_db()
        self.assertEqual(self.foreign.custom_data, {"serial": "FOREIGN-SECRET"})

    def test_unauthorized_tracking_change_response_does_not_disclose_inventory_existence(self):
        user = User.objects.create(username="combined-mode-probe", tenant=self.owner, role="tenant_admin")
        self.client.force_authenticate(user)
        self.asset_type.catalog_code = "SEC-COMBINED-MODE"
        self.asset_type.save(update_fields=["catalog_code"])
        self.foreign.delete()
        responses = []
        for holdings in ["own", "foreign", "none"]:
            if holdings == "foreign":
                self.owned.tenant = self.other
                self.owned.save(update_fields=["tenant"])
            elif holdings == "none":
                self.owned.delete()
            response = self.client.post("/api/assets/workbook/preview/", {
                "file": combined_workbook_file([("Ekipman türleri", [
                    ["Katalog kodu", "Ekipman türü", "Kategori kodu", "Ön paylaşım sınıfı", "Takip biçimi"],
                    [self.asset_type.catalog_code, self.asset_type.name, "", "", "stock"],
                ])]),
            }, format="multipart")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertFalse(response.data["can_commit"])
            self.assertIn("Only platform administrators", str(response.data["errors"]))
            responses.append(response.data)
        self.assertEqual(responses[0], responses[1])
        self.assertEqual(responses[1], responses[2])
