import json
import logging
from datetime import timedelta
from io import StringIO
from unittest.mock import MagicMock, patch
import uuid

from django.contrib import admin
from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import Group
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.db import OperationalError
from django.http import JsonResponse
from django.test import Client, RequestFactory, TestCase, override_settings
from django.urls import path
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect
import requests

from apps.tenants.models import Tenant
from apps.user.models import User
from .admin import AuditEventAdmin, SiemDeliveryAdmin
from .context import current_request
from .logging import AuditJSONFormatter
from .models import AuditEvent, SiemDelivery
from .services import record_event
from .tasks import deliver_event, deliver_pending_audit_events
from .transport import SiemTransportError, send_event


def read_view(request, pk=None, **kwargs):
    return JsonResponse({"ok": True})


def write_view(request):
    Tenant.objects.create(name="Audit test private shipyard")
    return JsonResponse({"ok": True})


def caught_write_view(request):
    try:
        Tenant.objects.create(name="Audit test private shipyard")
    except Exception:
        return JsonResponse({"ok": True})
    return JsonResponse({"ok": True})


def failure_view(request):
    Tenant.objects.create(name="Audit test private shipyard")
    return JsonResponse({"error": "failed"}, status=500)


def denied_view(request):
    return JsonResponse({"error": "denied"}, status=403)


def login_view(request):
    user = authenticate(request, username="audit-admin", password="testing-secret")
    if user is not None:
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return JsonResponse({"ok": user is not None}, status=200 if user else 403)


def logout_view(request):
    logout(request)
    return JsonResponse({"ok": True})


urlpatterns = [
    path("api/audit-test/read/<uuid:pk>/", read_view),
    path("api/audit-test/write/", write_view),
    path("api/audit-test/caught-write/", caught_write_view),
    path("api/audit-test/failure/", failure_view),
    path("api/audit-test/denied/", denied_view),
    path("api/audit-test/csrf/", csrf_protect(write_view)),
    path("api/audit-test/login/", login_view),
    path("api/audit-test/logout/", logout_view),
    path("api/audit-test/reset/<str:key>/", read_view),
]


