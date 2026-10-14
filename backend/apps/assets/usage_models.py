"""Free shared-use requests retain the agreement after inventory is removed."""

import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from .validation import MAX_STOCK_QUANTITY


class SharedUsageRequest(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "requested", "Onay bekliyor"
        APPROVED = "approved", "Onaylandı"
        ACTIVE = "active", "Teslim edildi"
        RETURNED = "returned", "İade alındı"
        REJECTED = "rejected", "Reddedildi"
        CANCELLED = "cancelled", "İptal edildi"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey("assets.Asset", on_delete=models.SET_NULL, null=True,
                              related_name="usage_requests")
    owner_tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT,
                                     related_name="received_usage_requests")
    requester_tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT,
                                         related_name="sent_usage_requests")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, related_name="requested_equipment_usage")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name="approved_equipment_usage")
    handed_over_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                       null=True, blank=True, related_name="handed_over_equipment_usage")
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name="received_equipment_usage")
    listing_snapshot = models.JSONField(default=dict)
    start_date = models.DateField()
    end_date = models.DateField()
    quantity = models.BigIntegerField(validators=[MinValueValidator(1), MaxValueValidator(MAX_STOCK_QUANTITY)])
    purpose = models.CharField(max_length=1000, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.REQUESTED)
    decision_note = models.CharField(max_length=1000, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    handed_over_at = models.DateTimeField(null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["owner_tenant", "status", "-created_at"], name="usage_owner_status_idx"),
            models.Index(fields=["requester_tenant", "status", "-created_at"], name="usage_sender_status_idx"),
            models.Index(fields=["asset", "status", "start_date", "end_date"], name="usage_asset_period_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(end_date__gte=models.F("start_date")), name="usage_valid_period"),
            models.CheckConstraint(condition=models.Q(quantity__gte=1, quantity__lte=MAX_STOCK_QUANTITY), name="usage_valid_quantity"),
            models.CheckConstraint(condition=~models.Q(owner_tenant=models.F("requester_tenant")), name="usage_distinct_shipyards"),
        ]

    def __str__(self):
        return f"{self.id}: {self.get_status_display()}"
