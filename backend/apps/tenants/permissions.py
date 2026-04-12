"""
DRF Permission classes for multi-tenant authorization.
"""
from rest_framework import permissions


class IsPlatformAdmin(permissions.BasePermission):
    """
    Permission class that only allows platform admins (superusers).
    """
    message = "Only platform administrators can perform this action."

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.is_superuser
        )


class IsTenantAdmin(permissions.BasePermission):
    """
    Permission class that allows Django superusers, tenant admins, or users
    with the platform_admin role (for API actions shared with tenant admins).
    """
    message = "Only tenant administrators can perform this action."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return (
            request.user.is_superuser
            or request.user.is_platform_admin
            or request.user.is_tenant_admin
        )


class IsTenantMember(permissions.BasePermission):
    """
    Permission class that ensures user belongs to a tenant.
    Platform admins are always allowed.
    """
    message = "You must be a member of a tenant to perform this action."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_platform_admin:
            return True
        return request.user.tenant is not None


class TenantObjectPermission(permissions.BasePermission):
    """
    Object-level permission to ensure users can only access
    objects belonging to their tenant.
    """
    message = "You do not have permission to access this object."

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        
        # Platform admins can access all objects
        if request.user.is_platform_admin:
            return True
        
        # Check if object has tenant field
        if hasattr(obj, "tenant"):
            return obj.tenant == request.user.tenant
        
        # Check if object has tenant_id field
        if hasattr(obj, "tenant_id"):
            return obj.tenant_id == getattr(request.user.tenant, "id", None)
        
        return False
