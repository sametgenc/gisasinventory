from rest_framework import serializers

from .models import PlatformRelease, PlatformReleaseAttachment


class PlatformReleaseAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = PlatformReleaseAttachment
        fields = [
            "id",
            "original_name",
            "size",
            "content_type",
            "url",
            "uploaded_at",
        ]
        read_only_fields = fields

    def get_url(self, obj):
        request = self.context.get("request")
        if not obj.file:
            return None
        url = obj.file.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url


class PlatformReleaseSerializer(serializers.ModelSerializer):
    attachments = PlatformReleaseAttachmentSerializer(many=True, read_only=True)
    created_by_email = serializers.SerializerMethodField()

    class Meta:
        model = PlatformRelease
        fields = [
            "id",
            "version",
            "type",
            "title",
            "body",
            "status",
            "published_at",
            "created_by",
            "created_by_email",
            "created_at",
            "updated_at",
            "attachments",
        ]
        read_only_fields = [
            "id",
            "published_at",
            "created_by",
            "created_by_email",
            "created_at",
            "updated_at",
            "attachments",
        ]

    def get_created_by_email(self, obj):
        return getattr(obj.created_by, "email", None)
