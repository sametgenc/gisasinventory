"""Notification ownership, transactional events, and isolated mail outbox delivery."""

import json
import smtplib
from datetime import timedelta
from io import BytesIO
from unittest.mock import patch

import openpyxl
from allauth.account.models import EmailAddress
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.test import override_settings
from django.utils import timezone
from redis.exceptions import ConnectionError as RedisConnectionError
from rest_framework.test import APITestCase

from apps.assets.models import Asset, AssetType
from apps.settings.email_backend import SmtpNotConfiguredError
from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Notification
from .services import create_notification, dispatch_notification, notify_sharing_changed
from .tasks import deliver_notification_email, retry_pending_notification_emails
from .utils import send_notifications


def excel(rows):
    workbook = openpyxl.Workbook()
    for row in rows:
        workbook.active.append(row)
    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return SimpleUploadedFile("inventory.xlsx", output.getvalue())


@override_settings(NOTIFICATION_EMAIL_ENABLED=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class NotificationDeliveryTests(APITestCase):
    def setUp(self):
        self.yard = Tenant.objects.create(name="Owner shipyard")
        self.other_yard = Tenant.objects.create(name="Other shipyard")
        self.user = User.objects.create(username="manager", email="manager@example.test", tenant=self.yard,
                                        role="tenant_admin", preferred_language="tr")
        EmailAddress.objects.create(user=self.user, email=self.user.email, verified=True, primary=True)
        self.other = User.objects.create(username="other", email="other@example.test", tenant=self.other_yard,
                                         role="tenant_admin")
        self.asset_type = AssetType.objects.create(name="Forklift", schema=[
            {"key": "code", "label": "Code", "type": "text", "required": True, "is_unique_key": True},
        ])
        self.asset = Asset.objects.create(tenant=self.yard, asset_type=self.asset_type,
                                          custom_data={"code": "PRIVATE-CODE"})
        self.client.force_authenticate(self.user)

    def notice(self, **overrides):
        return Notification.objects.create(user=self.user, content={"title": "Excel aktarımı tamamlandı",
                                                                    "message": "Bir kayıt oluşturuldu.", "url": "/assets"},
                                            email_status="queued", email_next_attempt_at=timezone.now(), **overrides)

    def test_durable_event_is_idempotent_and_waits_for_commit(self):
        with patch("apps.notifications.services.dispatch_notification") as dispatch:
            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                first = create_notification(self.user, {"message": "Done", "url": "https://evil.test"}, event_key="import:fixed")
                second = create_notification(self.user, {"message": "Done again"}, event_key="import:fixed")
            self.assertEqual(first.pk, second.pk)
            self.assertEqual(Notification.objects.count(), 1)
            self.assertEqual(first.content["url"], "/")
            self.assertEqual(len(callbacks), 1)
            dispatch.assert_not_called()
            callbacks[0]()
            dispatch.assert_called_once_with(first.pk)

    def test_rollback_removes_event_and_commit_callback(self):
        with patch("apps.notifications.services.dispatch_notification") as dispatch:
            with self.captureOnCommitCallbacks(execute=True):
                with self.assertRaises(ValueError):
                    with transaction.atomic():
                        create_notification(self.user, {"message": "Never committed"})
                        raise ValueError("Rollback")
            self.assertEqual(Notification.objects.count(), 0)
            dispatch.assert_not_called()

    def test_preference_updates_only_current_user(self):
        response = self.client.patch("/api/notifications/preferences/", {
            "email_notifications_enabled": False, "preferred_language": "en", "user": self.other.pk,
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, {"email_notifications_enabled": False, "preferred_language": "en"})
        self.user.refresh_from_db()
        self.other.refresh_from_db()
        self.assertFalse(self.user.email_notifications_enabled)
        self.assertTrue(self.other.email_notifications_enabled)
        self.assertEqual(self.client.patch("/api/notifications/preferences/", {"preferred_language": "evil"}, format="json").status_code, 400)

    def test_preferences_require_authentication(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get("/api/notifications/preferences/").status_code, (401, 403))

    def test_inactive_account_cannot_read_or_change_notification_preferences(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.assertEqual(self.client.get("/api/notifications/preferences/").status_code, 403)
        self.assertEqual(self.client.patch("/api/notifications/preferences/", {"email_notifications_enabled": False}, format="json").status_code, 403)

    def test_heartbeat_can_never_be_saved_or_emailed(self):
        with patch("apps.notifications.utils.send_bulk_notifications"):
            send_notifications([self.user.uuid], {"type": "ping"}, persist=True)
        self.assertEqual(Notification.objects.count(), 0)
        with self.assertRaises(ValueError):
            create_notification(self.user, {"type": "heartbeat"})

    def test_read_and_delete_do_not_reset_delivery_status_from_stale_instances(self):
        notice = self.notice()
        stale = Notification.objects.get(pk=notice.pk)
        Notification.objects.filter(pk=notice.pk).update(email_status="sent", email_attempts=1)
        stale.delete()
        notice.refresh_from_db()
        self.assertEqual((notice.email_status, notice.email_attempts), ("sent", 1))

    def test_permanent_smtp_server_rejection_is_not_retried(self):
        notice = self.notice()
        with patch("apps.notifications.tasks.EmailMultiAlternatives.send", side_effect=smtplib.SMTPDataError(554, b"Rejected")):
            self.assertEqual(deliver_notification_email(notice.pk), "failed")
        notice.refresh_from_db()
        self.assertEqual(notice.email_error_code, "mail_server_rejected")
        self.assertIsNone(notice.email_next_attempt_at)

    def test_temporary_recipient_rejection_is_retried(self):
        notice = self.notice()
        with patch("apps.notifications.tasks.EmailMultiAlternatives.send", side_effect=smtplib.SMTPRecipientsRefused({self.user.email: (450, b"Try later")})):
            self.assertEqual(deliver_notification_email(notice.pk), "failed")
        notice.refresh_from_db()
        self.assertEqual(notice.email_error_code, "recipient_rejected")
        self.assertIsNotNone(notice.email_next_attempt_at)

    def test_verified_email_gets_plain_and_html_local_preview_only_once(self):
        notice = self.notice()
        self.assertEqual(deliver_notification_email(notice.pk), "preview")
        self.assertEqual(deliver_notification_email(notice.pk), "ignored")
        notice.refresh_from_db()
        self.assertEqual((notice.email_status, notice.email_attempts), ("preview", 1))
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.user.email])
        self.assertIn("Bir kayıt oluşturuldu", mail.outbox[0].body)
        self.assertEqual(mail.outbox[0].alternatives[0].mimetype, "text/html")
        self.assertIn(str(notice.event_id), mail.outbox[0].extra_headers["Message-ID"])

    def test_smtp_success_is_recorded_without_real_network_call(self):
        notice = self.notice()
        with override_settings(EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend"):
            with patch("apps.notifications.tasks.EmailMultiAlternatives.send", return_value=1) as send:
                self.assertEqual(deliver_notification_email(notice.pk), "sent")
                self.assertEqual(deliver_notification_email(notice.pk), "ignored")
                send.assert_called_once()

    def test_demo_with_saved_backend_is_still_only_a_preview(self):
        notice = self.notice()
        with override_settings(EMAIL_BACKEND="apps.settings.email_backend.DatabaseEmailBackend", DEMO_MODE=True):
            with patch("apps.notifications.tasks.EmailMultiAlternatives.send", return_value=1):
                self.assertEqual(deliver_notification_email(notice.pk), "preview")

    def test_incomplete_saved_smtp_configuration_is_terminal(self):
        notice = self.notice()
        with patch("apps.notifications.tasks.EmailMultiAlternatives.send", side_effect=SmtpNotConfiguredError("Missing configuration")):
            self.assertEqual(deliver_notification_email(notice.pk), "failed")
        notice.refresh_from_db()
        self.assertEqual(notice.email_error_code, "mail_configuration_error")
        self.assertIsNone(notice.email_next_attempt_at)

    def test_email_opt_out_still_keeps_in_app_notification(self):
        self.user.email_notifications_enabled = False
        self.user.save(update_fields=["email_notifications_enabled"])
        notice = self.notice()
        self.assertEqual(deliver_notification_email(notice.pk), "skipped")
        notice.refresh_from_db()
        self.assertEqual(notice.email_error_code, "email_opted_out")
        self.assertEqual(notice.email_attempts, 0)
        self.assertEqual(self.client.get("/api/notifications/").data["count"], 1)
        self.assertEqual(len(mail.outbox), 0)

    def test_email_must_match_current_verified_address(self):
        self.user.email = "new-unverified@example.test"
        self.user.save(update_fields=["email"])
        notice = self.notice()
        self.assertEqual(deliver_notification_email(notice.pk), "skipped")
        notice.refresh_from_db()
        self.assertEqual(notice.email_error_code, "email_unverified")
        self.assertEqual(len(mail.outbox), 0)

    def test_inactive_account_yard_and_hidden_notifications_do_not_send(self):
        scenarios = [("user", "recipient_inactive"), ("yard", "recipient_inactive"), ("hidden", "notification_hidden")]
        for kind, error in scenarios:
            with self.subTest(kind=kind):
                self.user.is_active = kind != "user"
                self.user.save(update_fields=["is_active"])
                self.yard.is_active = kind != "yard"
                self.yard.save(update_fields=["is_active"])
                notice = self.notice(deleted_at=timezone.now() if kind == "hidden" else None)
                self.assertEqual(deliver_notification_email(notice.pk), "skipped")
                notice.refresh_from_db()
                self.assertEqual(notice.email_error_code, error)
        self.assertEqual(len(mail.outbox), 0)

    def test_failed_delivery_retries_at_most_three_times(self):
        notice = self.notice()
        with patch("apps.notifications.tasks.EmailMultiAlternatives.send", side_effect=OSError("secret SMTP password")):
            for attempt in range(3):
                self.assertEqual(deliver_notification_email(notice.pk), "failed")
                notice.refresh_from_db()
                self.assertEqual(notice.email_attempts, attempt + 1)
                self.assertEqual(notice.email_error_code, "mail_transport_error")
                if attempt < 2:
                    self.assertEqual(deliver_notification_email(notice.pk), "not_due")
                    Notification.objects.filter(pk=notice.pk).update(email_next_attempt_at=timezone.now() - timedelta(seconds=1))
            self.assertIsNone(notice.email_next_attempt_at)
            self.assertEqual(deliver_notification_email(notice.pk), "exhausted")

    def test_authentication_failure_is_terminal_and_does_not_log_credentials(self):
        notice = self.notice()
        with patch("apps.notifications.tasks.EmailMultiAlternatives.send", side_effect=smtplib.SMTPAuthenticationError(535, b"private-password")):
            self.assertEqual(deliver_notification_email(notice.pk), "failed")
            self.assertEqual(deliver_notification_email(notice.pk), "permanent_failure")
        notice.refresh_from_db()
        self.assertEqual(notice.email_error_code, "mail_configuration_error")
        self.assertIsNone(notice.email_next_attempt_at)
        self.assertEqual(retry_pending_notification_emails(), 0)

    def test_backend_zero_return_never_claims_delivery(self):
        notice = self.notice()
        with patch("apps.notifications.tasks.EmailMultiAlternatives.send", return_value=0):
            self.assertEqual(deliver_notification_email(notice.pk), "failed")
        notice.refresh_from_db()
        self.assertEqual(notice.email_status, "failed")
        self.assertEqual(notice.email_error_code, "delivery_not_accepted")
        self.assertIsNone(notice.email_sent_at)

    def test_recovery_sends_saved_pending_job_and_is_idempotent(self):
        notice = self.notice()
        self.assertEqual(retry_pending_notification_emails(), 1)
        self.assertEqual(retry_pending_notification_emails(), 0)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        notice.refresh_from_db()
        self.assertEqual(notice.email_status, "preview")

    def test_recovery_recovers_expired_worker_lease(self):
        notice = self.notice()
        Notification.objects.filter(pk=notice.pk).update(email_status="sending", email_locked_at=timezone.now() - timedelta(minutes=11), email_attempts=1)
        self.assertEqual(retry_pending_notification_emails(), 1)
        notice.refresh_from_db()
        self.assertEqual((notice.email_status, notice.email_attempts), ("preview", 2))

    def test_redis_and_broker_outages_preserve_saved_event(self):
        notice = self.notice()
        with patch("apps.notifications.utils.get_redis_client", side_effect=RedisConnectionError("private Redis URL")):
            with patch("apps.notifications.tasks.deliver_notification_email.apply_async", side_effect=OSError("private broker URL")):
                dispatch_notification(notice.pk)
        notice.refresh_from_db()
        self.assertEqual(notice.email_status, "queued")
        self.assertEqual(Notification.objects.count(), 1)

    def test_raw_import_emits_one_private_summary_for_many_rows(self):
        rows = [["Code"], *[[f"STOCK-{number}"] for number in range(50)]]
        response = self.client.post("/api/assets/items/raw_import/", {
            "file": excel(rows), "asset_type": str(self.asset_type.pk), "mapping": json.dumps({"Code": "code"}),
        }, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["created_count"], 50)
        notice = Notification.objects.get()
        self.assertEqual(notice.user_id, self.user.pk)
        self.assertIn("50 yeni kayıt", notice.content["message"])
        self.assertNotIn("STOCK-", str(notice.content))
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/notifications/").data["count"], 0)

    def test_template_import_emits_one_summary_in_english(self):
        self.user.preferred_language = "en"
        self.user.save(update_fields=["preferred_language"])
        response = self.client.post("/api/assets/items/bulk_import/", {
            "file": excel([["Code"], ["info"], ["example"], ["FIRST"], ["SECOND"]]),
            "asset_type": str(self.asset_type.pk),
        }, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        notice = Notification.objects.get()
        self.assertEqual(notice.content["title"], "Excel import completed")
        self.assertIn("2 created", notice.content["message"])

    def test_sharing_notifies_active_owner_admins_only_when_state_changes(self):
        colleague = User.objects.create(username="colleague", tenant=self.yard, role="tenant_admin")
        User.objects.create(username="inactive", tenant=self.yard, role="tenant_admin", is_active=False)
        User.objects.create(username="staff", tenant=self.yard)
        response = self.client.patch(f"/api/assets/items/{self.asset.pk}/sharing/", {"is_shared": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(set(Notification.objects.values_list("user_id", flat=True)), {self.user.pk, colleague.pk})
        self.assertNotIn("PRIVATE-CODE", str(list(Notification.objects.values_list("content", flat=True))))
        self.client.patch(f"/api/assets/items/{self.asset.pk}/sharing/", {"is_shared": True, "sharing_note": "New note"}, format="json")
        self.assertEqual(Notification.objects.count(), 2)

    def test_sharing_event_key_deduplicates_repeated_generation(self):
        self.asset.is_shared = True
        notify_sharing_changed(self.asset, False, event_key="sharing:fixed")
        notify_sharing_changed(self.asset, False, event_key="sharing:fixed")
        self.assertEqual(Notification.objects.count(), 1)

    def test_import_commit_dispatch_failure_cannot_undo_successful_import(self):
        with patch("apps.notifications.utils.get_redis_client", side_effect=RedisConnectionError("offline")):
            with patch("apps.notifications.tasks.deliver_notification_email.apply_async", side_effect=OSError("offline")):
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.client.post("/api/assets/items/raw_import/", {
                        "file": excel([["Code"], ["SAFE-IMPORT"]]), "asset_type": str(self.asset_type.pk),
                        "mapping": json.dumps({"Code": "code"}),
                    }, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(Asset.objects.filter(custom_data__code="SAFE-IMPORT").exists())
        self.assertEqual(Notification.objects.get().email_status, "queued")
