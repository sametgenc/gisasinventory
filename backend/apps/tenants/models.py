from django.db import models
from django.utils.text import slugify


class Tenant(models.Model):
    """
    Represents a shipyard/organization in the multi-tenant system.
    Each tenant has isolated data and users.
    """
    name = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    
    description = models.TextField(
        blank=True,
        default="",
        help_text="Tersane hakkında açıklama veya notlar"
    )
    
    # Contact info
    address = models.TextField(blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Tenant"
        verbose_name_plural = "Tenants"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)
    
    def get_display_name(self, language: str = "tr") -> str:
        """Get the localized display name."""
        return self.name

