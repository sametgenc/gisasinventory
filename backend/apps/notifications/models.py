import uuid

from django.db import models
from django.conf import settings
from django.utils import timezone


class Notification(models.Model):
    class EmailStatus(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        PREVIEW = "preview", "Local preview"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    event_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    deduplication_key = models.CharField(max_length=180, null=True, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    tenant = models.ForeignKey(
        "tenants.Tenant", on_delete=models.CASCADE, null=True, blank=True,
        related_name="notifications", editable=False,
    )
    tenant_scope_known = models.BooleanField(default=True, editable=False)
    content = models.JSONField(
        help_text="Notification data (title, message, type, etc.)"
    )
    read_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    email_status = models.CharField(max_length=10, choices=EmailStatus.choices, default=EmailStatus.SKIPPED)
    email_attempts = models.PositiveSmallIntegerField(default=0)
    email_error_code = models.CharField(max_length=40, blank=True, default="")
    email_next_attempt_at = models.DateTimeField(null=True, blank=True)
    email_locked_at = models.DateTimeField(null=True, blank=True)
    email_sent_at = models.DateTimeField(null=True, blank=True)
    is_security = models.BooleanField(default=False, editable=False)
    email_recipient = models.EmailField(blank=True, default="", editable=False)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "deduplication_key"], name="notification_user_event_unique"),
        ]
        indexes = [models.Index(fields=["email_status", "email_next_attempt_at"], name="notification_email_due")]

    def __str__(self):
        return f"Notification for {self.user.username} at {self.created_at}"

    def save(self, *args, **kwargs):
        if self._state.adding and not self.is_security and self.tenant_id is None:
            self.tenant_id = self.user.tenant_id
        super().save(*args, **kwargs)

    def delete(self, using=None, keep_parents=False, force=False):
        if force:
            return super().delete(using=using, keep_parents=keep_parents)
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at"])
        return 1, {"notifications.Notification": 1}
