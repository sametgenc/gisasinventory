"""Authentication must never proceed without successful server verification."""
import json
from unittest.mock import Mock, patch

import requests
from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings

from .captcha import CaptchaMiddleware, captcha_config, verify_token


@override_settings(
    TURNSTILE_ENABLED=True,
    TURNSTILE_SITE_KEY="public-site-key",
    TURNSTILE_SECRET_KEY="private-secret-key",
    TURNSTILE_ALLOWED_HOSTNAMES=["yard.example.test"],
)
class CaptchaTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.downstream = Mock(return_value=HttpResponse("allowed"))
        self.middleware = CaptchaMiddleware(self.downstream)
        session = patch("apps.user.captcha.requests.Session").start()
        self.http_session = session.return_value.__enter__.return_value
        self.siteverify = self.http_session.post
        self.addCleanup(patch.stopall)
        self.siteverify.return_value.status_code = 200
        self.siteverify.return_value.json.return_value = {
            "success": True, "hostname": "yard.example.test", "action": "authenticate",
        }

    def request(self, path="/_allauth/browser/v1/auth/login", token="verified-token", method="post"):
        data = {"captcha_token": token} if token is not None else {}
        return getattr(self.factory, method)(path, json.dumps(data), content_type="application/json")

    def test_missing_invalid_and_oversized_tokens_never_reach_authentication(self):
        for token in [None, "", " ", 123, [], "x" * 2049]:
            with self.subTest(token_type=type(token).__name__):
                response = self.middleware(self.request(token=token))
                self.assertEqual(response.status_code, 403)
                self.assertEqual(json.loads(response.content)["errors"][0]["code"], "captcha_failed")
        self.downstream.assert_not_called()
        self.siteverify.assert_not_called()

    def test_all_auth_alternatives_and_both_clients_require_verification(self):
        endpoints = [
            "login", "signup", "code/request", "code/confirm", "password/request", "password/reset",
            "provider/redirect", "provider/token", "provider/signup", "webauthn/login",
            "webauthn/signup", "webauthn/authenticate", "2fa/authenticate", "email/verify",
            "email/verify/resend", "phone/verify", "phone/verify/resend",
        ]
        for client in ["browser", "app"]:
            for endpoint in endpoints:
                with self.subTest(client=client, endpoint=endpoint):
                    response = self.middleware(self.request(f"/_allauth/{client}/v1/auth/{endpoint}", token=None))
                    self.assertEqual(response.status_code, 403)
        self.assertEqual(self.middleware(self.request("/_allauth/browser/v1/auth/webauthn/signup", token=None, method="put")).status_code, 403)
        self.downstream.assert_not_called()

    def test_valid_token_reaches_authentication_and_secret_is_sent_only_to_fixed_endpoint(self):
        response = self.middleware(self.request())
        self.assertEqual(response.status_code, 200)
        self.downstream.assert_called_once()
        self.assertFalse(self.http_session.trust_env)
        self.siteverify.return_value.close.assert_called_once()
        self.siteverify.assert_called_once_with(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": "private-secret-key", "response": "verified-token"},
            timeout=5, allow_redirects=False, verify=True,
        )

    def test_wrong_hostname_action_and_malformed_success_fail_closed(self):
        results = [
            {"success": True, "hostname": "attacker.test", "action": "authenticate"},
            {"success": True, "hostname": "yard.example.test", "action": "another_form"},
            {"success": "true", "hostname": "yard.example.test", "action": "authenticate"},
            {"success": True}, [], None, {"success": False, "error-codes": ["timeout-or-duplicate"]},
        ]
        for result in results:
            with self.subTest(result=result):
                self.siteverify.return_value.json.return_value = result
                self.assertEqual(self.middleware(self.request()).status_code, 403)
        self.downstream.assert_not_called()

    def test_unavailable_provider_invalid_json_and_redirect_fail_closed(self):
        self.siteverify.side_effect = requests.Timeout("private upstream detail")
        self.assertEqual(self.middleware(self.request()).status_code, 403)
        self.siteverify.side_effect = None
        self.siteverify.return_value.json.side_effect = ValueError("invalid JSON")
        self.assertEqual(self.middleware(self.request()).status_code, 403)
        self.siteverify.return_value.json.side_effect = None
        self.siteverify.return_value.status_code = 302
        self.assertEqual(self.middleware(self.request()).status_code, 403)
        self.downstream.assert_not_called()

    def test_replayed_token_is_rejected_by_siteverify(self):
        self.siteverify.return_value.json.side_effect = [
            {"success": True, "hostname": "yard.example.test", "action": "authenticate"},
            {"success": False, "error-codes": ["timeout-or-duplicate"]},
        ]
        self.assertEqual(self.middleware(self.request()).status_code, 200)
        self.assertEqual(self.middleware(self.request()).status_code, 403)
        self.assertEqual(self.downstream.call_count, 1)

    def test_bad_json_and_form_admin_cannot_bypass_verification(self):
        response = self.middleware(self.factory.post("/_allauth/browser/v1/auth/login", "not-json", content_type="application/json"))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.middleware(self.factory.post("/admin/login/", {"username": "admin"})).status_code, 403)
        self.siteverify.return_value.json.return_value = {"success": True, "hostname": "yard.example.test", "action": "admin_login"}
        self.assertEqual(self.middleware(self.factory.post("/admin/login/", {"cf-turnstile-response": "valid-admin-token"})).status_code, 200)

    def test_read_only_requests_and_private_mutations_do_not_consume_tokens(self):
        for request in [self.factory.get("/_allauth/browser/v1/auth/session"), self.factory.post("/api/assets/items/", {})]:
            self.assertEqual(self.middleware(request).status_code, 200)
        self.siteverify.assert_not_called()

    @override_settings(TURNSTILE_ENABLED=False)
    def test_explicit_local_disable_skips_verification(self):
        self.assertEqual(self.middleware(self.request(token=None)).status_code, 200)
        self.siteverify.assert_not_called()

    @override_settings(TURNSTILE_SECRET_KEY="")
    def test_missing_secret_never_allows_login(self):
        self.assertEqual(verify_token("valid-token", "authenticate"), (False, "unconfigured"))
        self.siteverify.assert_not_called()

    def test_config_exposes_only_public_key_and_disables_caching(self):
        response = captcha_config(self.factory.get("/api/auth/captcha/"))
        self.assertEqual(json.loads(response.content), {"enabled": True, "site_key": "public-site-key"})
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertNotIn("private-secret-key", response.content.decode())


