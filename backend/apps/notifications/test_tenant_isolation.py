"""Reassigned users cannot read or receive their former shipyard's events."""

from unittest.mock import patch

from allauth.account.models import EmailAddress
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Notification
from .services import create_notification, dispatch_notification
from .tasks import _deliver_claimed_notification, deliver_notification_email
from .views import stream_notification_payload, stream_user


@override_settings(NOTIFICATION_EMAIL_ENABLED=True, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class NotificationTenantIsolationTests(APITestCase):
    def setUp(self):
        self.owner = Tenant.objects.create(name="Notification original yard")
        self.other = Tenant.objects.create(name="Notification new yard")
        self.user = User.objects.create(username="notification-transfer", tenant=self.owner,
                                       email="notice@example.test")
        EmailAddress.objects.create(user=self.user, email=self.user.email, verified=True, primary=True)
        self.notice = create_notification(self.user, {"message": "Original yard private event", "url": "/assets"})
        self.client.force_authenticate(self.user)

    def transfer(self):
        self.user.tenant = self.other
        self.user.save(update_fields=["tenant"])

    def test_creation_snapshots_original_tenant_and_transfer_hides_every_read_path(self):
        self.assertEqual(self.notice.tenant_id, self.owner.pk)
        self.transfer()
        self.assertEqual(self.client.get("/api/notifications/").data["count"], 0)
        self.assertEqual(self.client.get("/api/notifications/unread_count/").data["unread_count"], 0)
        url = f"/api/notifications/{self.notice.pk}/"
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.post(url + "mark_as_read/").status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.client.post("/api/notifications/mark_all_as_read/")
        self.notice.refresh_from_db()
        self.assertIsNone(self.notice.read_at)

    def test_transfer_blocks_pending_email_and_live_dispatch(self):
        self.transfer()
        with patch("apps.notifications.utils.send_notification") as live:
            dispatch_notification(self.notice.pk)
        live.assert_not_called()
        with patch("apps.notifications.tasks.EmailMultiAlternatives.send") as send:
            self.assertEqual(deliver_notification_email(self.notice.pk), "skipped")
        send.assert_not_called()
        self.notice.refresh_from_db()
        self.assertEqual(self.notice.email_error_code, "tenant_membership_changed")

    def test_disabled_shipyard_hides_business_events_and_blocks_live_delivery(self):
        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])
        self.assertEqual(self.client.get("/api/notifications/").data["count"], 0)
        with patch("apps.notifications.utils.send_notification") as live:
            dispatch_notification(self.notice.pk)
        live.assert_not_called()

    def test_unknown_legacy_tenant_scope_is_hidden_and_not_emailed(self):
        self.notice.tenant_scope_known = False
        self.notice.save(update_fields=["tenant_scope_known"])
        self.assertEqual(self.client.get("/api/notifications/").data["count"], 0)
        with patch("apps.notifications.tasks.EmailMultiAlternatives.send") as send:
            self.assertEqual(deliver_notification_email(self.notice.pk), "skipped")
        send.assert_not_called()

    def test_security_event_survives_tenant_transfer(self):
        security = Notification.objects.create(user=self.user, is_security=True,
                                                content={"message": "Account security event"})
        self.transfer()
        listing = self.client.get("/api/notifications/")
        self.assertEqual([row["id"] for row in listing.data["results"]], [security.pk])

    def test_staff_and_bound_superuser_cannot_read_another_users_notification(self):
        for index, attrs in enumerate([{"is_staff": True}, {"is_superuser": True}, {"role": "platform_admin"}]):
            user = User.objects.create(username=f"notification-privilege-{index}", tenant=self.owner, **attrs)
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(f"/api/notifications/{self.notice.pk}/").status_code, 404)

    def test_live_stream_rechecks_membership_and_uses_canonical_private_row(self):
        user = stream_user(self.user.pk, self.owner.pk)
        raw = '{"notification_id": %s, "message": "forged Redis content"}' % self.notice.pk
        payload = stream_notification_payload(user, raw)
        self.assertEqual(payload["message"], "Original yard private event")
        self.transfer()
        self.assertIsNone(stream_user(self.user.pk, self.owner.pk))
        new_user = stream_user(self.user.pk, self.other.pk)
        self.assertIsNone(stream_notification_payload(new_user, raw))
        for malformed in ["not-json", "[]", '{"notification_id": true}', '{"message": "private"}',
                          '{"notification_id": -1}', '{"notification_id": 9999999999999999999999}']:
            self.assertIsNone(stream_notification_payload(new_user, malformed))

    def test_live_stream_closes_after_password_change(self):
        session_hash = self.user.get_session_auth_hash()
        self.user.set_password("Changed-Session-Secret-2026!")
        self.user.save(update_fields=["password"])
        self.assertIsNone(stream_user(self.user.pk, self.owner.pk, session_hash))

    def test_membership_changed_after_outbox_claim_is_rechecked_before_smtp(self):
        def transfer_before_delivery(notification_id):
            self.notice.refresh_from_db()
            self.assertEqual(self.notice.email_status, Notification.EmailStatus.SENDING)
            self.transfer()
            return _deliver_claimed_notification(notification_id)

        with patch("apps.notifications.tasks._deliver_claimed_notification", side_effect=transfer_before_delivery):
            with patch("apps.notifications.tasks.EmailMultiAlternatives.send") as send:
                self.assertEqual(deliver_notification_email(self.notice.pk), "skipped")
        send.assert_not_called()
        self.notice.refresh_from_db()
        self.assertEqual(self.notice.email_error_code, "tenant_membership_changed")
        self.assertIsNone(self.notice.email_locked_at)

    def test_tenant_disabled_after_outbox_claim_is_rechecked_before_smtp(self):
        def disable_before_delivery(notification_id):
            Tenant.objects.filter(pk=self.owner.pk).update(is_active=False)
            return _deliver_claimed_notification(notification_id)

        with patch("apps.notifications.tasks._deliver_claimed_notification", side_effect=disable_before_delivery):
            with patch("apps.notifications.tasks.EmailMultiAlternatives.send") as send:
                self.assertEqual(deliver_notification_email(self.notice.pk), "skipped")
        send.assert_not_called()
        self.notice.refresh_from_db()
        self.assertEqual(self.notice.email_error_code, "recipient_inactive")

    def test_live_payload_rechecks_membership_changed_after_stream_user_snapshot(self):
        snapshot = stream_user(self.user.pk, self.owner.pk)
        self.transfer()
        raw = '{"notification_id": %s}' % self.notice.pk
        self.assertIsNone(stream_notification_payload(snapshot, raw))

    def test_live_payload_rechecks_disabled_tenant_after_stream_user_snapshot(self):
        snapshot = stream_user(self.user.pk, self.owner.pk)
        Tenant.objects.filter(pk=self.owner.pk).update(is_active=False)
        raw = '{"notification_id": %s}' % self.notice.pk
        self.assertIsNone(stream_notification_payload(snapshot, raw))
