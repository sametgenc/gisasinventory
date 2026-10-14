"""Only the two participating shipyards can read or act on an agreement."""

from django.db.models import Q
from django.conf import settings
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from .usage import active_shipyard_member, create_usage_request, transition_usage_request
from .usage_models import SharedUsageRequest
from .usage_serializers import SharedUsageRequestSerializer, UsageActionSerializer, UsageCreateSerializer


class IsUsageShipyardMember(permissions.BasePermission):
    message = "Aktif bir tersane hesabı gerekir."

    def has_permission(self, request, view):
        return active_shipyard_member(request.user)


class IsCrossTenantSharingEnabled(permissions.BasePermission):
    """Historical agreements remain private while cross-shipyard sharing is disabled."""
    message = "Cross-shipyard sharing is disabled."

    def has_permission(self, request, view):
        return bool(getattr(settings, "CROSS_TENANT_SHARING_ENABLED", False))


class UsagePagination(PageNumberPagination):
    page_size = 24


class SharedUsageRequestViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SharedUsageRequestSerializer
    permission_classes = [permissions.IsAuthenticated, IsCrossTenantSharingEnabled, IsUsageShipyardMember]
    pagination_class = UsagePagination
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        tenant_id = self.request.user.tenant_id
        queryset = SharedUsageRequest.objects.select_related(
            "owner_tenant", "requester_tenant", "asset__tenant", "asset__asset_type",
        ).filter(Q(owner_tenant_id=tenant_id) | Q(requester_tenant_id=tenant_id))
        direction = self.request.query_params.get("direction", "")
        if direction == "sent":
            queryset = queryset.filter(requester_tenant_id=tenant_id)
        elif direction == "received":
            queryset = queryset.filter(owner_tenant_id=tenant_id)
        elif direction:
            raise ValidationError({"direction": "sent veya received seçin."})
        state = self.request.query_params.get("status", "")
        if state:
            if state not in SharedUsageRequest.Status.values:
                raise ValidationError({"status": "Geçerli bir talep durumu seçin."})
            queryset = queryset.filter(status=state)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = UsageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        values["asset_id"] = values.pop("asset")
        usage = create_usage_request(request.user, **values)
        return Response(self.get_serializer(usage).data, status=status.HTTP_201_CREATED)

    def _transition(self, request, action_name):
        usage = self.get_object()
        serializer = UsageActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = transition_usage_request(request.user, usage.pk, action_name, **serializer.validated_data)
        return Response(self.get_serializer(result).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._transition(request, "approve")

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._transition(request, "reject")

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._transition(request, "cancel")

    @action(detail=True, methods=["post"])
    def handover(self, request, pk=None):
        return self._transition(request, "handover")

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        return self._transition(request, "receive")
