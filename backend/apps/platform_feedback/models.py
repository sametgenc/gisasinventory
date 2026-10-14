"""Private improvement requests with an append-only discussion history."""

import uuid
from pathlib import PurePosixPath

from django.conf import settings
from django.db import models


def feedback_attachment_path(instance, filename):
    """Never use a supplied name as a storage path."""
    extension = PurePosixPath(filename.replace('\\', '/')).suffix.lower()
    return f"platform_feedback/{instance.feedback_id}/{uuid.uuid4().hex}{extension}"


class PlatformFeedback(models.Model):
    TYPE_BUG = 'bug'
    TYPE_FEATURE = 'feature'
    TYPE_SUGGESTION = 'suggestion'
    TYPE_CHOICES = [(TYPE_BUG, 'Bug'), (TYPE_FEATURE, 'Feature'), (TYPE_SUGGESTION, 'Suggestion')]

    STATUS_OPEN = 'open'
    STATUS_IN_REVIEW = 'in_review'
    STATUS_PLANNED = 'planned'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_DONE = 'done'
    STATUS_WONT_FIX = 'wont_fix'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'), (STATUS_IN_REVIEW, 'In Review'), (STATUS_PLANNED, 'Planned'),
        (STATUS_IN_PROGRESS, 'In Progress'), (STATUS_DONE, 'Done'), (STATUS_WONT_FIX, "Won't Fix"),
    ]
    AREA_CHOICES = [
        ('inventory', 'Inventory'), ('excel', 'Excel'), ('sharing', 'Sharing'),
        ('account', 'Account'), ('other', 'Other'),
    ]
    PRIORITY_CHOICES = [('low', 'Low'), ('normal', 'Normal'), ('high', 'High')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(max_length=16, choices=TYPE_CHOICES, default=TYPE_BUG)
    subject = models.CharField(max_length=255)
    description = models.TextField()
    proposed_solution = models.TextField(blank=True, default='')
    expected_benefit = models.TextField(blank=True, default='')
    area = models.CharField(max_length=16, choices=AREA_CHOICES, default='other')
    priority = models.CharField(max_length=16, choices=PRIORITY_CHOICES, default='normal')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_OPEN)
    page_url = models.CharField(max_length=500, blank=True, default='')
    user_agent = models.CharField(max_length=500, blank=True, default='')
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='submitted_platform_feedback',
    )
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.PROTECT, null=True, blank=True,
        related_name='platform_feedback', editable=False,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assigned_platform_feedback',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']
        verbose_name = 'Platform Feedback'
        verbose_name_plural = 'Platform Feedback'
        indexes = [models.Index(fields=['submitted_by', 'tenant', '-created_at'], name='feedback_author_scope')]

    def __str__(self):
        return f'[{self.type}] {self.subject}'


class PlatformFeedbackAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    feedback = models.ForeignKey(PlatformFeedback, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to=feedback_attachment_path)
    original_name = models.CharField(max_length=255, blank=True, default='')
    size = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=120, blank=True, default='')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']

    def __str__(self):
        return self.original_name or str(self.file)


class PlatformFeedbackEvent(models.Model):
    KIND_CHOICES = [
        ('created', 'Created'), ('message', 'Message'), ('status', 'Status'),
        ('assignment', 'Assignment'), ('priority', 'Priority'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    feedback = models.ForeignKey(PlatformFeedback, on_delete=models.CASCADE, related_name='history')
    kind = models.CharField(max_length=16, choices=KIND_CHOICES)
    body = models.TextField(blank=True, default='')
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='platform_feedback_events',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