@override_settings(ROOT_URLCONF=__name__, AUTHENTICATION_BACKENDS=["django.contrib.auth.backends.ModelBackend"])
class RequestAuditTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Audit owning shipyard")
        self.user = User.objects.create_user(username="audit-admin", password="testing-secret", tenant=self.tenant,
                                             role="tenant_admin")
        self.client.force_login(self.user)

    def request_event(self, response):
        return AuditEvent.objects.filter(request_id=response["X-Request-ID"], action__startswith="http.").get()

    def test_read_captures_actor_route_ip_and_server_correlation_without_private_values(self):
        object_id = uuid.uuid4()
        response = self.client.get(f"/api/audit-test/read/{object_id}/?password=query-secret&serial=private-serial",
                                   HTTP_X_REQUEST_ID="forged-secret", REMOTE_ADDR="192.0.2.12")
        self.assertEqual(response.status_code, 200)
        event = self.request_event(response)
        self.assertEqual(event.actor_id, str(self.user.pk))
        self.assertEqual(event.actor_tenant_id, self.tenant.pk)
        self.assertEqual(event.actor_role, "tenant_admin")
        self.assertTrue(event.actor_is_admin)
        self.assertEqual(event.peer_ip, "192.0.2.12")
        self.assertEqual(event.route, "api/audit-test/read/<uuid:pk>/")
        self.assertEqual(event.object_id, str(object_id))
        serialized = json.dumps(event.payload())
        for secret in ["query-secret", "private-serial", "forged-secret", self.user.username, self.tenant.name]:
            self.assertNotIn(secret, serialized)
        self.assertIsNone(current_request.get())

    def test_reset_key_never_enters_audit_route(self):
        response = self.client.get("/api/audit-test/reset/private-reset-token/")
        event = self.request_event(response)
        self.assertEqual(event.route, "api/audit-test/reset/<str:key>/")
        self.assertNotIn("private-reset-token", json.dumps(event.payload()))

    def test_body_cookies_and_headers_never_enter_business_event(self):
        secret = "private-token-and-password"
        response = self.client.post("/api/audit-test/write/", {"password": secret, "custom_data": {"serial": secret}},
                                    content_type="application/json", HTTP_AUTHORIZATION=f"Bearer {secret}", HTTP_COOKIE=f"other={secret}")
        self.assertEqual(response.status_code, 200)
        events = AuditEvent.objects.filter(request_id=response["X-Request-ID"])
        self.assertTrue(events.filter(action="model.create", outcome="attempted").exists())
        self.assertTrue(events.filter(action="model.create", outcome="success").exists())
        for event in events:
            self.assertNotIn(secret, json.dumps(event.payload()))
            self.assertNotIn("Audit test private shipyard", json.dumps(event.payload()))

    def test_access_denials_are_retained(self):
        response = self.client.get("/api/audit-test/denied/")
        event = self.request_event(response)
        self.assertEqual((event.action, event.outcome, event.status_code), ("http.denied", "denied", 403))

    def test_csrf_denial_is_audited_with_actor(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        response = client.post("/api/audit-test/csrf/", {"password": "never-logged"})
        self.assertEqual(response.status_code, 403)
        event = self.request_event(response)
        self.assertEqual(event.actor_id, str(self.user.pk))
        self.assertEqual(event.status_code, 403)
        self.assertFalse(Tenant.objects.filter(name="Audit test private shipyard").exists())

    def test_unknown_route_redacts_path_and_query(self):
        response = self.client.get("/api/private-sensitive-path/?token=secret")
        event = self.request_event(response)
        self.assertEqual(event.route, "<unresolved>")
        self.assertEqual(event.status_code, 404)
        self.assertNotIn("private-sensitive-path", json.dumps(event.payload()))

    def test_post_mutation_audit_failure_rolls_back_all_business_writes(self):
        create = AuditEvent.objects.create

        def fail_request_event(**kwargs):
            if kwargs["action"] == "http.write":
                raise OperationalError("password=database-secret")
            return create(**kwargs)

        with patch("apps.audit.services.AuditEvent.objects.create", side_effect=fail_request_event):
            response = self.client.post("/api/audit-test/write/")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(Tenant.objects.filter(name="Audit test private shipyard").exists())
        self.assertFalse(AuditEvent.objects.filter(request_id=response["X-Request-ID"]).exists())
        self.assertNotContains(response, "database-secret", status_code=503)

    def test_swallowed_signal_failure_still_rolls_back_request(self):
        with patch("apps.audit.services.AuditEvent.objects.create", side_effect=OperationalError("secret")):
            response = self.client.post("/api/audit-test/caught-write/")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(Tenant.objects.filter(name="Audit test private shipyard").exists())

    def test_server_failure_rolls_back_mutation_and_records_failure_outside_transaction(self):
        response = self.client.post("/api/audit-test/failure/")
        self.assertEqual(response.status_code, 500)
        self.assertFalse(Tenant.objects.filter(name="Audit test private shipyard").exists())
        self.assertEqual(self.request_event(response).outcome, "failure")
        self.assertFalse(AuditEvent.objects.filter(request_id=response["X-Request-ID"], action="model.create").exists())

    def test_login_logout_and_failure_do_not_capture_credentials(self):
        self.client.logout()
        response = self.client.post("/api/audit-test/login/")
        self.assertEqual(response.status_code, 200)
        login_event = AuditEvent.objects.get(request_id=response["X-Request-ID"], action="auth.login")
        self.assertEqual(login_event.actor_id, str(self.user.pk))
        self.assertNotIn("testing-secret", json.dumps(login_event.payload()))
        response = self.client.post("/api/audit-test/logout/")
        logout_event = AuditEvent.objects.get(request_id=response["X-Request-ID"], action="auth.logout")
        self.assertEqual(logout_event.actor_id, str(self.user.pk))
        self.assertEqual(self.request_event(response).actor_id, str(self.user.pk))
        self.user.set_password("changed-secret")
        self.user.save()
        response = self.client.post("/api/audit-test/login/")
        event = AuditEvent.objects.get(request_id=response["X-Request-ID"], action="auth.login_failed")
        self.assertEqual(event.outcome, "denied")
        self.assertEqual(event.actor_type, "anonymous")
        self.assertNotIn("testing-secret", json.dumps(event.payload()))

    @override_settings(AUDIT_TRUST_PROXY_IP=False)
    def test_forwarded_ip_not_trusted_by_default(self):
        response = self.client.get(f"/api/audit-test/read/{uuid.uuid4()}/", REMOTE_ADDR="192.0.2.3",
                                   HTTP_X_REAL_IP="198.51.100.9", HTTP_X_FORWARDED_FOR="198.51.100.1")
        self.assertEqual(self.request_event(response).peer_ip, "192.0.2.3")

    @override_settings(AUDIT_TRUST_PROXY_IP=True)
    def test_proxy_ip_requires_explicit_trust_and_valid_ip(self):
        response = self.client.get(f"/api/audit-test/read/{uuid.uuid4()}/", HTTP_X_REAL_IP="198.51.100.9")
        self.assertEqual(self.request_event(response).peer_ip, "198.51.100.9")
        response = self.client.get(f"/api/audit-test/read/{uuid.uuid4()}/", HTTP_X_REAL_IP="malicious\nvalue")
        self.assertIsNone(self.request_event(response).peer_ip)


class AuditEvidenceTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Evidence private yard")
        self.user = User.objects.create(username="private-admin", tenant=self.tenant, role="tenant_admin")

    def test_actor_survives_account_deletion(self):
        event = record_event("auth.logout", actor=self.user, object_type="user.user", object_id=self.user.pk)
        original_actor = event.actor_id
        self.user.delete()
        event.refresh_from_db()
        self.assertEqual(event.actor_id, original_actor)
        self.assertEqual(event.actor_tenant_id, self.tenant.pk)

    def test_evidence_save_update_bulk_update_and_delete_are_blocked(self):
        event = record_event("http.read")
        for mutation in (
            lambda: event.save(), lambda: event.delete(),
            lambda: AuditEvent.objects.filter(pk=event.pk).update(action="model.delete"),
            lambda: AuditEvent.objects.filter(pk=event.pk).delete(),
            lambda: AuditEvent.objects.bulk_update([event], ["action"]),
            lambda: AuditEvent.objects.bulk_create([event], update_conflicts=True,
                                                   update_fields=["action"], unique_fields=["id"]),
            lambda: AuditEvent.objects.filter(pk=event.pk)._raw_delete("default"),
        ):
            with self.subTest(mutation=mutation), self.assertRaisesMessage(ValueError, "append-only"):
                mutation()
        event.refresh_from_db()
        self.assertEqual(event.action, "http.read")

    def test_model_values_not_logged_only_changed_field_names(self):
        self.user.email = "private-mail@example.test"
        self.user.set_password("private-password")
        self.user.role = "tenant_user"
        self.user.save(update_fields=["email", "password", "role"])
        events = AuditEvent.objects.filter(object_type="user.user", object_id=str(self.user.pk), action="model.update")
        self.assertTrue(events.filter(outcome="attempted").exists())
        event = events.filter(outcome="success").latest("occurred_at")
        self.assertEqual(event.field_names, ["email", "password", "role"])
        data = json.dumps(event.payload())
        self.assertNotIn("private-mail", data)
        self.assertNotIn("private-password", data)
        self.assertNotIn(self.user.password, data)

    def test_permission_membership_changes_are_audited(self):
        group = Group.objects.create(name="Private permission group")
        self.user.groups.add(group)
        event = AuditEvent.objects.filter(action="model.membership", object_id=str(self.user.pk), outcome="success").get()
        self.assertEqual(event.field_names, ["groups"])
        self.assertNotIn(group.name, json.dumps(event.payload()))

    def test_admin_action_does_not_copy_object_repr_or_change_message(self):
        LogEntry.objects.create(user=self.user, content_type=ContentType.objects.get_for_model(Tenant),
                                object_id=str(self.tenant.pk), action_flag=CHANGE,
                                object_repr="private-shipyard-name", change_message="private-secret-diff")
        event = AuditEvent.objects.filter(action="admin.change").get()
        self.assertEqual(event.object_id, str(self.tenant.pk))
        self.assertEqual(event.actor_id, str(self.user.pk))
        self.assertNotIn("private-", json.dumps(event.payload()))

    def test_non_identifier_targets_and_metadata_are_discarded(self):
        event = record_event("http.read", object_type="unsafe/path-secret", object_id="private-user@example.test",
                             field_names=["password", "private\nvalue", {"secret": "discard"}])
        self.assertEqual(event.object_id, "")
        self.assertEqual(event.object_type, "")
        self.assertEqual(event.field_names, ["password"])

    def test_captcha_reason_is_allowlisted_without_echoing_arbitrary_errors(self):
        request = RequestFactory().post("/_allauth/browser/v1/auth/login/")
        request.captcha_failure = "hostname_mismatch"
        event = record_event("http.denied", request=request, outcome="denied", status_code=403)
        self.assertEqual(event.reason_code, "hostname_mismatch")
        self.assertEqual(event.payload()["reason_code"], "hostname_mismatch")
        for unsafe in ["token-secret", {"token": "secret"}, None]:
            request.captcha_failure = unsafe
            event = record_event("http.denied", request=request, outcome="denied", status_code=403)
            self.assertEqual(event.reason_code, "")
        event = record_event("http.denied", outcome="denied", status_code=429, reason_code="rate_limited")
        self.assertEqual(event.reason_code, "rate_limited")

    def test_security_log_formatter_never_formats_exceptions_or_arbitrary_extra(self):
        formatter = AuditJSONFormatter()
        record = logging.LogRecord("apps.audit", logging.ERROR, "", 1, "password=secret", (),
                                   (ValueError, ValueError("token-secret"), None))
        record.secret = "api-token-secret"
        record.audit_code = "siem_transport_error"
        data = formatter.format(record)
        self.assertNotIn("secret", data)
        self.assertEqual(json.loads(data)["code"], "siem_transport_error")
        record.audit_event = {**record_event("http.read").payload(), "password": "discard-secret"}
        data = formatter.format(record)
        self.assertNotIn("discard-secret", data)
        self.assertNotIn('"password"', data)

    def test_audit_admin_is_superuser_read_only(self):
        request = RequestFactory().get("/admin/")
        request.user = self.user
        for model, model_admin in [(AuditEvent, AuditEventAdmin), (SiemDelivery, SiemDeliveryAdmin)]:
            instance = model_admin(model, admin.site)
            self.assertFalse(instance.has_view_permission(request))
            self.user.is_superuser = True
            self.assertTrue(instance.has_view_permission(request))
            self.assertFalse(instance.has_add_permission(request))
            self.assertFalse(instance.has_change_permission(request))
            self.assertFalse(instance.has_delete_permission(request))
            self.user.is_superuser = False


@override_settings(AUDIT_SIEM_ENABLED=True, AUDIT_SIEM_URL="https://siem.example.test/events",
                   AUDIT_SIEM_TOKEN="private-siem-token", AUDIT_SIEM_TIMEOUT=5, DEMO_MODE=False)
class SiemDeliveryTests(TestCase):
    def setUp(self):
        self.event = record_event("http.denied", outcome="denied")
        self.delivery = self.event.delivery

    def test_transport_uses_verified_tls_no_redirects_no_environment_proxy_and_stable_uuid(self):
        session = MagicMock()
        response = session.post.return_value
        response.status_code = 202
        with patch("apps.audit.transport.requests.Session") as factory:
            factory.return_value.__enter__.return_value = session
            send_event(self.event)
        self.assertFalse(session.trust_env)
        args, kwargs = session.post.call_args
        self.assertEqual(args, ("https://siem.example.test/events",))
        self.assertTrue(kwargs["verify"])
        self.assertFalse(kwargs["allow_redirects"])
        self.assertTrue(kwargs["stream"])
        self.assertEqual(kwargs["timeout"], (3.0, 5.0))
        self.assertEqual(kwargs["headers"]["Idempotency-Key"], str(self.event.pk))
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer private-siem-token")
        self.assertNotIn("private-siem-token", kwargs["data"])
        self.assertEqual(json.loads(kwargs["data"])["event_id"], str(self.event.pk))
        response.close.assert_called_once()

    def test_redirect_and_http_errors_return_safe_codes_without_reading_response_body(self):
        for status, code in [(302, "siem_redirect_rejected"), (401, "siem_http_rejected"), (500, "siem_http_rejected")]:
            session = MagicMock()
            session.post.return_value.status_code = status
            with self.subTest(status=status), patch("apps.audit.transport.requests.Session") as factory:
                factory.return_value.__enter__.return_value = session
                with self.assertRaises(SiemTransportError) as captured:
                    send_event(self.event)
                self.assertEqual(captured.exception.code, code)
                session.post.return_value.json.assert_not_called()

    def test_transport_failure_redacts_exception_url_and_credential(self):
        session = MagicMock()
        session.post.side_effect = requests.ConnectionError("https://siem?token=private-siem-token")
        with patch("apps.audit.transport.requests.Session") as factory:
            factory.return_value.__enter__.return_value = session
            with self.assertRaises(SiemTransportError) as captured:
                send_event(self.event)
        self.assertEqual(str(captured.exception), "siem_transport_error")
        self.assertIsNone(captured.exception.__cause__)

    def test_unsafe_url_missing_token_and_timeout_are_rejected_without_network(self):
        for overrides in [
            {"AUDIT_SIEM_URL": "http://siem.example.test/events"},
            {"AUDIT_SIEM_URL": "https://user:password@siem.example.test/events"},
            {"AUDIT_SIEM_URL": "https://siem.example.test/events?token=secret"},
            {"AUDIT_SIEM_URL": "https://siem.example.test/events#fragment"},
            {"AUDIT_SIEM_URL": "https://siem.example.test:bad/events"},
            {"AUDIT_SIEM_TOKEN": ""}, {"AUDIT_SIEM_TOKEN": "unsafe\r\ntoken"},
            {"AUDIT_SIEM_TIMEOUT": 0}, {"AUDIT_SIEM_TIMEOUT": 60},
        ]:
            with self.subTest(overrides=overrides), override_settings(**overrides), patch("apps.audit.transport.requests.Session") as factory:
                with self.assertRaisesMessage(SiemTransportError, "siem_configuration_error"):
                    send_event(self.event)
                factory.assert_not_called()

    def test_delivered_event_never_sends_again(self):
        with patch("apps.audit.tasks.send_event") as send:
            self.assertEqual(deliver_event(self.delivery.pk), "sent")
            self.assertEqual(deliver_event(self.delivery.pk), "ignored")
        send.assert_called_once()
        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.status, "sent")
        self.assertEqual(self.delivery.attempts, 1)
        self.assertIsNotNone(self.delivery.delivered_at)

    def test_failure_retained_with_backoff_and_no_secret_logging(self):
        with patch("apps.audit.tasks.send_event", side_effect=SiemTransportError("siem_transport_error")), self.assertLogs("apps.audit", level="WARNING") as logs:
            self.assertEqual(deliver_event(self.delivery.pk), "failed")
        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.status, "failed")
        self.assertEqual(self.delivery.error_code, "siem_transport_error")
        self.assertGreater(self.delivery.next_attempt_at, timezone.now())
        self.assertIsNone(self.delivery.locked_at)
        self.assertNotIn("private-siem-token", " ".join(logs.output))
        self.assertEqual(AuditEvent.objects.get(pk=self.event.pk).outcome, "denied")

    def test_outage_does_not_discard_event_after_many_attempts(self):
        SiemDelivery.objects.filter(pk=self.delivery.pk).update(attempts=50)
        with patch("apps.audit.tasks.send_event", side_effect=SiemTransportError("siem_http_rejected")):
            self.assertEqual(deliver_event(self.delivery.pk), "failed")
        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.attempts, 51)
        self.assertIsNotNone(self.delivery.next_attempt_at)
        self.assertLessEqual((self.delivery.next_attempt_at - timezone.now()).total_seconds(), 3600)

    def test_stale_lease_is_recovered_and_stable_event_uuid_retained(self):
        SiemDelivery.objects.filter(pk=self.delivery.pk).update(status="sending", attempts=1,
            locked_at=timezone.now() - timedelta(minutes=6), lease_id=uuid.uuid4(), next_attempt_at=None)
        with patch("apps.audit.tasks.send_event") as send:
            counts = deliver_pending_audit_events()
        self.assertEqual(counts, {"attempted": 1, "sent": 1, "failed": 0})
        self.assertEqual(send.call_args.args[0].pk, self.event.pk)
        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.attempts, 2)

    def test_active_lease_and_future_retry_are_not_reclaimed(self):
        SiemDelivery.objects.filter(pk=self.delivery.pk).update(status="sending", locked_at=timezone.now(), lease_id=uuid.uuid4())
        with patch("apps.audit.tasks.send_event") as send:
            self.assertEqual(deliver_pending_audit_events()["attempted"], 0)
            self.assertEqual(deliver_event(self.delivery.pk), "ignored")
        send.assert_not_called()
        SiemDelivery.objects.filter(pk=self.delivery.pk).update(status="failed", next_attempt_at=timezone.now() + timedelta(hours=1))
        self.assertEqual(deliver_event(self.delivery.pk), "not_due")

    @override_settings(AUDIT_SIEM_ENABLED=False)
    def test_disabled_export_keeps_durable_outbox_without_external_calls(self):
        with patch("apps.audit.tasks.send_event") as send:
            self.assertEqual(deliver_event(self.delivery.pk), "disabled")
            self.assertEqual(deliver_pending_audit_events()["attempted"], 0)
        send.assert_not_called()
        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.status, "pending")
        self.assertEqual(self.delivery.attempts, 0)

    @override_settings(DEMO_MODE=True)
    def test_demo_cannot_export_even_if_enabled(self):
        with patch("apps.audit.tasks.send_event") as send:
            self.assertEqual(deliver_event(self.delivery.pk), "disabled")
            self.assertEqual(deliver_pending_audit_events()["attempted"], 0)
        send.assert_not_called()

    def test_management_status_only_outputs_counts_and_timestamp(self):
        output = StringIO()
        call_command("audit_siem_status", stdout=output)
        data = json.loads(output.getvalue())
        self.assertEqual(data["counts"], {"pending": 1})
        self.assertIsNotNone(data["oldest_unsent_at"])
        self.assertNotIn("private-siem-token", output.getvalue())

    def test_management_delivery_reports_result(self):
        output = StringIO()
        with patch("apps.audit.tasks.send_event"):
            call_command("deliver_audit_events", limit=1, stdout=output)
        self.assertEqual(json.loads(output.getvalue()), {"attempted": 1, "sent": 1, "failed": 0})
