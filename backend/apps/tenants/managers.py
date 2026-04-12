"""
Tenant-scoped manager and queryset for automatic tenant filtering.
"""
from django.db import models

from .middleware import get_current_tenant


class TenantScopedQuerySet(models.QuerySet):
    """QuerySet that automatically filters by tenant."""

    def for_tenant(self, tenant):
        """Filter queryset for a specific tenant."""
        if tenant is None:
            return self.none()
        return self.filter(tenant=tenant)

    def for_current_tenant(self):
        """Filter queryset for the current request's tenant."""
        tenant = get_current_tenant()
        return self.for_tenant(tenant)


class TenantScopedManager(models.Manager):
    """
    Manager that automatically scopes queries to the current tenant.
    
    Usage:
        class Asset(models.Model):
            tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
            ...
            objects = TenantScopedManager()
    """

    def get_queryset(self):
        return TenantScopedQuerySet(self.model, using=self._db)

    def for_tenant(self, tenant):
        """Get objects for a specific tenant."""
        return self.get_queryset().for_tenant(tenant)

    def for_current_tenant(self):
        """Get objects for the current request's tenant."""
        return self.get_queryset().for_current_tenant()


class TenantScopedModel(models.Model):
    """
    Abstract base model for tenant-scoped models.
    Provides tenant FK and uses TenantScopedManager.
    """
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="%(class)s_set",
    )

    objects = TenantScopedManager()
    all_objects = models.Manager()  # Unscoped manager for admin/platform access

    class Meta:
        abstract = True
