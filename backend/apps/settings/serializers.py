import re

from django.conf import settings
from rest_framework import serializers

from .models import SmtpSettings


class SmtpSettingsSerializer(serializers.ModelSerializer):
    host = serializers.CharField(max_length=255, allow_blank=False)
    port = serializers.IntegerField(min_value=1, max_value=65535)
    from_email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, trim_whitespace=False,
        max_length=4096,
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
        read_only_fields = ["is_configured", "updated_at"]

    def get_password_set(self, obj: SmtpSettings) -> bool:
        return bool(obj.password)

    def _retained_password(self, username: str) -> str:
        if not username:
            return ''
        if (
            getattr(settings, "EMAIL_HOST", "")
            and username == getattr(settings, "EMAIL_HOST_USER", "")
        ):
            return getattr(settings, "EMAIL_HOST_PASSWORD", "")
        return ""

    def validate(self, attrs):
        def current(field, default=""):
            return attrs.get(field, getattr(self.instance, field, default))

        if not re.fullmatch(r"[A-Za-z0-9_.:-]+", current("host")):
            raise serializers.ValidationError({
                "host": "Enter an SMTP hostname or IP address."
            })
        use_tls = current("use_tls", True)
        use_ssl = current("use_ssl", False)
        if use_tls and use_ssl:
            raise serializers.ValidationError({"use_ssl": "Choose either TLS or SSL."})
        if not use_tls and not use_ssl and not getattr(settings, "DEMO_MODE", False):
            raise serializers.ValidationError({"use_tls": "TLS or SSL is required."})
        username = current("username")
        existing_password = (
            self.instance.password if self.instance is not None
            else self._retained_password(username)
        )
        if 'username' in attrs and not attrs['username']:
            # Explicitly removing SMTP authentication also removes its retained secret.
            existing_password = ''
        password_set = bool(attrs.get("password") or existing_password)
        if bool(username) != password_set:
            raise serializers.ValidationError({
                "password": "Provide both a username and password, or leave both empty for an SMTP relay."
            })
        return attrs

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        if 'username' in validated_data and not validated_data['username']:
            instance.set_password('')
        if password is not None and password != "":
            instance.set_password(password)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.is_configured = True
        instance.save()
        return instance

    def create(self, validated_data):
        password = validated_data.pop("password", "") or self._retained_password(
            validated_data.get("username", "")
        )
        validated_data["is_configured"] = True
        validated_data.setdefault("pk", 1)
        instance = SmtpSettings(**validated_data)
        instance.set_password(password)
        instance.save()
        return instance


class SmtpTestSerializer(serializers.Serializer):
    email = serializers.EmailField()
