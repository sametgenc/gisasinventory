from django.db import models
from django.conf import settings
from apps.tenants.models import Tenant
import uuid


class AssetType(models.Model):
    """
    Defines the schema/blueprint for a specific type of asset.
    e.g., "Forklift", "Generator", "Laptop".
    
    AssetTypes are GLOBAL - they can be used by any tenant.
    This allows standard asset definitions to be reused across shipyards.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    
    # schema defines the custom fields
    # Structure:
    # [
    #   {
    #     "key": "serial_number",
    #     "label": "Serial Number",
    #     "type": "text" | "number" | "date" | "select" | "checkbox",
    #     "required": boolean,
    #     "options": [] (for select),
    #     "default": value
    #   }
    # ]
    schema = models.JSONField(default=list, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        related_name='created_asset_types'
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Asset(models.Model):
    """
    Represents an actual asset instance based on an AssetType.
    Assets are TENANT-SPECIFIC - each asset belongs to a specific shipyard.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    tenant = models.ForeignKey(
        Tenant, 
        on_delete=models.CASCADE, 
        related_name='assets',
        help_text="The shipyard/tenant this asset belongs to"
    )
    asset_type = models.ForeignKey(
        AssetType, 
        on_delete=models.CASCADE, 
        related_name='assets'
    )
    
    # Stores the actual values for the dynamic fields defined in AssetType.schema
    # Structure: { "serial_number": "123-ABC", ... }
    custom_data = models.JSONField(default=dict, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        related_name='created_assets'
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='assigned_assets'
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'asset_type']),
        ]

    def __str__(self):
        # Try to find a meaningful identifier from custom_data, fallback to ID
        name = self.custom_data.get('name') or self.custom_data.get('title') or str(self.id)[:8]
        return f"{self.asset_type.name}: {name}"
