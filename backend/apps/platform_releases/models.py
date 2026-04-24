import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


def release_attachment_path(instance, filename):
    return f"platform_releases/{instance.release_id}/{filename}"


class PlatformRelease(models.Model):
    """
    Represents a platform-wide release note / changelog entry
    created by a platform admin. Can be tied to a version and contain
    feature announcements, bug fixes, improvements, etc.
    """

    TYPE_FEATURE = "feature"
    TYPE_BUGFIX = "bugfix"
    TYPE_IMPROVEMENT = "improvement"
    TYPE_ANNOUNCEMENT = "announcement"
    TYPE_CHOICES = [
        (TYPE_FEATURE, "Feature"),
        (TYPE_BUGFIX, "Bugfix"),
        (TYPE_IMPROVEMENT, "Improvement"),
        (TYPE_ANNOUNCEMENT, "Announcement"),
    ]

    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_PUBLISHED, "Published"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    version = models.CharField(
        max_length=64,
        help_text="Free-form version label, e.g. v1.2.0",
    )
    type = models.CharField(
        max_length=32,
        choices=TYPE_CHOICES,
        default=TYPE_FEATURE,
    )
    title = models.CharField(max_length=255)
    body = models.TextField(
        blank=True,
        default="",
        help_text="Markdown-formatted description",
    )

    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
    )
    published_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_platform_releases",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Platform Release"
        verbose_name_plural = "Platform Releases"
        indexes = [
            models.Index(fields=["status", "-published_at"]),
        ]

    def __str__(self):
        return f"[{self.version}] {self.title}"

    def mark_published(self):
        self.status = self.STATUS_PUBLISHED
        if not self.published_at:
            self.published_at = timezone.now()
        self.save(update_fields=["status", "published_at", "updated_at"])

    def mark_draft(self):
        self.status = self.STATUS_DRAFT
        self.save(update_fields=["status", "updated_at"])


class PlatformReleaseAttachment(models.Model):
    """
    File attachments (screenshots, docs) tied to a platform release.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    release = models.ForeignKey(
        PlatformRelease,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to=release_attachment_path)
    original_name = models.CharField(max_length=255, blank=True, default="")
    size = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=120, blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_release_attachments",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["uploaded_at"]

    def __str__(self):
        return self.original_name or str(self.file)
