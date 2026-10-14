"""Bounded email outbox delivery and recovery; no external side effect before commit."""

import logging
import smtplib
from collections.abc import Mapping, Sequence
from datetime import timedelta
from uuid import UUID

from allauth.account.models import EmailAddress
from celery import shared_task
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMultiAlternatives, get_connection
from django.db import transaction
from django.db.models import Q
from django.template.loader import render_to_string
from django.utils import timezone

from apps.settings.email_backend import SmtpNotConfiguredError, delivery_mode
from apps.assets.validation import JSONValue
from apps.tenants.models import Tenant
from apps.user.models import User
from .models import Notification
from .utils import send_notifications

logger = logging.getLogger(__name__)
MAX_EMAIL_ATTEMPTS = 3


def recipient_for(notification: Notification) -> tuple[str | None, str]:
    user = notification.user
    if settings.EMAIL_BACKEND == "django.core.mail.backends.dummy.EmailBackend":
        return None, "mail_disabled"
    if notification.is_security:
        if not user.is_active:
            return None, "recipient_inactive"
        return (notification.email_recipient, "") if notification.email_recipient else (None, "email_unavailable")
    if notification.deleted_at:
        return None, "notification_hidden"
    if not getattr(settings, "NOTIFICATION_EMAIL_ENABLED", True):
        return None, "mail_disabled"
    if not user.email_notifications_enabled:
        return None, "email_opted_out"
    if not user.is_active or (user.tenant_id and not user.tenant.is_active):
        return None, "recipient_inactive"
    content = notification.content if isinstance(notification.content, dict) else {}
    if content.get('audience_tenant_id') and str(user.tenant_id) != str(content['audience_tenant_id']):
        return None, 'tenant_membership_changed'
    if content.get('audience_role') and user.role != content['audience_role']:
        return None, 'recipient_role_changed'
    if not notification.tenant_scope_known or notification.tenant_id != user.tenant_id:
        from apps.tenants.permissions import is_global_admin
        if not notification.tenant_scope_known or not is_global_admin(user):
            return None, "tenant_membership_changed"
    verified = EmailAddress.objects.filter(user=user, email__iexact=user.email, verified=True).first()
    if not verified or not user.email:
        return None, "email_unverified"
    return verified.email, ""


def mark_failed(notification_id: int, code: str, *, retryable: bool) -> None:
    notification = Notification.objects.get(pk=notification_id)
    delay = min(60 * (2 ** max(notification.email_attempts - 1, 0)), 300)
    Notification.objects.filter(pk=notification_id, email_status=Notification.EmailStatus.SENDING).update(
        email_status=Notification.EmailStatus.FAILED, email_error_code=code, email_locked_at=None,
        email_next_attempt_at=timezone.now() + timedelta(seconds=delay)
        if retryable and notification.email_attempts < MAX_EMAIL_ATTEMPTS else None,
    )


@shared_task(ignore_result=True)
def deliver_notification_email(notification_id: int) -> str:
    """Claim once before SMTP, so repeated queue jobs do not send recorded deliveries twice."""
    with transaction.atomic():
        notification = Notification.objects.select_for_update(of=("self",)).select_related("user__tenant").filter(pk=notification_id).first()
        if notification is None or notification.email_status in (
            Notification.EmailStatus.SENT, Notification.EmailStatus.PREVIEW,
            Notification.EmailStatus.SKIPPED, Notification.EmailStatus.SENDING,
        ):
            return "ignored"
        if notification.email_attempts >= MAX_EMAIL_ATTEMPTS:
            return "exhausted"
        if notification.email_status == Notification.EmailStatus.FAILED and notification.email_next_attempt_at is None:
            return "permanent_failure"
        if notification.email_next_attempt_at and notification.email_next_attempt_at > timezone.now():
            return "not_due"
        recipient, skip_reason = recipient_for(notification)
        if skip_reason:
            notification.email_status = Notification.EmailStatus.SKIPPED
            notification.email_error_code = skip_reason
            notification.email_next_attempt_at = None
            notification.save(update_fields=["email_status", "email_error_code", "email_next_attempt_at"])
            return "skipped"
        notification.email_status = Notification.EmailStatus.SENDING
        notification.email_attempts += 1
        notification.email_locked_at = timezone.now()
        notification.email_next_attempt_at = None
        notification.save(update_fields=["email_status", "email_attempts", "email_locked_at", "email_next_attempt_at"])

    return _deliver_claimed_notification(notification_id)


def _deliver_claimed_notification(notification_id: int) -> str:
    """Serialize final authorization and SMTP with membership and tenant changes."""
    user_id = Notification.objects.filter(pk=notification_id).values_list("user_id", flat=True).first()
    if user_id is None:
        return "ignored"
    with transaction.atomic():
        # Match private request lock order: recipient first, then tenant, then event.
        user = User.objects.select_for_update(no_key=True).filter(pk=user_id).first()
        if user is None:
            return "ignored"
        if user.tenant_id is not None:
            tenant = Tenant.objects.select_for_update(no_key=True).get(pk=user.tenant_id)
            user.tenant = tenant
        notification = Notification.objects.select_for_update().filter(pk=notification_id, user=user).first()
        if notification is None or notification.email_status != Notification.EmailStatus.SENDING:
            return "ignored"
        notification.user = user
        recipient, skip_reason = recipient_for(notification)
        if skip_reason:
            notification.email_status = Notification.EmailStatus.SKIPPED
            notification.email_error_code = skip_reason
            notification.email_next_attempt_at = None
            notification.email_locked_at = None
            notification.save(update_fields=["email_status", "email_error_code", "email_next_attempt_at", "email_locked_at"])
            return "skipped"
        # Keep recipient/tenant locks until SMTP and delivery-state recording finish.
        return _send_notification_email(notification, recipient)


