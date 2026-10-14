import uuid
from django.db import models, transaction
from django.contrib.auth.models import AbstractUser
from django.utils.crypto import salted_hmac


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

    email_notifications_enabled = models.BooleanField(default=True)

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"

    @property
    def is_platform_admin(self) -> bool:
        return self.role == UserRole.PLATFORM_ADMIN

    @property
    def is_tenant_admin(self) -> bool:
        return self.role == UserRole.TENANT_ADMIN

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        changes_membership = update_fields is None or bool({"tenant", "tenant_id"}.intersection(update_fields))
        if not self.pk or not changes_membership:
            return super().save(*args, **kwargs)
        with transaction.atomic():
            previous = type(self).objects.select_for_update(no_key=True).filter(pk=self.pk).values("tenant_id").first()
            result = super().save(*args, **kwargs)
            if previous and previous["tenant_id"] != self.tenant_id:
                from apps.assets.models import Asset

                # Membership changes from admin or management code must not
                # expose the transferred user's identity in the old inventory.
                Asset.objects.filter(assigned_to_id=self.pk).exclude(tenant_id=self.tenant_id).update(assigned_to=None)
            return result

    def _get_session_auth_hash(self, secret=None):
        """A shipyard or privilege change revokes previously authenticated sessions."""
        password_hash = super()._get_session_auth_hash(secret=secret)
        membership = f"{password_hash}:{self.tenant_id}:{self.role}:{self.is_staff}:{self.is_superuser}"
        return salted_hmac(
            "gisas.user.membership_session", membership, secret=secret, algorithm="sha256",
        ).hexdigest()
