from rest_framework import serializers
from .models import Tenant
from apps.user.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError


class TenantSerializer(serializers.ModelSerializer):
    """Serializer for Tenant model with all details."""
    
    user_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Tenant
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "address",
            "phone",
            "email",
            "is_active",
            "user_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at", "user_count"]
    
    def get_user_count(self, obj) -> int:
        """Get number of users in this tenant."""
        return obj.users.count()


class TenantCreateSerializer(serializers.ModelSerializer):
    """Create a tenant with its optional description and contact information."""
    
    class Meta:
        model = Tenant
        fields = ["name", "description", "address", "phone", "email"]


class TenantUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating tenant details."""
    
    class Meta:
        model = Tenant
        fields = ["name", "description", "address", "phone", "email", "is_active"]


class TenantUserSerializer(serializers.ModelSerializer):
    """Serializer for users in tenant context."""
    tenant_name = serializers.CharField(source='tenant.name', read_only=True, default=None)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True, default=None)
    
    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "is_active", "is_superuser", "date_joined", "last_login",
            "tenant_name", "tenant_slug",
        ]
        read_only_fields = ["id", "is_superuser", "date_joined", "last_login", "tenant_name", "tenant_slug"]


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users."""
    password = serializers.CharField(write_only=True, min_length=8)
    
    class Meta:
        model = User
        fields = ["username", "email", "password", "role"]

    def validate(self, attrs):
        user = User(**{key: value for key, value in attrs.items() if key != "password"})
        try:
            validate_password(attrs["password"], user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs
    
    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["first_name", "last_name", "email", "is_active", "role", "password"]

    def validate_email(self, value):
        if not value:
            raise serializers.ValidationError("Email is required.")
        if User.objects.filter(email__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("This email is already in use.")
        return value

    def validate_password(self, value):
        if value:
            try:
                validate_password(value, self.instance)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(exc.messages) from exc
        return value

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        if password:
            instance.set_password(password)
        return super().update(instance, validated_data)
