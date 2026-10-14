from django.db import models
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from apps.tenants.models import Tenant
import uuid
from .catalog_constants import CATEGORIES
from .validation import MAX_STOCK_QUANTITY, stock_quantity_value


class AssetType(models.Model):
    """
    Defines the schema/blueprint for a specific type of asset.
    e.g., "Forklift", "Generator", "Laptop".
    
    AssetTypes are GLOBAL - they can be used by any tenant.
    This allows standard asset definitions to be reused across shipyards.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class TrackingMode(models.TextChoices):
        INDIVIDUAL = 'individual', 'Tek tek ekipman'
        STOCK = 'stock', 'Adetli malzeme stoku'
    
    name = models.CharField(max_length=255, unique=True)
    tracking_mode = models.CharField(
        max_length=10, choices=TrackingMode.choices, default=TrackingMode.INDIVIDUAL,
    )
    description = models.TextField(blank=True)
    catalog_code = models.CharField(max_length=64, unique=True, null=True, blank=True)
    category_code = models.CharField(max_length=1, choices=CATEGORIES, blank=True)
    sharing_class = models.CharField(max_length=1, blank=True, choices=[
        ('A', 'Çok uygun'), ('B', 'Koşullu uygun'), ('C', 'Uygun değil'),
    ])
    exclusion_reason = models.CharField(max_length=500, blank=True)

    @property
    def sharing_excluded(self):
        return self.category_code == 'K' or self.sharing_class == 'C' or bool(self.exclusion_reason.strip())
    
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
    Represents individual equipment or a quantity stock line based on an AssetType.
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
        on_delete=models.PROTECT,
        related_name='assets'
    )
    
    # Stores the actual values for the dynamic fields defined in AssetType.schema
    # Structure: { "serial_number": "123-ABC", ... }
    custom_data = models.JSONField(default=dict, blank=True)

    # Sharing is an explicit owner decision, independent of inventory import.
    is_shared = models.BooleanField(default=False)
    sharing_note = models.CharField(max_length=1000, blank=True, default='')
    sharing_title = models.CharField(max_length=160, blank=True, default='')
    sharing_quantity = models.BigIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(MAX_STOCK_QUANTITY)],
    )
    sharing_capacity = models.CharField(max_length=160, blank=True, default='')

    class SharingAvailability(models.TextChoices):
        BY_ARRANGEMENT = 'by_arrangement', 'Görüşülerek belirlenir'
        AVAILABLE = 'available', 'Uygun'
        UNAVAILABLE = 'unavailable', 'Şu an uygun değil'

    sharing_availability = models.CharField(
        max_length=14, choices=SharingAvailability.choices, default=SharingAvailability.BY_ARRANGEMENT,
    )
    sharing_availability_note = models.CharField(max_length=255, blank=True, default='')
    sharing_contact_name = models.CharField(max_length=120, blank=True, default='')
    sharing_contact_email = models.EmailField(blank=True, default='')
    sharing_contact_phone = models.CharField(max_length=40, blank=True, default='')
    shared_at = models.DateTimeField(null=True, blank=True)

    @property
    def sharing_quantity_is_valid(self) -> bool:
        """An offer is separate from private stock; legacy offers need no quantity."""
        if self.sharing_availability not in self.SharingAvailability.values:
            return False
        quantity = self.sharing_quantity
        if quantity is None:
            return self.sharing_availability != self.SharingAvailability.AVAILABLE
        if isinstance(quantity, bool) or not isinstance(quantity, int) or not 1 <= quantity <= MAX_STOCK_QUANTITY:
            return False
        if self.asset_type.tracking_mode == AssetType.TrackingMode.INDIVIDUAL:
            return quantity == 1
        try:
            return quantity <= stock_quantity_value(self.custom_data.get('quantity'))
        except (AttributeError, ValueError):
            return False

    @property
    def sharing_needs_review(self) -> bool:
        return not self.sharing_quantity_is_valid

    @property
    def is_listed_for_sharing(self):
        return self.is_shared and self.tenant.is_active and not self.asset_type.sharing_excluded
    
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
            models.Index(fields=['is_shared', '-shared_at'], name='asset_shared_listing_idx'),
        ]

    def __str__(self):
        # Try to find a meaningful identifier from custom_data, fallback to ID
        name = (self.custom_data.get('material_name') or self.custom_data.get('name')
                or self.custom_data.get('title') or str(self.id)[:8])
        return f"{self.asset_type.name}: {name}"