@override_settings(
    TURNSTILE_ENABLED=True,
    TURNSTILE_SITE_KEY="public-site-key",
    TURNSTILE_SECRET_KEY="private-secret-key",
    TURNSTILE_ALLOWED_HOSTNAMES=["yard.example.test"],
)
class CaptchaAuthenticationIntegrationTests(TestCase):
    def setUp(self):
        from allauth.account.models import EmailAddress
        from apps.tenants.models import Tenant
        from .models import User

        yard = Tenant.objects.create(name="CAPTCHA yard")
        self.user = User.objects.create_user(
            username="captcha-user", email="captcha-user@example.test",
            password="CaptchaFixture!2026", tenant=yard,
        )
        EmailAddress.objects.create(user=self.user, email=self.user.email, verified=True, primary=True)

    def login(self, **extra):
        return self.client.post("/_allauth/browser/v1/auth/login", {
            "email": self.user.email, "password": "CaptchaFixture!2026", **extra,
        }, content_type="application/json")

    def test_valid_credentials_without_captcha_do_not_create_session(self):
        response = self.login()
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertIn(self.client.get("/api/assets/items/").status_code, [401, 403])

    @patch("apps.user.captcha.requests.Session")
    def test_valid_captcha_and_credentials_pass_through_real_allauth(self, session):
        response = session.return_value.__enter__.return_value.post.return_value
        response.status_code = 200
        response.json.return_value = {
            "success": True, "hostname": "yard.example.test", "action": "authenticate",
        }
        authenticated = self.login(captcha_token="verified-token")
        self.assertEqual(authenticated.status_code, 200, authenticated.content)
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.user.pk)

    def test_public_configuration_never_requires_login(self):
        response = self.client.get("/api/auth/captcha/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"enabled": True, "site_key": "public-site-key"})
