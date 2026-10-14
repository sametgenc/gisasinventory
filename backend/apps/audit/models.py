import uuid

from django.db import models
from django.utils import timezone


class AppendOnlyQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValueError("Audit events are append-only")

    def delete(self):
        raise ValueError("Audit events are append-only")

    def bulk_update(self, objs, fields, batch_size=None):
        raise ValueError("Audit events are append-only")

    def bulk_create(self, objs, batch_size=None, ignore_conflicts=False, update_conflicts=False,
                    update_fields=None, unique_fields=None):
        if update_conflicts:
            raise ValueError("Audit events are append-only")
        return super().bulk_create(objs, batch_size=batch_size, ignore_conflicts=ignore_conflicts,
                                   update_conflicts=False, update_fields=update_fields, unique_fields=unique_fields)

    def _raw_delete(self, using):
        raise ValueError("Audit events are append-only")


class AuditEvent(models.Model):
    """Actor and tenant IDs are snapshots, never cascading foreign keys."""

    class Outcome(models.TextChoices):
        ATTEMPTED = "attempted", "Attempted"
        SUCCESS = "success", "Success"
        DENIED = "denied", "Denied"
        FAILURE = "failure", "Failure"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    occurred_at = models.DateTimeField(default=timezone.now, editable=False)
    action = models.CharField(max_length=40)
    outcome = models.CharField(max_length=10, choices=Outcome.choices)
    actor_id = models.CharField(max_length=64, blank=True)
    actor_uuid = models.CharField(max_length=36, blank=True)
    actor_role = models.CharField(max_length=20, blank=True)
    actor_is_admin = models.BooleanField(default=False)
    actor_type = models.CharField(max_length=10, default="system")
    actor_tenant_id = models.BigIntegerField(null=True, blank=True)
    target_tenant_id = models.BigIntegerField(null=True, blank=True)
    object_type = models.CharField(max_length=80, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    field_names = models.JSONField(default=list)
    request_id = models.UUIDField(null=True, blank=True)
    method = models.CharField(max_length=10, blank=True)
    route = models.CharField(max_length=500, blank=True)
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    reason_code = models.CharField(max_length=40, blank=True)
    peer_ip = models.GenericIPAddressField(null=True, blank=True)

    objects = AppendOnlyQuerySet.as_manager()

    class Meta:
        ordering = ["occurred_at", "id"]
        base_manager_name = "objects"
        indexes = [
            models.Index(fields=["occurred_at"], name="audit_occurred_idx"),
            models.Index(fields=["actor_tenant_id", "occurred_at"], name="audit_tenant_time_idx"),
            models.Index(fields=["request_id"], name="audit_request_idx"),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("Audit events are append-only")
        kwargs["force_insert"] = True
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Audit events are append-only")

    def payload(self):
        return {
            "schema_version": 1,
            "event_id": str(self.pk),
            "occurred_at": self.occurred_at.isoformat(),
            **{name: getattr(self, name) for name in (
                "action", "outcome", "actor_id", "actor_uuid", "actor_role", "actor_is_admin",
                "actor_type", "actor_tenant_id", "target_tenant_id", "object_type", "object_id",
                "field_names", "method", "route", "status_code", "reason_code", "peer_ip",
            )},
            "request_id": str(self.request_id) if self.request_id else None,
        }


class SiemDelivery(models.Model):
    """Mutable delivery state stays separate from immutable evidence."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENDING = "sending", "Sending"
        FAILED = "failed", "Failed"
        SENT = "sent", "Sent"

    event = models.OneToOneField(AuditEvent, on_delete=models.PROTECT, related_name="delivery")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now, null=True, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    lease_id = models.UUIDField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    error_code = models.CharField(max_length=40, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "next_attempt_at"], name="audit_siem_due_idx")]
