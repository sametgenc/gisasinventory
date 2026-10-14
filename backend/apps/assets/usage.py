"""Shipyard-owned approvals and serialized capacity reservations; no fees."""

from collections import defaultdict
from datetime import date

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError

from .models import Asset, AssetType
from .usage_models import SharedUsageRequest
from .usage_notifications import notify_usage_status
from .validation import missing_required_fields, stock_quantity_from_data, stock_quantity_value

UNSET = object()
OPEN_STATUSES = ("requested", "approved", "active")
RESERVED_STATUSES = ("approved", "active")


class UsageConflict(APIException):
    status_code = 409
    default_detail = "Talebin durumu değişti. Ekranı yenileyip tekrar deneyin."
    default_code = "usage_conflict"


def active_shipyard_member(user) -> bool:
    return bool(user.is_authenticated and user.is_active and user.tenant_id
                and user.tenant.is_active and user.role in ("tenant_user", "tenant_admin"))


def owner_manager(user, usage: SharedUsageRequest) -> bool:
    return bool(active_shipyard_member(user) and user.role == "tenant_admin"
                and user.tenant_id == usage.owner_tenant_id
                and usage.asset_id and usage.asset.tenant_id == usage.owner_tenant_id)


def requester_can_cancel(user, usage: SharedUsageRequest) -> bool:
    return bool(active_shipyard_member(user) and user.tenant_id == usage.requester_tenant_id
                and (user.role == "tenant_admin" or user.pk == usage.requested_by_id))


def allowed_actions(user, usage: SharedUsageRequest) -> list[str]:
    actions = []
    if owner_manager(user, usage):
        if usage.status == "requested":
            actions.extend(["approve", "reject"])
        elif usage.status == "approved":
            actions.extend(["handover", "cancel"])
        elif usage.status == "active":
            actions.append("receive")
    if requester_can_cancel(user, usage) and usage.status in ("requested", "approved"):
        if "cancel" not in actions:
            actions.append("cancel")
    return actions


def reservation_peak(asset, start_date=None, end_date=None, *, exclude_id=None) -> int:
    """Inclusive periods: disjoint reservations do not consume the same capacity."""
    start_date = start_date or timezone.localdate()
    end_date = end_date or date.max
    reservations = SharedUsageRequest.objects.filter(
        asset_id=asset.pk, status__in=RESERVED_STATUSES, start_date__lte=end_date,
    ).filter(Q(status="active") | Q(end_date__gte=start_date))
    if exclude_id:
        reservations = reservations.exclude(pk=exclude_id)
    events = defaultdict(int)
    start_bound, end_bound = start_date.toordinal(), end_date.toordinal()
    for status, start, end, quantity in reservations.values_list("status", "start_date", "end_date", "quantity"):
        left = max(start_bound, start.toordinal())
        right = end_bound if status == "active" else min(end_bound, end.toordinal())
        if left <= right:
            events[left] += quantity
            events[right + 1] -= quantity
    current = peak = 0
    for point in sorted(events):
        current += events[point]
        peak = max(peak, current)
    return peak


def inventory_quantity(asset, custom_data=None) -> int | None:
    if asset.asset_type.tracking_mode == AssetType.TrackingMode.INDIVIDUAL:
        return 1
    return stock_quantity_from_data(asset.asset_type.schema, asset.custom_data if custom_data is None else custom_data)


def validate_inventory_usage_change(asset, *, tenant_id=None, asset_type_id=None,
                                    custom_data=None, sharing_quantity=UNSET) -> None:
    """Call inside the inventory writer's transaction, with Asset locked first."""
    open_requests = SharedUsageRequest.objects.filter(asset_id=asset.pk, status__in=OPEN_STATUSES)
    owner_changed = tenant_id is not None and str(tenant_id) != str(asset.tenant_id)
    type_changed = asset_type_id is not None and str(asset_type_id) != str(asset.asset_type_id)
    if (owner_changed or type_changed) and open_requests.exists():
        raise ValidationError({"detail": "Bu ekipmanda açık kullanım talebi var. Önce talepleri kapatın."})
    reserved = reservation_peak(asset)
    if not reserved:
        return
    if custom_data is not None:
        total = inventory_quantity(asset, custom_data)
        previous_total = inventory_quantity(asset)
        decreased = total is None and previous_total is not None
        decreased = decreased or (total is not None and (previous_total is None or total < previous_total))
        if decreased and (total is None or total < reserved):
            raise ValidationError({"custom_data": "Envanter adedi onaylanan ve teslim edilen taleplerin altında olamaz."})
    if sharing_quantity is not UNSET:
        previous_offer = asset.sharing_quantity
        decreased = sharing_quantity is None and previous_offer is not None
        decreased = decreased or (sharing_quantity is not None and (previous_offer is None or sharing_quantity < previous_offer))
        if decreased and (sharing_quantity is None or sharing_quantity < reserved):
            raise ValidationError({"sharing_quantity": "Paylaşım adedi açık onayların altında olamaz. Önce talepleri kapatın."})


