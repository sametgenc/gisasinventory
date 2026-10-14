"""Durable, private business events. Redis and the broker are delivery aids only."""

import logging
import uuid
from collections.abc import Mapping
from datetime import datetime
from typing import NotRequired, TYPE_CHECKING, TypedDict
from urllib.parse import urlsplit

from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from apps.user.models import User, UserRole
from apps.assets.validation import JSONValue
from .models import Notification

if TYPE_CHECKING:
    from apps.assets.models import Asset

logger = logging.getLogger(__name__)


class ImportRowError(TypedDict):
    row: int
    errors: list[str]


class ImportResult(TypedDict):
    created: int
    updated: int
    errors: list[ImportRowError]
    skipped: NotRequired[int]


def safe_notification_path(value: object) -> str:
    if not isinstance(value, str) or not value.startswith("/") or value.startswith("//"):
        return "/"
    if "\\" in value or any(ord(char) < 32 for char in value):
        return "/"
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return "/"
    return value


def dispatch_notification(notification_id: int) -> None:
    """A saved event survives Redis and Celery outages; recovery retries the mail."""
    from .tasks import deliver_notification_email
    from .utils import send_notification

    try:
        notification = Notification.objects.select_related("user").get(pk=notification_id)
    except Notification.DoesNotExist:
        return
    payload = {**notification.content, "uuid": str(notification.event_id),
               "created_at": notification.created_at.isoformat(), "notification_id": notification.pk}
    try:
        send_notification(str(notification.user.uuid), payload)
    except Exception:
        logger.warning("Live notification delivery failed; database history is preserved")
    if notification.email_status != Notification.EmailStatus.QUEUED:
        return
    try:
        deliver_notification_email.apply_async(args=[notification.pk], retry=False)
    except Exception:
        # Do not log broker URLs, credentials, or notification bodies.
        logger.warning("Notification email enqueue failed; recovery will retry", extra={"notification_id": notification.pk})


def _save_notification(user: User, content: Mapping[str, JSONValue], *, event_key: str | None = None,
                       trusted_recipient: str = "", is_security: bool = False) -> Notification:
    if content.get("type") in ("ping", "heartbeat"):
        raise ValueError("Connection heartbeats cannot be saved as business notifications")
    data = {**content, "url": safe_notification_path(content.get("url", "/"))}
    defaults = {"content": data, "email_status": Notification.EmailStatus.QUEUED,
                "email_next_attempt_at": timezone.now(), "is_security": is_security,
                "email_recipient": trusted_recipient}
    if event_key:
        if len(event_key) > 180:
            raise ValueError("Notification event key is too long")
        notification, created = Notification.objects.get_or_create(
            user=user, deduplication_key=event_key, defaults=defaults,
        )
    else:
        notification = Notification.objects.create(user=user, **defaults)
        created = True
    if created:
        transaction.on_commit(lambda: dispatch_notification(notification.pk))
    return notification


def create_notification(user: User, content: Mapping[str, JSONValue], *, event_key: str | None = None) -> Notification:
    """Business callers cannot opt out of normal recipient or preference checks."""
    return _save_notification(user, content, event_key=event_key)


def create_security_notification(user: User, template_prefix: str, *, trusted_recipient: str,
                                 context: Mapping[str, object] | None = None) -> Notification:
    """Only the account adapter invokes this trusted post-change notification path."""
    from apps.user.mail import CODE_MESSAGES, account_mail_context

    validate_email(trusted_recipient)
    key = template_prefix.rsplit("/", 1)[-1]
    if key in CODE_MESSAGES or key == "password_reset_key":
        raise ValueError("Authentication challenge emails must not enter the notification outbox")
    # Preserve allauth's known user. An old email may now belong to nobody or another account.
    mail_context = account_mail_context(template_prefix, trusted_recipient, {**(context or {}), "user": user})
    data: dict[str, JSONValue] = {
        "title": str(mail_context["mail_title"]), "message": str(mail_context["mail_message"]),
        "type": "warning", "event_type": "account_security", "url": "/account/authenticators",
        "language": str(mail_context["mail_language"]), "security_hint": str(mail_context["mail_security_hint"]),
    }
    event_time = mail_context.get("mail_event_time")
    if event_time is not None:
        data["event_time"] = event_time.isoformat() if isinstance(event_time, datetime) else str(event_time)
    return _save_notification(user, data, event_key=f"security:{uuid.uuid4()}",
                              trusted_recipient=trusted_recipient, is_security=True)


def notify_import_result(user: User, results: ImportResult, *, event_key: str | None = None) -> Notification:
    """One summary for the importer, never an email for every imported row."""
    language = "en" if user.preferred_language == "en" else "tr"
    created, updated = results["created"], results["updated"]
    errors, skipped = len(results["errors"]), results.get("skipped", 0)
    if language == "en":
        title = "Excel import completed"
        message = f"{created} created, {updated} updated, {skipped} skipped, {errors} errors. Review your inventory and import results."
    else:
        title = "Excel aktarımı tamamlandı"
        message = f"{created} yeni kayıt, {updated} güncelleme, {skipped} atlanan satır, {errors} hata. Envanterinizi ve aktarım sonucunu kontrol edin."
    return create_notification(user, {"title": title, "message": message,
                                     "type": "warning" if errors else "success",
                                     "event_type": "inventory_import", "url": "/assets"},
                               event_key=event_key or f"import:{uuid.uuid4()}")


def notify_sharing_changed(asset: "Asset", previous_state: bool, *, event_key: str | None = None) -> list[Notification]:
    if previous_state == asset.is_shared or not asset.tenant.is_active:
        return []
    event_key = event_key or f"sharing:{uuid.uuid4()}"
    recipients = User.objects.filter(tenant=asset.tenant, role=UserRole.TENANT_ADMIN, is_active=True)
    notifications = []
    for user in recipients:
        language = "en" if user.preferred_language == "en" else "tr"
        if language == "en":
            title = "Equipment sharing updated"
            state = "added to" if asset.is_shared else "removed from"
            message = f"An item of type {asset.asset_type.name} was {state} the shared equipment list."
        else:
            title = "Ekipman paylaşımı güncellendi"
            state = "listesine eklendi" if asset.is_shared else "listesinden çıkarıldı"
            message = f"{asset.asset_type.name} türündeki bir kayıt ortak ekipman {state}."
        notifications.append(create_notification(user, {"title": title, "message": message,
                                                       "type": "info", "event_type": "sharing_updated",
                                                       "url": "/assets"}, event_key=event_key))
    return notifications
