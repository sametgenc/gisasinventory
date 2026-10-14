from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "event_id", "content", "read_at", "created_at", "email_status"]
        read_only_fields = fields


class NotificationPreferencesSerializer(serializers.Serializer):
    email_notifications_enabled = serializers.BooleanField()
    preferred_language = serializers.ChoiceField(choices=["tr", "en"])
