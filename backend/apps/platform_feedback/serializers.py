"""Stable feedback response fields and bounded user-supplied text."""

from urllib.parse import urlsplit

from django.urls import reverse
from rest_framework import serializers

from apps.tenants.permissions import is_global_admin
from apps.user.models import User

from .models import PlatformFeedback, PlatformFeedbackAttachment, PlatformFeedbackEvent


SAFE_PAGE_PATHS = {
    '/dashboard', '/assets', '/assets/types', '/shared-equipment', '/shared-usage',
    '/help', '/development-requests', '/notifications', '/account/email',
    '/account/password', '/account/authenticators', '/platform/tenants',
    '/platform/users', '/platform/settings', '/tenant/users',
}


def safe_page_path(value):
    if not isinstance(value, str) or not value.startswith('/') or value.startswith('//'):
        return ''
    if '\\' in value or any(ord(char) < 32 for char in value):
        return ''
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or '%' in parsed.path or '..' in parsed.path:
        return ''
    return parsed.path if parsed.path in SAFE_PAGE_PATHS else ''


class PlatformFeedbackAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = PlatformFeedbackAttachment
        fields = ['id', 'original_name', 'size', 'content_type', 'url', 'uploaded_at']
        read_only_fields = fields

    def get_url(self, obj):
        if not obj.file:
            return None
        url = reverse('platform-feedback-download-attachment', kwargs={
            'id': obj.feedback_id, 'attachment_id': obj.pk,
        })
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url


def user_display(user):
    if user is None:
        return None
    return user.get_full_name() or ('Platform yöneticisi' if is_global_admin(user) else 'Kullanıcı')


def visible_email(user, request):
    if user and (is_global_admin(request.user) or user.pk == request.user.pk):
        return user.email
    return None


class PlatformFeedbackEventSerializer(serializers.ModelSerializer):
    created_by_email = serializers.SerializerMethodField()
    created_by_display = serializers.SerializerMethodField()

    def get_created_by_email(self, obj):
        return visible_email(obj.created_by, self.context['request'])

    def get_created_by_display(self, obj):
        return user_display(obj.created_by)

    class Meta:
        model = PlatformFeedbackEvent
        fields = ['id', 'kind', 'body', 'before', 'after', 'created_by', 'created_by_email', 'created_by_display', 'created_at']
        read_only_fields = fields


class PlatformFeedbackSerializer(serializers.ModelSerializer):
    attachments = PlatformFeedbackAttachmentSerializer(many=True, read_only=True)
    submitted_by_email = serializers.SerializerMethodField()
    assigned_to_email = serializers.SerializerMethodField()
    assigned_to_display = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source='tenant.name', read_only=True, default=None)
    history = PlatformFeedbackEventSerializer(many=True, read_only=True)
    allowed_actions = serializers.SerializerMethodField()
    description = serializers.CharField(max_length=10000)
    proposed_solution = serializers.CharField(max_length=5000, required=False, allow_blank=True)
    expected_benefit = serializers.CharField(max_length=5000, required=False, allow_blank=True)
    user_agent = serializers.CharField(max_length=500, required=False, allow_blank=True)
    page_url = serializers.CharField(max_length=2000, required=False, allow_blank=True)

    class Meta:
        model = PlatformFeedback
        fields = [
            'id', 'type', 'subject', 'description', 'proposed_solution', 'expected_benefit', 'area',
            'priority', 'status', 'page_url', 'user_agent', 'submitted_by', 'submitted_by_email',
            'tenant', 'tenant_name', 'assigned_to', 'assigned_to_email', 'assigned_to_display', 'created_at', 'updated_at',
            'attachments', 'history', 'allowed_actions',
        ]
        read_only_fields = ['id', 'submitted_by', 'tenant', 'created_at', 'updated_at']

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        if request is None or not is_global_admin(request.user):
            # DRF OPTIONS must not enumerate other users through a writable relation.
            for name in ['status', 'priority', 'assigned_to']:
                fields[name].read_only = True
        return fields

    def get_submitted_by_email(self, obj):
        return visible_email(obj.submitted_by, self.context['request'])

    def get_assigned_to_email(self, obj):
        return visible_email(obj.assigned_to, self.context['request'])

    def get_assigned_to_display(self, obj):
        return user_display(obj.assigned_to)

    def validate_page_url(self, value):
        return safe_page_path(value)

    def validate_assigned_to(self, user):
        if user is not None and not is_global_admin(user):
            raise serializers.ValidationError('Sorumlu aktif bir platform yöneticisi olmalıdır.')
        return user

    def get_allowed_actions(self, obj):
        user = self.context['request'].user
        return ['message', 'triage', 'edit', 'delete'] if is_global_admin(user) else ['message']


class FeedbackMessageSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=5000)


class FeedbackTriageSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=PlatformFeedback.STATUS_CHOICES, required=False)
    priority = serializers.ChoiceField(choices=PlatformFeedback.PRIORITY_CHOICES, required=False)
    assigned_to = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), allow_null=True, required=False)
    note = serializers.CharField(max_length=5000, required=False, allow_blank=True)

    def validate_assigned_to(self, user):
        if user is not None and not is_global_admin(user):
            raise serializers.ValidationError('Sorumlu aktif bir platform yöneticisi olmalıdır.')
        return user
