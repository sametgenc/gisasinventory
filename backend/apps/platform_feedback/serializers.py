from rest_framework import serializers

from .models import PlatformFeedback, PlatformFeedbackAttachment


class PlatformFeedbackAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = PlatformFeedbackAttachment
        fields = ["id", "original_name", "size", "content_type", "url", "uploaded_at"]
        read_only_fields = fields

    def get_url(self, obj):
        request = self.context.get("request")
        if not obj.file:
            return None
        url = obj.file.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url


class PlatformFeedbackSerializer(serializers.ModelSerializer):
    attachments = PlatformFeedbackAttachmentSerializer(many=True, read_only=True)
    submitted_by_email = serializers.SerializerMethodField()

    class Meta:
        model = PlatformFeedback
        fields = [
            "id",
            "type",
            "subject",
            "description",
            "status",
            "page_url",
            "user_agent",
            "submitted_by",
            "submitted_by_email",
            "created_at",
            "updated_at",
            "attachments",
        ]
        read_only_fields = [
            "id",
            "submitted_by",
            "submitted_by_email",
            "created_at",
            "updated_at",
            "attachments",
        ]

    def get_submitted_by_email(self, obj):
        return getattr(obj.submitted_by, "email", None)
