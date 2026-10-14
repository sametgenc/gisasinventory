"""Agreement notifications contain no private inventory or request text."""

from apps.notifications.services import create_notification
from apps.user.models import User, UserRole

from .usage_models import SharedUsageRequest


def notify_usage_status(usage: SharedUsageRequest) -> None:
    recipients = {
        user.pk: (user, "tenant_admin")
        for user in User.objects.filter(
            tenant_id__in=[usage.owner_tenant_id, usage.requester_tenant_id],
            role=UserRole.TENANT_ADMIN, is_active=True, tenant__is_active=True,
        )
    }
    requester = usage.requested_by
    if (requester and requester.is_active and requester.tenant_id == usage.requester_tenant_id
            and requester.tenant.is_active):
        # The creator keeps its own request updates even after a manager demotion.
        recipients[requester.pk] = (requester, "")
    labels = dict(SharedUsageRequest.Status.choices)
    english = {
        "requested": "Awaiting approval", "approved": "Approved", "active": "Handed over",
        "returned": "Return received", "rejected": "Rejected", "cancelled": "Cancelled",
    }
    for user, role in recipients.values():
        is_english = user.preferred_language == "en"
        title = "Shared-use request updated" if is_english else "Ortak kullanım talebi güncellendi"
        status = english[usage.status] if is_english else labels[usage.status]
        message = (f"Request status: {status}. Open the request to review the agreement."
                   if is_english else f"Talep durumu: {status}. Ayrıntılar için talebi açın.")
        content = {
            "title": title, "message": message, "type": "info", "event_type": "shared_usage",
            "url": f"/shared-usage?request={usage.pk}", "usage_request_id": str(usage.pk),
            "audience_tenant_id": str(user.tenant_id),
        }
        if role:
            content["audience_role"] = role
        create_notification(user, content, event_key=f"usage:{usage.pk}:{usage.status}")
