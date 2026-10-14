"""Account changes stay complete when notification SMTP is missing or unavailable."""

import smtplib
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

from allauth.account.adapter import get_adapter
from allauth.account.models import EmailAddress
from allauth.core.context import request_context
from allauth.mfa.models import Authenticator
from allauth.mfa.totp.internal.flows import activate_totp
from django.core import mail
from django.test import RequestFactory, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Notification
from .services import create_notification, create_security_notification
from .tasks import deliver_notification_email


@override_settings(ACCOUNT_EMAIL_NOTIFICATIONS=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SecurityNotificationDeliveryTests(APITestCase):
    def setUp(self):
        self.yard = Tenant.objects.create(name="Security test shipyard")
        self.user = User.objects.create(username="security-user", email="security@example.test", tenant=self.yard,
                                        email_notifications_enabled=False, preferred_language="en")
        EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True, verified=True)
        self.request = RequestFactory().post("/account/authenticators")
        self.request.user = self.user
        self.request.session = {}
        self.client.force_authenticate(self.user)

    def activate(self):
        with request_context(self.request):
            with patch("allauth.mfa.totp.internal.flows.raise_if_reauthentication_required"):
                with patch("allauth.account.adapter.DefaultAccountAdapter.add_message"):
                    return activate_totp(self.request, SimpleNamespace(secret="JBSWY3DPEHPK3PXP"))

    def test_totp_and_recovery_setup_complete_without_smtp_configuration(self):
        with override_settings(EMAIL_BACKEND="apps.settings.email_backend.DatabaseEmailBackend", EMAIL_HOST="", EMAIL_HOST_USER="", EMAIL_HOST_PASSWORD="", EMAIL_USE_TLS=True, EMAIL_USE_SSL=False):
            with patch("smtplib.SMTP") as smtp:
                totp, recovery = self.activate()
                self.assertEqual(totp.type, Authenticator.Type.TOTP)
                self.assertIsNotNone(recovery)
                self.assertEqual(recovery.type, Authenticator.Type.RECOVERY_CODES)
                notification = Notification.objects.get()
                self.assertEqual(notification.email_status, "queued")
                self.assertEqual(deliver_notification_email(notification.pk), "failed")
                notification.refresh_from_db()
                self.assertEqual(notification.email_error_code, "mail_configuration_error")
                self.assertIsNone(notification.email_next_attempt_at)
                smtp.assert_not_called()
        self.assertEqual(Authenticator.objects.filter(user=self.user).count(), 2)

    def test_totp_and_recovery_setup_complete_even_if_immediate_background_delivery_fails(self):
        with patch("django.db.transaction.on_commit", side_effect=lambda callback: callback()):
            with patch("apps.notifications.utils.send_notification"):
                with patch("apps.notifications.tasks.deliver_notification_email.apply_async", side_effect=lambda args, **kwargs: deliver_notification_email(args[0])):
                    with patch("apps.notifications.tasks.EmailMultiAlternatives.send", side_effect=smtplib.SMTPAuthenticationError(535, b"provider detail")):
                        totp, recovery = self.activate()
        self.assertEqual(totp.type, Authenticator.Type.TOTP)
        self.assertEqual(recovery.type, Authenticator.Type.RECOVERY_CODES)
        notification = Notification.objects.get()
        self.assertEqual(notification.email_status, "failed")
        self.assertEqual(notification.email_error_code, "mail_configuration_error")

    def test_old_email_recipient_and_known_user_survive_email_change(self):
        old_email = self.user.email
        self.user.email = "new@example.test"
        self.user.save(update_fields=["email"])
        EmailAddress.objects.filter(user=self.user).delete()
        unrelated = User.objects.create(username="old-address-owner", email=old_email, preferred_language="tr")
        with request_context(self.request):
            get_adapter().send_notification_mail("account/email/email_changed", self.user, email=old_email,
                                                  context={"user": unrelated, "code": "SECRET-CODE", "recovery_codes": ["SECRET-RECOVERY"]})
        notification = Notification.objects.get()
        self.assertEqual(notification.user_id, self.user.pk)
        self.assertEqual(notification.email_recipient, old_email)
        self.assertTrue(notification.is_security)
        self.assertEqual(notification.content["title"], "Your email address was changed")
        self.assertNotIn("SECRET", str(notification.content))
        self.assertEqual(deliver_notification_email(notification.pk), "preview")
        self.assertEqual(mail.outbox[0].to, [old_email])
        self.assertIn("Your email address was changed", mail.outbox[0].subject)
        self.assertNotIn(self.user.email, mail.outbox[0].to)

    def test_security_ignores_business_preference_hidden_notification_and_inactive_yard(self):
        notification = create_security_notification(self.user, "mfa/email/totp_activated", trusted_recipient=self.user.email)
        notification.delete()
        self.yard.is_active = False
        self.yard.save(update_fields=["is_active"])
        with override_settings(NOTIFICATION_EMAIL_ENABLED=False):
            self.assertEqual(deliver_notification_email(notification.pk), "preview")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("review your account security", mail.outbox[0].body)

    def test_queued_security_copy_and_language_remain_consistent_after_preference_changes(self):
        notification = create_security_notification(self.user, "mfa/email/totp_activated", trusted_recipient=self.user.email)
        self.user.preferred_language = "tr"
        self.user.save(update_fields=["preferred_language"])
        self.assertEqual(deliver_notification_email(notification.pk), "preview")
        self.assertIn("Two-factor authentication was enabled", mail.outbox[0].subject)
        self.assertIn('lang="en"', mail.outbox[0].alternatives[0].content)
        self.assertIn("Open application", mail.outbox[0].body)

    def test_inactive_account_security_email_is_not_sent(self):
        notification = create_security_notification(self.user, "mfa/email/totp_activated", trusted_recipient=self.user.email)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.assertEqual(deliver_notification_email(notification.pk), "skipped")
        self.assertEqual(len(mail.outbox), 0)

    def test_business_content_cannot_claim_security_bypass(self):
        notification = create_notification(self.user, {"title": "Forged", "is_security": True, "email_recipient": "other@example.test"})
        self.assertFalse(notification.is_security)
        self.assertEqual(notification.email_recipient, "")
        self.assertEqual(deliver_notification_email(notification.pk), "skipped")

    def test_client_cannot_create_or_modify_private_security_fields(self):
        notification = create_security_notification(self.user, "mfa/email/totp_activated", trusted_recipient="old-private@example.test")
        response = self.client.get(f"/api/notifications/{notification.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("email_recipient", response.data)
        self.assertNotIn("is_security", response.data)
        self.assertNotIn("old-private@example.test", str(response.data))
        self.assertEqual(self.client.patch(f"/api/notifications/{notification.pk}/", {"is_security": True}, format="json").status_code, 405)
        self.assertEqual(self.client.post("/api/notifications/", {"is_security": True}, format="json").status_code, 405)

    def test_authentication_codes_cannot_enter_durable_notification_storage(self):
        for prefix in ("account/email/login_code", "account/email/password_reset_code", "account/email/password_reset_key"):
            with self.subTest(prefix=prefix):
                with self.assertRaises(ValueError):
                    create_security_notification(self.user, prefix, trusted_recipient=self.user.email, context={"code": "123456"})
        self.assertEqual(Notification.objects.count(), 0)

    def test_security_delivery_is_dispatched_only_after_commit(self):
        with patch("apps.notifications.services.dispatch_notification") as dispatch:
            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                notification = create_security_notification(self.user, "mfa/email/totp_activated", trusted_recipient=self.user.email,
                                                            context={"timestamp": timezone.now(), "secret": "PRIVATE-SECRET"})
            dispatch.assert_not_called()
            self.assertEqual(len(callbacks), 1)
            self.assertNotIn("PRIVATE-SECRET", str(notification.content))
            callbacks[0]()
            dispatch.assert_called_once_with(notification.pk)

    def test_demo_business_notification_forces_console_even_with_direct_smtp_override(self):
        self.user.email_notifications_enabled = True
        self.user.save(update_fields=["email_notifications_enabled"])
        notification = create_notification(self.user, {"title": "Demo only", "message": "Preview"})
        with override_settings(DEMO_MODE=True, EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend"):
            with patch("smtplib.SMTP") as smtp, patch("smtplib.SMTP_SSL") as ssl:
                with patch("sys.stdout", new=StringIO()) as output:
                    self.assertEqual(deliver_notification_email(notification.pk), "preview")
                    self.assertIn("Demo only", output.getvalue())
                smtp.assert_not_called()
                ssl.assert_not_called()

    def test_demo_account_code_forces_console_even_with_direct_smtp_override(self):
        with override_settings(DEMO_MODE=True, EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend"):
            with patch("smtplib.SMTP") as smtp, patch("smtplib.SMTP_SSL") as ssl:
                with patch("sys.stdout", new=StringIO()) as output:
                    get_adapter().send_mail("account/email/login_code", self.user.email, {"user": self.user, "code": "123456"})
                    self.assertIn("123456", output.getvalue())
                smtp.assert_not_called()
                ssl.assert_not_called()
