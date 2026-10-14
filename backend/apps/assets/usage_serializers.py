"""Inputs never accept the approver, owner, status, or an inventory snapshot."""

from collections.abc import Mapping

from rest_framework import serializers

from .usage import allowed_actions
from .usage_models import SharedUsageRequest
from .validation import MAX_STOCK_QUANTITY, stock_quantity_value


class PositiveQuantityField(serializers.Field):
    def to_internal_value(self, value):
        try:
            quantity = stock_quantity_value(value)
            if quantity < 1:
                raise ValueError
            return quantity
        except ValueError:
            raise serializers.ValidationError(f"Adet 1 ile {MAX_STOCK_QUANTITY} arasında tam sayı olmalı.")

    def to_representation(self, value):
        return value


class StrictInputSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, Mapping):
            raise serializers.ValidationError({"detail": "Alanları bir nesne olarak gönderin."})
        unknown = set(data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError({key: "Bu alan bu işlemde değiştirilemez." for key in sorted(unknown)})
        return super().to_internal_value(data)


class UsageCreateSerializer(StrictInputSerializer):
    asset = serializers.UUIDField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    quantity = PositiveQuantityField()
    purpose = serializers.CharField(max_length=1000, allow_blank=True, required=False, default="")

    def validate(self, data):
        if data["end_date"] < data["start_date"]:
            raise serializers.ValidationError({"end_date": "Bitiş başlangıçtan önce olamaz."})
        return data


class UsageActionSerializer(StrictInputSerializer):
    note = serializers.CharField(max_length=1000, allow_blank=True, required=False, default="")


class SharedUsageRequestSerializer(serializers.ModelSerializer):
    owner_tenant_name = serializers.CharField(source="owner_tenant.name", read_only=True)
    requester_tenant_name = serializers.CharField(source="requester_tenant.name", read_only=True)
    allowed_actions = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = SharedUsageRequest
        fields = ["id", "asset", "owner_tenant", "owner_tenant_name", "requester_tenant",
                  "requester_tenant_name", "requested_by", "listing_snapshot", "start_date", "end_date",
                  "quantity", "purpose", "status", "status_label", "decision_note", "approved_at",
                  "handed_over_at", "returned_at", "closed_at", "created_at", "updated_at", "allowed_actions"]
        read_only_fields = fields

    def get_allowed_actions(self, obj):
        return allowed_actions(self.context["request"].user, obj)