def validate_inventory_usage_delete(asset) -> None:
    if SharedUsageRequest.objects.filter(asset_id=asset.pk, status__in=OPEN_STATUSES).exists():
        raise ValidationError({"detail": "Bu ekipmanda açık kullanım talebi var. Silmeden önce talepleri kapatın."})


def _require_complete(asset) -> None:
    if missing_required_fields(asset.asset_type.schema, asset.custom_data):
        raise UsageConflict("Ekipmanın zorunlu bilgileri eksik. Sahibi envanteri güncellemeli.")


def _require_sharing_enabled() -> None:
    if not getattr(settings, "CROSS_TENANT_SHARING_ENABLED", False):
        raise PermissionDenied("Ortak kullanım henüz açılmadı.")


def _require_listing(asset) -> int:
    _require_sharing_enabled()
    if (not asset.is_shared or not asset.tenant.is_active or asset.asset_type.sharing_excluded
            or asset.sharing_availability == Asset.SharingAvailability.UNAVAILABLE):
        raise UsageConflict("Ekipman şu an yeni taleplere açık değil.")
    _require_complete(asset)
    owned = inventory_quantity(asset)
    offered = asset.sharing_quantity
    if (owned is None or offered is None or isinstance(offered, bool)
            or offered < 1 or offered > owned):
        raise UsageConflict("Sahibi paylaşılabilir adedi belirlemeli.")
    return offered


def _snapshot(asset) -> dict:
    return {"title": asset.sharing_title or asset.asset_type.name, "asset_type_name": asset.asset_type.name,
            "catalog_code": asset.asset_type.catalog_code, "category_code": asset.asset_type.category_code,
            "sharing_capacity": asset.sharing_capacity, "sharing_note": asset.sharing_note,
            "sharing_availability_note": asset.sharing_availability_note,
            "sharing_contact_name": asset.sharing_contact_name,
            "sharing_contact_email": asset.sharing_contact_email,
            "sharing_contact_phone": asset.sharing_contact_phone}


@transaction.atomic
def create_usage_request(user, *, asset_id, start_date, end_date, quantity, purpose="") -> SharedUsageRequest:
    if not active_shipyard_member(user):
        raise PermissionDenied("Talep için aktif bir tersane hesabı gerekir.")
    _require_sharing_enabled()
    asset = Asset.objects.select_for_update(of=("self",)).select_related("tenant", "asset_type").filter(
        pk=asset_id, is_shared=True, tenant__is_active=True,
    ).first()
    if asset is None:
        raise NotFound("Ekipman ortak listede bulunamadı.")
    # Asset before AssetType matches inventory writers and prevents stale schema checks.
    asset.asset_type = AssetType.objects.select_for_update().get(pk=asset.asset_type_id)
    if asset.tenant_id == user.tenant_id:
        raise ValidationError({"asset": "Kendi tersanenizin ekipmanı için talep oluşturamazsınız."})
    if start_date < timezone.localdate() or end_date < start_date:
        raise ValidationError({"start_date": "Başlangıç bugün veya sonrası olmalı; bitiş başlangıçtan önce olamaz."})
    try:
        quantity = stock_quantity_value(quantity)
        if quantity < 1:
            raise ValueError
    except ValueError:
        raise ValidationError({"quantity": "Talep adedi pozitif tam sayı olmalı."})
    offered = _require_listing(asset)
    if quantity > offered:
        raise UsageConflict({"detail": "Talep adedi paylaşıma açılan adedi aşıyor.", "available_quantity": offered})
    usage = SharedUsageRequest.objects.create(
        asset=asset, owner_tenant=asset.tenant, requester_tenant=user.tenant, requested_by=user,
        listing_snapshot=_snapshot(asset), start_date=start_date, end_date=end_date, quantity=quantity, purpose=purpose,
    )
    notify_usage_status(usage)
    return usage


