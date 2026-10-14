from django.contrib import admin

from .models import AuditEvent, SiemDelivery


class EvidenceAdmin(admin.ModelAdmin):
    actions = None

    def has_module_permission(self, request):
        return bool(request.user.is_superuser and request.user.is_active)

    def has_view_permission(self, request, obj=None):
        return self.has_module_permission(request)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AuditEvent)
class AuditEventAdmin(EvidenceAdmin):
    list_display = ["occurred_at", "action", "outcome", "actor_id", "actor_role", "actor_tenant_id", "status_code"]
    list_filter = ["action", "outcome", "actor_role"]
    search_fields = ["actor_id", "object_id", "request_id"]
    readonly_fields = [field.name for field in AuditEvent._meta.fields]


@admin.register(SiemDelivery)
class SiemDeliveryAdmin(EvidenceAdmin):
    list_display = ["event", "status", "attempts", "next_attempt_at", "error_code", "delivered_at"]
    list_filter = ["status", "error_code"]
    readonly_fields = [field.name for field in SiemDelivery._meta.fields]
