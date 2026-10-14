from datetime import timedelta
import logging
import uuid

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import SiemDelivery
from .transport import SiemTransportError, send_event

logger = logging.getLogger("apps.audit")
LEASE_SECONDS = 300


def deliver_event(delivery_id):
    if not getattr(settings, "AUDIT_SIEM_ENABLED", False) or getattr(settings, "DEMO_MODE", False):
        return "disabled"
    lease_id = uuid.uuid4()
    now = timezone.now()
    with transaction.atomic():
        delivery = SiemDelivery.objects.select_for_update(of=("self",)).select_related("event").filter(pk=delivery_id).first()
        if delivery is None or delivery.status in {SiemDelivery.Status.SENT, SiemDelivery.Status.SENDING}:
            return "ignored"
        if delivery.next_attempt_at and delivery.next_attempt_at > now:
            return "not_due"
        delivery.status = SiemDelivery.Status.SENDING
        delivery.attempts += 1
        delivery.locked_at = now
        delivery.lease_id = lease_id
        delivery.next_attempt_at = None
        delivery.save(update_fields=["status", "attempts", "locked_at", "lease_id", "next_attempt_at"])

    try:
        send_event(delivery.event)
    except SiemTransportError as error:
        # Retain every failure indefinitely; outages must not exhaust/discard security evidence.
        delay = min(30 * 2 ** min(delivery.attempts - 1, 7), 3600)
        SiemDelivery.objects.filter(pk=delivery.pk, status=SiemDelivery.Status.SENDING, lease_id=lease_id).update(
            status=SiemDelivery.Status.FAILED, error_code=error.code, locked_at=None, lease_id=None,
            next_attempt_at=timezone.now() + timedelta(seconds=delay),
        )
        logger.warning("audit_siem_delivery_failed", extra={"audit_code": error.code})
        return "failed"
    # Unexpected programming/database failures remain visible and lease recovery retries them.
    updated = SiemDelivery.objects.filter(pk=delivery.pk, status=SiemDelivery.Status.SENDING, lease_id=lease_id).update(
        status=SiemDelivery.Status.SENT, error_code="", locked_at=None, lease_id=None,
        next_attempt_at=None, delivered_at=timezone.now(),
    )
    return "sent" if updated else "lease_lost"


@shared_task(ignore_result=True)
def deliver_pending_audit_events(limit=None):
    if not getattr(settings, "AUDIT_SIEM_ENABLED", False) or getattr(settings, "DEMO_MODE", False):
        return {"attempted": 0, "sent": 0, "failed": 0}
    now = timezone.now()
    SiemDelivery.objects.filter(status=SiemDelivery.Status.SENDING,
                                locked_at__lt=now - timedelta(seconds=LEASE_SECONDS)).update(
        status=SiemDelivery.Status.FAILED, error_code="siem_delivery_interrupted",
        locked_at=None, lease_id=None, next_attempt_at=now,
    )
    batch_size = min(max(int(limit or getattr(settings, "AUDIT_SIEM_BATCH_SIZE", 100)), 1), 1000)
    due = list(SiemDelivery.objects.filter(
        Q(status=SiemDelivery.Status.PENDING) | Q(status=SiemDelivery.Status.FAILED, next_attempt_at__lte=now),
    ).order_by("event__occurred_at", "pk").values_list("pk", flat=True)[:batch_size])
    counts = {"attempted": 0, "sent": 0, "failed": 0}
    for delivery_id in due:
        result = deliver_event(delivery_id)
        counts["attempted"] += 1
        if result in {"sent", "failed"}:
            counts[result] += 1
    return counts
