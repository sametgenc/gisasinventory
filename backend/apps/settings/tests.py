import smtplib
import time
from unittest.mock import patch

from allauth.account.internal.flows.login import AUTHENTICATION_METHODS_SESSION_KEY
from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from cryptography.fernet import Fernet
from django.contrib.admin.sites import AdminSite
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMessage
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from apps.user.models import User

from .admin import SmtpSettingsAdmin
from .credentials import decrypt_secret, encrypt_secret
from .email_backend import DatabaseEmailBackend, SmtpNotConfiguredError, smtp_configuration
from .models import SmtpSettings
from .serializers import SmtpSettingsSerializer


VALID_CONFIG = {
    "host": "smtp.example.test", "port": 587, "username": "smtp-user",
    "password": "smtp-password", "use_tls": True, "use_ssl": False,
    "from_email": "inventory@example.test",
}


@override_settings(EMAIL_HOST="", DEMO_MODE=False)
class SmtpSettingsTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("mail-admin", "admin@example.test", "password")
        self.user = User.objects.create_user("mail-reader", "reader@example.test", "password")
        self.client.force_authenticate(self.admin)

    def enable_factor(self, *, factor_type="totp", user=None):
        return Authenticator.objects.create(user=user or self.admin, type=factor_type, data={})

    def verify_factor(self, factor=None, *, timestamp=None, method="mfa", factor_type=None):
        factor = factor or self.enable_factor()
        session = self.client.session
        session[AUTHENTICATION_METHODS_SESSION_KEY] = [{
            "method": method, "at": timestamp if timestamp is not None else time.time(),
            "id": factor.pk, "type": factor_type or factor.type,
        }]
        session.save()
        return factor

    def save_config(self):
        serializer = SmtpSettingsSerializer(data=VALID_CONFIG)
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    def test_admin_can_read_setup_guidance_without_factor(self):
        response = self.client.get("/api/settings/smtp/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["mfa_enabled"])
        self.assertFalse(response.data["mfa_verified_recently"])
        self.assertTrue(response.data["reauthentication_required"])
        self.assertFalse(response.data["is_configured"])
        self.assertNotIn("password", response.data)

    def test_regular_inactive_and_anonymous_users_cannot_administer_mail(self):
        for user in [self.user, None]:
            self.client.force_authenticate(user)
            self.assertIn(self.client.get("/api/settings/smtp/").status_code, (401, 403))
            self.assertIn(self.client.put("/api/settings/smtp/", VALID_CONFIG, format="json").status_code, (401, 403))
        self.admin.is_active = False
        self.admin.save(update_fields=["is_active"])
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/settings/smtp/").status_code, 403)

    def test_saving_and_testing_require_recent_authentication_without_forcing_mfa(self):
        for url, method, payload in [
            ("/api/settings/smtp/", self.client.put, VALID_CONFIG),
            ("/api/settings/smtp/test/", self.client.post, {"email": self.admin.email}),
        ]:
            response = method(url, payload, format="json")
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.data["code"], "reauthentication_required")
        self.assertFalse(SmtpSettings.objects.exists())

    def test_password_reauthentication_is_not_second_factor_verification(self):
        self.verify_factor(method="password")
        response = self.client.put("/api/settings/smtp/", VALID_CONFIG, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "mfa_verification_required")

    def test_expired_future_wrong_type_other_user_and_deleted_factors_fail(self):
        factor = self.enable_factor()
        other = self.enable_factor(user=self.user)
        for candidate, timestamp, factor_type in [
            (factor, time.time() - 301, "totp"),
            (factor, time.time() + 30, "totp"),
            (factor, time.time(), "webauthn"),
            (other, time.time(), "totp"),
        ]:
            self.verify_factor(candidate, timestamp=timestamp, factor_type=factor_type)
            response = self.client.put("/api/settings/smtp/", VALID_CONFIG, format="json")
            self.assertEqual(response.status_code, 403)
        self.verify_factor(factor)
        factor.delete()
        response = self.client.put("/api/settings/smtp/", VALID_CONFIG, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "reauthentication_required")

    def test_non_mfa_admin_can_save_using_fresh_password_authentication(self):
        session = self.client.session
        session[AUTHENTICATION_METHODS_SESSION_KEY] = [{
            "method": "password", "at": time.time(), "reauthenticated": True,
        }]
        session.save()
        response = self.client.put("/api/settings/smtp/", VALID_CONFIG, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["mfa_enabled"])
        self.assertFalse(response.data["reauthentication_required"])
        session[AUTHENTICATION_METHODS_SESSION_KEY] = [{
            "method": "password", "at": time.time() - 301,
        }]
        session.save()
        response = self.client.put("/api/settings/smtp/", {"port": 465}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "reauthentication_required")

    def test_non_mfa_admin_code_authentication_requires_verified_owned_email(self):
        EmailAddress.objects.create(user=self.admin, email=self.admin.email, verified=True)
        for email, expected in ((self.user.email, 403), (self.admin.email, 200)):
            session = self.client.session
            session[AUTHENTICATION_METHODS_SESSION_KEY] = [{
                "method": "code", "at": time.time(), "email": email,
            }]
            session.save()
            response = self.client.put("/api/settings/smtp/", VALID_CONFIG, format="json")
            self.assertEqual(response.status_code, expected)

    def test_recovery_only_and_client_claims_do_not_bypass_guard(self):
        self.enable_factor(factor_type="recovery_codes")
        response = self.client.put("/api/settings/smtp/", {
            **VALID_CONFIG, "mfa_enabled": True, "mfa_verified_recently": True,
            "method": "mfa", "at": time.time(),
        }, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(SmtpSettings.objects.exists())

    def test_valid_recent_totp_and_webauthn_allow_save_and_redact_secret(self):
        for kind in ("totp", "webauthn"):
            self.verify_factor(self.enable_factor(factor_type=kind))
            response = self.client.put("/api/settings/smtp/", VALID_CONFIG, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.data["mfa_enabled"])
            self.assertTrue(response.data["mfa_verified_recently"])
            self.assertTrue(response.data["password_set"])
            self.assertNotIn("password", response.data)
            self.assertNotIn("smtp-password", str(response.data))
        config = SmtpSettings.load()
        self.assertTrue(config.password.startswith("fernet:v1:"))
        self.assertEqual(config.get_password(), "smtp-password")

    def test_blank_password_preserves_secret_and_configuration_flag_is_readonly(self):
        self.verify_factor()
        self.save_config()
        response = self.client.put("/api/settings/smtp/", {
            "host": "new.example.test", "password": "", "is_configured": False,
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_configured"])
        self.assertEqual(SmtpSettings.load().get_password(), "smtp-password")

    def test_legacy_password_is_readable_then_encrypted_on_partial_save(self):
        config = self.save_config()
        SmtpSettings.objects.filter(pk=config.pk).update(password="legacy password")
        config.refresh_from_db()
        self.assertEqual(config.get_password(), "legacy password")
        config.host = "changed.example.test"
        config.save(update_fields=["host"])
        config.refresh_from_db()
        self.assertNotEqual(config.password, "legacy password")
        self.assertEqual(config.get_password(), "legacy password")

    def test_ports_transport_host_sender_and_credentials_are_validated(self):
        invalid = [
            {"host": ""}, {"host": "smtp.example.test/path"}, {"port": 0}, {"port": 65536},
            {"use_tls": True, "use_ssl": True}, {"use_tls": False, "use_ssl": False},
            {"from_email": "not-an-email"}, {"username": ""}, {"password": ""},
        ]
        for change in invalid:
            with self.subTest(change=change):
                serializer = SmtpSettingsSerializer(data={**VALID_CONFIG, **change})
                self.assertFalse(serializer.is_valid())
        relay = SmtpSettingsSerializer(data={**VALID_CONFIG, "username": "", "password": ""})
        self.assertTrue(relay.is_valid(), relay.errors)

    def test_password_whitespace_and_long_secret_are_preserved(self):
        secret = " " + "x" * 500 + " "
        serializer = SmtpSettingsSerializer(data={**VALID_CONFIG, "password": secret})
        serializer.is_valid(raise_exception=True)
        self.assertEqual(serializer.save().get_password(), secret)

    def test_status_exposes_no_smtp_host_sender_or_credentials(self):
        self.save_config()
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/settings/smtp/status/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"is_configured", "delivery_mode"})

    def test_test_recipient_email_validation(self):
        self.verify_factor()
        self.save_config()
        for recipient in ("", "invalid", "valid@example.test\nBcc: hidden@example.test"):
            response = self.client.post("/api/settings/smtp/test/", {"email": recipient}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn("email", response.data)

    def test_test_reports_missing_configuration(self):
        self.verify_factor()
        response = self.client.post("/api/settings/smtp/test/", {"email": self.admin.email}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "smtp_not_configured")

    @override_settings(DEMO_MODE=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_demo_test_email_is_preview_and_multipart(self):
        from django.core import mail
        self.verify_factor()
        self.save_config()
        with patch("smtplib.SMTP") as smtp:
            response = self.client.post("/api/settings/smtp/test/", {"email": self.admin.email}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["delivery_mode"], "preview")
        self.assertIn("No external email", response.data["detail"])
        smtp.assert_not_called()
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].alternatives[0].mimetype, "text/html")

    @override_settings(DEMO_MODE=True, EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend")
    def test_demo_cannot_send_externally_even_with_smtp_backend_override(self):
        self.verify_factor()
        self.save_config()
        with patch("django.core.mail.backends.console.EmailBackend.send_messages", return_value=1) as preview:
            with patch("smtplib.SMTP") as smtp:
                response = self.client.post("/api/settings/smtp/test/", {"email": self.admin.email}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["delivery_mode"], "preview")
        preview.assert_called_once()
        smtp.assert_not_called()

    @override_settings(DEMO_MODE=True)
    def test_database_backend_forces_preview_in_demo(self):
        message = EmailMessage("Test", "Body", "sender@example.test", [self.admin.email])
        with patch("django.core.mail.backends.console.EmailBackend.send_messages", return_value=1) as preview:
            with patch("smtplib.SMTP") as smtp:
                self.assertEqual(DatabaseEmailBackend().send_messages([message]), 1)
        preview.assert_called_once()
        smtp.assert_not_called()

    @override_settings(EMAIL_BACKEND="apps.settings.email_backend.DatabaseEmailBackend")
    def test_real_delivery_requires_nonzero_sent_count(self):
        self.verify_factor()
        self.save_config()
        with patch("apps.settings.views.EmailMultiAlternatives.send", return_value=0):
            response = self.client.post("/api/settings/smtp/test/", {"email": self.admin.email}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "smtp_connection_failed")
        with patch("apps.settings.views.EmailMultiAlternatives.send", return_value=1):
            response = self.client.post("/api/settings/smtp/test/", {"email": self.admin.email}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["delivery_mode"], "smtp")

    def test_provider_errors_are_sanitized(self):
        self.verify_factor()
        self.save_config()
        for error, code in [
            (smtplib.SMTPAuthenticationError(535, b"private-password credential"), "smtp_auth_failed"),
            (OSError("private-password host internal"), "smtp_connection_failed"),
        ]:
            with patch("apps.settings.views.EmailMultiAlternatives.send", side_effect=error):
                response = self.client.post("/api/settings/smtp/test/", {"email": self.admin.email}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], code)
            self.assertNotIn("private-password", str(response.data))

    @override_settings(EMAIL_HOST="env.example.test", EMAIL_PORT=465, EMAIL_USE_TLS=False,
                       EMAIL_USE_SSL=True, EMAIL_HOST_USER="env-user", EMAIL_HOST_PASSWORD="env-secret")
    def test_environment_fallback_is_configured_and_redacted(self):
        response = self.client.get("/api/settings/smtp/")
        self.assertTrue(response.data["is_configured"])
        self.assertEqual(response.data["host"], "env.example.test")
        self.assertTrue(response.data["password_set"])
        self.assertNotIn("env-secret", str(response.data))
        self.assertEqual(smtp_configuration().password, "env-secret")

        self.verify_factor()
        response = self.client.put("/api/settings/smtp/", {
            **VALID_CONFIG, "username": "env-user", "password": "",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(SmtpSettings.load().get_password(), "env-secret")

    def test_database_backend_loads_decrypted_password_sender_and_timeout(self):
        self.save_config()
        backend = DatabaseEmailBackend()
        message = EmailMessage("Test", "Body", "other@example.test", [self.admin.email])
        with patch("django.core.mail.backends.smtp.EmailBackend.send_messages", return_value=1):
            self.assertEqual(backend.send_messages([message]), 1)
        self.assertEqual(backend.password, "smtp-password")
        self.assertEqual(message.from_email, VALID_CONFIG["from_email"])
        self.assertGreater(backend.timeout, 0)
        self.assertLessEqual(backend.timeout, 15)

    @override_settings(EMAIL_TIMEOUT=None)
    def test_timeout_never_becomes_unbounded(self):
        self.assertEqual(DatabaseEmailBackend(timeout=None).timeout, 15)
        self.assertEqual(DatabaseEmailBackend(timeout=60).timeout, 15)

    def test_legacy_insecure_configuration_cannot_send(self):
        self.save_config()
        SmtpSettings.objects.update(use_tls=False, use_ssl=False)
        with self.assertRaises(SmtpNotConfiguredError):
            smtp_configuration()

    def test_admin_cannot_bypass_second_factor_or_view_ciphertext(self):
        model_admin = SmtpSettingsAdmin(SmtpSettings, AdminSite())
        self.assertFalse(model_admin.has_add_permission(None))
        self.assertFalse(model_admin.has_change_permission(None))
        self.assertIn("password", model_admin.exclude)


class CredentialEncryptionTests(TestCase):
    def test_separate_keys_legacy_read_and_wrong_key_failure(self):
        first_key = Fernet.generate_key().decode()
        second_key = Fernet.generate_key().decode()
        with override_settings(SMTP_CREDENTIAL_KEY=first_key, MFA_CREDENTIAL_KEY=second_key):
            encoded = encrypt_secret("secret")
            self.assertEqual(decrypt_secret(encoded), "secret")
            self.assertEqual(decrypt_secret("legacy"), "legacy")
            with self.assertRaises(ImproperlyConfigured):
                decrypt_secret(encoded, key_setting="MFA_CREDENTIAL_KEY")
        with override_settings(SMTP_CREDENTIAL_KEY=second_key):
            with self.assertRaises(ImproperlyConfigured):
                decrypt_secret(encoded)

    @override_settings(SMTP_CREDENTIAL_KEY="not-a-fernet-key")
    def test_invalid_key_has_safe_error(self):
        with self.assertRaisesMessage(ImproperlyConfigured, "Credential encryption key is invalid"):
            encrypt_secret("secret")
