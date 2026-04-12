import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser


class UserRole(models.TextChoices):
    """User roles for permission management."""
    PLATFORM_ADMIN = "platform_admin", "Platform Admin"
    TENANT_ADMIN = "tenant_admin", "Tenant Admin"
    TENANT_USER = "tenant_user", "Tenant User"


class User(AbstractUser):
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
        help_text="The tenant this user belongs to. Null for platform admins."
    )
    
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.TENANT_USER,
    )
    
    preferred_language = models.CharField(
        max_length=5,
        choices=[("tr", "Türkçe"), ("en", "English")],
        default="tr",
    )

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"

    @property
    def is_platform_admin(self) -> bool:
        return self.role == UserRole.PLATFORM_ADMIN

    @property
    def is_tenant_admin(self) -> bool:
        return self.role == UserRole.TENANT_ADMIN

