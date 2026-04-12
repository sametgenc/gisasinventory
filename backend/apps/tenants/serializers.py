from rest_framework import serializers
from .models import Tenant
from apps.user.models import User


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
    """Serializer for creating tenants - only name required, slug auto-generated."""
    
    class Meta:
        model = Tenant
        fields = ["name"]


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
            "role", "is_active", "date_joined", "last_login",
            "tenant_name", "tenant_slug",
        ]
        read_only_fields = ["id", "date_joined", "last_login", "tenant_name", "tenant_slug"]


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users."""
    password = serializers.CharField(write_only=True, min_length=8)
    
    class Meta:
        model = User
        fields = ["username", "email", "password", "role"]
    
    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
