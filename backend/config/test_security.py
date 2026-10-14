"""Regression checks for authentication bypasses and privileged admin access."""

import base64
import json
import logging
import time
from types import SimpleNamespace
from unittest.mock import patch

from allauth.mfa.models import Authenticator
from django.test import Client, RequestFactory, TestCase, override_settings
from django.core.cache import cache
from django.http import HttpResponse

from apps.tenants.models import Tenant
from apps.user.adapters import CustomAccountAdapter
from apps.user.models import User
from apps.assets.models import Asset, AssetType
from apps.assets.serializers import AssetSerializer
from rest_framework.exceptions import ValidationError
from config.security import AuthenticationRateLimitMiddleware, SecurityAccessMiddleware, SecurityLogFormatter


class AuthenticationBoundaryTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Security regression yard")
        self.member = User.objects.create_user(
            username="security-member", email="security-member@example.test",
            password="SecurityRegression!2026", tenant=self.tenant,
        )
        self.admin = User.objects.create_superuser(
            username="security-global", email="security-global@example.test",
            password="SecurityRegression!2026",
        )

    def test_password_basic_auth_cannot_bypass_allauth_session_and_mfa(self):
        token = base64.b64encode(b"security-member:SecurityRegression!2026").decode()
        response = self.client.get("/api/assets/items/", HTTP_AUTHORIZATION=f"Basic {token}")
        self.assertIn(response.status_code, (401, 403))

    def test_admin_password_login_is_replaced_by_allauth_entry(self):
        response = self.client.post("/admin/login/", {
            "username": self.admin.username, "password": "SecurityRegression!2026",
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/login")
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_headless_app_endpoints_cannot_reuse_browser_cookie_without_csrf(self):
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.member)
        self.assertEqual(browser.get('/_allauth/app/v1/auth/session').status_code, 404)
        response = browser.post('/_allauth/app/v1/account/password', json.dumps({
            'password': 'AttackerChanged!2026',
        }), content_type='application/json')
        self.assertEqual(response.status_code, 404)
        self.member.refresh_from_db()
        self.assertTrue(self.member.check_password('SecurityRegression!2026'))

    def test_shipyard_staff_and_shipyard_superuser_cannot_enter_global_admin(self):
        for superuser in (False, True):
            self.member.is_staff = True
            self.member.is_superuser = superuser
            self.member.save()
            self.client.force_login(self.member)
            response = self.client.get("/admin/user/user/")
            self.assertEqual(response.status_code, 403)
            self.assertNotIn(self.admin.email.encode(), response.content)

    @override_settings(ADMIN_REQUIRE_MFA=True)
    def test_production_admin_requires_recent_actual_primary_factor(self):
        factor = Authenticator.objects.create(user=self.admin, type="totp", data={})
        self.client.force_login(self.admin)
        session = self.client.session
        for records in (
            [],
            [{"method": "password", "at": time.time()}],
            [{"method": "mfa", "type": "totp", "id": factor.pk, "at": time.time() - 600}],
            [{"method": "mfa", "type": "totp", "id": factor.pk + 1, "at": time.time()}],
        ):
            session["account_authentication_methods"] = records
            session.save()
            self.assertEqual(self.client.get("/admin/").status_code, 403)
        session["account_authentication_methods"] = [{
            "method": "mfa", "type": "totp", "id": factor.pk, "at": time.time(),
        }]
        session.save()
        self.assertEqual(self.client.get("/admin/").status_code, 200)

    @override_settings(ADMIN_REQUIRE_MFA=True)
    def test_global_admin_private_api_also_requires_recent_mfa(self):
        self.client.force_login(self.admin)
        response = self.client.get('/api/assets/items/')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'mfa_setup_required')
        self.assertEqual(self.client.get('/_allauth/browser/v1/account/authenticators').status_code, 200)
        factor = Authenticator.objects.create(user=self.admin, type='totp', data={})
        session = self.client.session
        session['account_authentication_methods'] = [{
            'method': 'mfa', 'type': 'totp', 'id': factor.pk, 'at': time.time(),
        }]
        session.save()
        self.assertEqual(self.client.get('/api/assets/items/').status_code, 200)

    def test_private_api_responses_are_not_cached(self):
        self.client.force_login(self.member)
        response = self.client.get("/api/assets/items/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["Referrer-Policy"], "no-referrer")

    def test_browsable_api_cannot_expose_foreign_relation_choices(self):
        foreign = Tenant.objects.create(name="Private other yard renderer")
        User.objects.create_user(username="private-other-renderer-user", tenant=foreign)
        self.client.force_login(self.member)
        for url in ("/api/assets/items/", "/api/assets/items/?format=api"):
            response = self.client.get(url, HTTP_ACCEPT="text/html")
            self.assertIn(response.status_code, (404, 406))
            self.assertNotIn(foreign.name.encode(), response.content)
            self.assertNotIn(b"private-other-renderer-user", response.content)

    def test_shipyard_superuser_cannot_read_mail_configuration(self):
        self.member.is_superuser = True
        self.member.save()
        self.client.force_login(self.member)
        self.assertEqual(self.client.get("/api/settings/smtp/").status_code, 403)

    def test_shipyard_transfer_revokes_existing_browser_session(self):
        self.client.force_login(self.member)
        self.assertEqual(self.client.get("/api/assets/items/").status_code, 200)
        self.member.tenant = Tenant.objects.create(name="New session yard")
        self.member.save(update_fields=["tenant"])
        response = self.client.get("/api/assets/items/")
        self.assertIn(response.status_code, (401, 403))
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_programmatic_transfer_clears_old_shipyard_assignment(self):
        asset = Asset.objects.create(
            tenant=self.tenant, asset_type=AssetType.objects.create(name="Assignment security crane"),
            assigned_to=self.member,
        )
        self.member.tenant = Tenant.objects.create(name="Transferred assignment yard")
        self.member.save(update_fields=["tenant"])
        asset.refresh_from_db()
        self.assertIsNone(asset.assigned_to_id)

    def test_transfer_after_initial_auth_check_is_rejected_under_membership_lock(self):
        self.client.force_login(self.member)
        request = RequestFactory().get("/api/assets/items/")
        request.user = User.objects.get(pk=self.member.pk)  # Initial authentication snapshot.
        request.session = self.client.session
        self.member.tenant = Tenant.objects.create(name="Concurrent transfer yard")
        self.member.save(update_fields=["tenant"])
        middleware = SecurityAccessMiddleware(
            lambda req: HttpResponse(status=204 if req.user.is_authenticated else 403)
        )
        self.assertEqual(middleware(request).status_code, 403)
        self.assertFalse(request.user.is_authenticated)

    def test_assignee_transfer_between_validation_and_save_cannot_expose_foreign_user(self):
        assignee = User.objects.create_user(username="moving-private-security", tenant=self.tenant)
        asset = Asset.objects.create(
            tenant=self.tenant, asset_type=AssetType.objects.create(name="Assignee race security crane"),
        )
        serializer = AssetSerializer(asset, data={'assigned_to': assignee.pk}, partial=True,
                                     context={'request': SimpleNamespace(user=self.member)})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        assignee.tenant = Tenant.objects.create(name="Assignee race foreign yard")
        assignee.save(update_fields=['tenant'])
        with self.assertRaises(ValidationError):
            serializer.save()
        asset.refresh_from_db()
        self.assertIsNone(asset.assigned_to_id)

    def test_legacy_foreign_assignment_identity_is_never_serialized(self):
        foreign = Tenant.objects.create(name="Legacy assignee foreign yard")
        assignee = User.objects.create_user(username="foreign-private-security", tenant=foreign)
        asset = Asset.objects.create(
            tenant=self.tenant, asset_type=AssetType.objects.create(name="Legacy assignment security crane"),
            assigned_to=assignee,
        )
        data = AssetSerializer(asset).data
        self.assertIsNone(data['assigned_to'])
        self.assertIsNone(data['assigned_to_username'])

    def test_privilege_change_revokes_existing_browser_session(self):
        self.client.force_login(self.member)
        self.member.role = "tenant_admin"
        self.member.save(update_fields=["role"])
        response = self.client.get("/api/assets/items/")
        self.assertIn(response.status_code, (401, 403))


class SafeFrameworkLoggingTests(TestCase):
    def test_allauth_security_upgrade_preserves_frontend_code_formats(self):
        adapter = CustomAccountAdapter()
        self.assertRegex(adapter.generate_login_code(), r'^\d{6}$')
        self.assertRegex(adapter.generate_email_verification_code(), r'^\d{6}$')
        self.assertRegex(adapter.generate_password_reset_code(), r'^[A-Z0-9]{8}$')

    def test_logs_omit_raw_path_parameters_exception_and_credentials(self):
        request = RequestFactory().get("/accounts/password/reset/key-secret/?token=query-secret")
        record = logging.LogRecord(
            "django.request", logging.ERROR, __file__, 1,
            "error path-secret password-secret", (), None,
        )
        record.request = request
        record.status_code = 500
        rendered = SecurityLogFormatter().format(record)
        for secret in ("key-secret", "query-secret", "path-secret", "password-secret"):
            self.assertNotIn(secret, rendered)
        self.assertEqual(json.loads(rendered)["status"], 500)

    @override_settings(AUDIT_TRUST_PROXY_IP=False)
    def test_forwarded_headers_do_not_spoof_authentication_rate_limit_ip(self):
        request = RequestFactory().get(
            "/", REMOTE_ADDR="192.0.2.1", HTTP_X_FORWARDED_FOR="203.0.113.2",
            HTTP_X_REAL_IP="203.0.113.3",
        )
        self.assertEqual(CustomAccountAdapter().get_client_ip(request), "192.0.2.1")

    @override_settings(AUDIT_TRUST_PROXY_IP=True)
    def test_production_uses_proxy_overwritten_real_ip(self):
        request = RequestFactory().get(
            "/", REMOTE_ADDR="192.0.2.1", HTTP_X_FORWARDED_FOR="203.0.113.2",
            HTTP_X_REAL_IP="203.0.113.3",
        )
        self.assertEqual(CustomAccountAdapter().get_client_ip(request), "203.0.113.3")


@override_settings(TURNSTILE_ENABLED=True, AUTH_CAPTCHA_RATE_LIMIT=2, AUDIT_TRUST_PROXY_IP=False)
class AuthenticationRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.middleware = AuthenticationRateLimitMiddleware(lambda request: HttpResponse(status=204))

    def request(self, address="192.0.2.8"):
        return RequestFactory().post("/_allauth/browser/v1/auth/login", REMOTE_ADDR=address)

    def test_limits_attempts_before_provider_and_resists_forwarded_ip_spoof(self):
        for expected in (204, 204, 429):
            request = self.request()
            request.META["HTTP_X_FORWARDED_FOR"] = f"198.51.100.{expected}"
            response = self.middleware(request)
            self.assertEqual(response.status_code, expected)
        self.assertEqual(response["Retry-After"], "60")
        self.assertEqual(self.middleware(self.request("192.0.2.9")).status_code, 204)

    def test_shared_counter_outage_blocks_authentication(self):
        with patch("django.core.cache.cache.add", side_effect=ConnectionError("private-cache-address")):
            response = self.middleware(self.request())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn(b"private-cache-address", response.content)
