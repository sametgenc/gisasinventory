"""Private business-event visibility follows the event's original shipyard."""

from django.db.models import Q

from apps.tenants.permissions import is_global_admin
from .models import Notification


def visible_notifications(user):
    queryset = Notification.objects.filter(user=user, deleted_at__isnull=True)
    if not user.is_active:
        return queryset.none()
    business_scope = Q(tenant_scope_known=True)
    business_scope &= (Q(content__audience_role__isnull=True) | Q(content__audience_role=None)
                       | Q(content__audience_role='')
                       | Q(content__audience_role=user.role))
    business_scope &= (Q(content__audience_tenant_id__isnull=True) | Q(content__audience_tenant_id=None)
                       | Q(content__audience_tenant_id=str(user.tenant_id)))
    if not is_global_admin(user):
        business_scope &= ~Q(content__audience_global_admin=True) | Q(content__audience_global_admin__isnull=True)
        if user.tenant_id is not None and not user.tenant.is_active:
            return queryset.filter(is_security=True)
        business_scope &= Q(tenant_id=user.tenant_id)
    return queryset.filter(Q(is_security=True) | business_scope)


def notification_is_visible(notification):
    """Re-read membership before background delivery or a live-stream event."""
    return visible_notifications(notification.user).filter(pk=notification.pk).exists()