@transaction.atomic
def transition_usage_request(user, usage_id, action, *, note="") -> SharedUsageRequest:
    if not active_shipyard_member(user):
        raise PermissionDenied("Aktif bir tersane hesabı gerekir.")
    initial = SharedUsageRequest.objects.filter(pk=usage_id).filter(
        Q(owner_tenant_id=user.tenant_id) | Q(requester_tenant_id=user.tenant_id),
    ).first()
    if initial is None:
        raise NotFound()
    asset = None
    if initial.asset_id:
        asset = Asset.objects.select_for_update(of=("self",)).select_related("asset_type", "tenant").filter(pk=initial.asset_id).first()
    usage = SharedUsageRequest.objects.select_for_update(of=("self",)).select_related(
        "owner_tenant", "requester_tenant", "requested_by__tenant",
    ).get(pk=usage_id)
    usage.asset = asset
    is_owner = owner_manager(user, usage)
    if action == "cancel":
        if not (is_owner or requester_can_cancel(user, usage)):
            raise PermissionDenied("Bu talebi iptal etme yetkiniz yok.")
    elif not is_owner:
        raise PermissionDenied("Bu adımı ekipman sahibi tersanenin yöneticisi tamamlamalı.")
    targets = {"approve": "approved", "reject": "rejected", "cancel": "cancelled", "handover": "active", "receive": "returned"}
    expected = {"approve": ("requested",), "reject": ("requested",), "cancel": ("requested", "approved"),
                "handover": ("approved",), "receive": ("active",)}
    if action not in targets:
        raise ValidationError("Bilinmeyen talep işlemi.")
    if usage.status == targets[action]:
        return usage
    if usage.status not in expected[action]:
        raise UsageConflict()
    now = timezone.now()
    if action in ("approve", "handover"):
        _require_sharing_enabled()
        if not usage.requester_tenant.is_active or not usage.owner_tenant.is_active:
            raise UsageConflict("Her iki tersane de aktif olmalı.")
        asset.asset_type = AssetType.objects.select_for_update().get(pk=asset.asset_type_id)
        _require_complete(asset)
        if asset.asset_type.sharing_excluded:
            raise UsageConflict("Bu ekipman türü ortak kullanıma kapalı.")
        if usage.end_date < timezone.localdate():
            raise UsageConflict("Talebin planlanan kullanım tarihi geçti. Yeni bir talep oluşturun.")
    if action == "approve":
        offered = _require_listing(asset)
        available = max(0, offered - reservation_peak(asset, usage.start_date, usage.end_date, exclude_id=usage.pk))
        if usage.quantity > available:
            raise UsageConflict({"detail": "Bu tarihler için yeterli paylaşım adedi yok.", "available_quantity": available})
        usage.approved_by = user
        usage.approved_at = now
    elif action == "handover":
        if usage.start_date > timezone.localdate():
            raise UsageConflict("Teslim işlemi başlangıç tarihinde yapılabilir.")
        # A previous borrower may still hold equipment after its planned return.
        # Recheck delivery, even when approval originally covered disjoint dates.
        owned = inventory_quantity(asset)
        offered = asset.sharing_quantity
        if owned is None or offered is None or offered > owned:
            raise UsageConflict("Envanter ile paylaşım adedi uyumsuz. Sahibi envanteri kontrol etmeli.")
        capacity = offered
        available = max(0, capacity - reservation_peak(
            asset, timezone.localdate(), usage.end_date, exclude_id=usage.pk,
        ))
        if usage.quantity > available:
            raise UsageConflict({"detail": "Önceki kullanım iade edilmedi veya adet değişti. Teslim için yeterli adet yok.",
                                 "available_quantity": available})
        usage.handed_over_by = user
        usage.handed_over_at = now
    elif action == "receive":
        usage.received_by = user
        usage.returned_at = now
        usage.closed_at = now
    elif action in ("reject", "cancel"):
        usage.closed_at = now
    if action in ("approve", "reject", "cancel"):
        usage.decision_note = note
    usage.status = targets[action]
    usage.save()
    notify_usage_status(usage)
    return usage
