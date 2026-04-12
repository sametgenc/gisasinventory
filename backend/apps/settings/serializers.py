from rest_framework import serializers

from .models import SmtpSettings


class SmtpSettingsSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True
    )
    password_set = serializers.SerializerMethodField()

    class Meta:
        model = SmtpSettings
        fields = [
            "host",
            "port",
            "username",
            "password",
            "password_set",
            "use_tls",
            "use_ssl",
            "from_email",
            "is_configured",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def get_password_set(self, obj) -> bool:
        return bool(obj.password)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        if password is not None and password != "":
            instance.password = password
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.is_configured = True
        instance.save()
        return instance

    def create(self, validated_data):
        validated_data["is_configured"] = True
        validated_data.setdefault("pk", 1)
        instance = SmtpSettings(**validated_data)
        instance.save()
        return instance
