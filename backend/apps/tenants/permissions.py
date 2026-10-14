"""
DRF Permission classes for multi-tenant authorization.
"""
from rest_framework import permissions


def is_global_admin(user):
    """Global access requires an active superuser account outside any shipyard."""
    return bool(user.is_authenticated and user.is_active and user.is_superuser and user.tenant_id is None)


class IsActiveTenantUser(permissions.BasePermission):
    """Disabled accounts and disabled memberships cannot read tenant data."""
    message = "Your account and shipyard must be active."

    def has_permission(self, request, view):
        user = request.user
        return bool(user.is_authenticated and user.is_active
                    and (user.tenant_id is None or user.tenant.is_active))


class IsPlatformAdmin(permissions.BasePermission):
    """
    Permission class that only allows platform admins (superusers).
    """
    message = "Only platform administrators can perform this action."

    def has_permission(self, request, view):
        return is_global_admin(request.user)


class IsTenantAdmin(permissions.BasePermission):
    """
    Permission class for explicit global admins and active shipyard admins.
    """
    message = "Only tenant administrators can perform this action."

    def has_permission(self, request, view):
        if not request.user.is_authenticated or not request.user.is_active:
            return False
        return (
            is_global_admin(request.user)
            or (request.user.is_tenant_admin and request.user.tenant is not None
                and request.user.tenant.is_active)
        )


class IsTenantMember(permissions.BasePermission):
    """
    Permission class that ensures user belongs to a tenant.
    Explicit global admins are allowed without shipyard membership.
    """
    message = "You must be a member of a tenant to perform this action."

    def has_permission(self, request, view):
        if not request.user.is_authenticated or not request.user.is_active:
            return False
        if is_global_admin(request.user):
            return True
        return request.user.tenant is not None and request.user.tenant.is_active


class TenantObjectPermission(permissions.BasePermission):
    """
    Object-level permission to ensure users can only access
    objects belonging to their tenant.
    """
    message = "You do not have permission to access this object."

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated or not request.user.is_active:
            return False
        
        # Platform admins can access all objects
        if is_global_admin(request.user):
            return True

        if request.user.tenant_id is None or not request.user.tenant.is_active:
            return False
        
        # Check if object has tenant field
        if hasattr(obj, "tenant"):
            return obj.tenant == request.user.tenant
        
        # Check if object has tenant_id field
        if hasattr(obj, "tenant_id"):
            return obj.tenant_id == getattr(request.user.tenant, "id", None)
        
        return False