def _send_notification_email(notification: Notification, recipient: str) -> str:
    try:
        from apps.user.mail import build_mail_context
        context = build_mail_context(user=notification.user,
                                     title=notification.content.get("title", "GISASTECH"),
                                     message=notification.content.get("message", ""),
                                     action_path=notification.content.get("url", "/notifications"),
                                     language=notification.content.get("language") if notification.is_security else None)
        if notification.is_security:
            context["mail_security_hint"] = notification.content.get("security_hint", "")
            context["mail_event_time"] = notification.content.get("event_time")
        subject = " ".join(str(context["mail_title"]).splitlines())
        email = EmailMultiAlternatives(subject=subject, body=render_to_string("mail/notification_message.txt", context),
                                      from_email=settings.DEFAULT_FROM_EMAIL, to=[recipient],
                                      headers={"Message-ID": f"<notification-{notification.event_id}@{getattr(settings, 'DOMAIN', 'localhost')}>"})
        email.attach_alternative(render_to_string("mail/notification_message.html", context), "text/html")
        if getattr(settings, "DEMO_MODE", False):
            # Enforce isolation here even if EMAIL_BACKEND is accidentally set to direct SMTP.
            email.connection = get_connection(backend="django.core.mail.backends.console.EmailBackend", fail_silently=False)
        if email.send(fail_silently=False) != 1:
            mark_failed(notification.pk, "delivery_not_accepted", retryable=True)
            return "failed"
    except (smtplib.SMTPAuthenticationError, smtplib.SMTPNotSupportedError, ImproperlyConfigured, SmtpNotConfiguredError):
        mark_failed(notification.pk, "mail_configuration_error", retryable=False)
        return "failed"
    except smtplib.SMTPRecipientsRefused as error:
        temporary = any(400 <= reply[0] < 500 for reply in error.recipients.values())
        mark_failed(notification.pk, "recipient_rejected", retryable=temporary)
        return "failed"
    except smtplib.SMTPResponseException as error:
        mark_failed(notification.pk, "mail_server_rejected", retryable=400 <= error.smtp_code < 500)
        return "failed"
    except (smtplib.SMTPException, OSError):
        mark_failed(notification.pk, "mail_transport_error", retryable=True)
        return "failed"
    except Exception:
        # Template/programming failures must be visible, without leaking payloads or SMTP secrets.
        logger.error("Notification email rendering or delivery failed", extra={"notification_id": notification.pk})
        mark_failed(notification.pk, "mail_render_error", retryable=False)
        return "failed"
    final_status = Notification.EmailStatus.PREVIEW if delivery_mode() == "preview" else Notification.EmailStatus.SENT
    Notification.objects.filter(pk=notification.pk, email_status=Notification.EmailStatus.SENDING).update(
        email_status=final_status, email_error_code="", email_sent_at=timezone.now(),
        email_locked_at=None, email_next_attempt_at=None,
    )
    return final_status


@shared_task(ignore_result=True)
def retry_pending_notification_emails() -> int:
    """Database outbox recovery, in batches of 100 and at most three attempts per event."""
    now = timezone.now()
    # A process can die after claiming a job. Recover its lease after ten minutes.
    Notification.objects.filter(email_status=Notification.EmailStatus.SENDING,
                                email_locked_at__lt=now - timedelta(minutes=10),
                                email_attempts__lt=MAX_EMAIL_ATTEMPTS).update(
        email_status=Notification.EmailStatus.FAILED, email_error_code="delivery_interrupted",
        email_locked_at=None, email_next_attempt_at=now,
    )
    Notification.objects.filter(email_status=Notification.EmailStatus.SENDING,
                                email_locked_at__lt=now - timedelta(minutes=10),
                                email_attempts__gte=MAX_EMAIL_ATTEMPTS).update(
        email_status=Notification.EmailStatus.FAILED, email_error_code="delivery_interrupted",
        email_locked_at=None, email_next_attempt_at=None,
    )
    pending = Notification.objects.filter(email_attempts__lt=MAX_EMAIL_ATTEMPTS).filter(
        Q(email_status=Notification.EmailStatus.QUEUED) |
        Q(email_status=Notification.EmailStatus.FAILED, email_next_attempt_at__lte=now),
    ).order_by("created_at", "pk").values_list("pk", flat=True)[:100]
    attempted = 0
    for notification_id in list(pending):
        deliver_notification_email(notification_id)
        attempted += 1
    return attempted


@shared_task
def broadcast_heartbeat_notification() -> None:
    """Legacy schedules may call this; heartbeat events never persist or send email."""
    from django.contrib.auth import get_user_model
    import uuid
    send_notifications(list(get_user_model().objects.values_list("uuid", flat=True)),
                       {"uuid": str(uuid.uuid4()), "type": "ping", "message": "Connected"}, persist=False)


@shared_task
def send_notification_task(user_uuid: str | UUID, data: Mapping[str, JSONValue], persist: bool = False) -> None:
    send_notifications([str(user_uuid)], data, persist=persist)


@shared_task
def send_bulk_notification_task(user_uuids: Sequence[str | UUID], data: Mapping[str, JSONValue], persist: bool = False) -> None:
    send_notifications([str(user_uuid) for user_uuid in user_uuids], data, persist=persist)
