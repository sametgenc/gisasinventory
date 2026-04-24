import uuid

from django.conf import settings
from django.db import models


def feedback_attachment_path(instance, filename):
    return f"platform_feedback/{instance.feedback_id}/{filename}"


class PlatformFeedback(models.Model):
    """
    Bug reports and feature requests submitted by platform admins
    from inside the running application (via the feedback bubble).
    """

    TYPE_BUG = "bug"
    TYPE_FEATURE = "feature"
    TYPE_CHOICES = [
        (TYPE_BUG, "Bug"),
        (TYPE_FEATURE, "Feature"),
    ]

    STATUS_OPEN = "open"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_DONE = "done"
    STATUS_WONT_FIX = "wont_fix"
    STATUS_CHOICES = [
        (STATUS_OPEN, "Open"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_DONE, "Done"),
        (STATUS_WONT_FIX, "Won't Fix"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    type = models.CharField(max_length=16, choices=TYPE_CHOICES, default=TYPE_BUG)
    subject = models.CharField(max_length=255)
    description = models.TextField()
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_OPEN
    )

    # Context captured at submission time so we can reproduce the issue.
    page_url = models.CharField(max_length=500, blank=True, default="")
    user_agent = models.CharField(max_length=500, blank=True, default="")

    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="submitted_platform_feedback",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Platform Feedback"
        verbose_name_plural = "Platform Feedback"

    def __str__(self):
        return f"[{self.type}] {self.subject}"


class PlatformFeedbackAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    feedback = models.ForeignKey(
        PlatformFeedback,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to=feedback_attachment_path)
    original_name = models.CharField(max_length=255, blank=True, default="")
    size = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=120, blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["uploaded_at"]

    def __str__(self):
        return self.original_name or str(self.file)
