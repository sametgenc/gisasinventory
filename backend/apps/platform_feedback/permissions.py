"""Request authors retain access only within their original active membership."""

from rest_framework.permissions import BasePermission

from apps.tenants.permissions import is_global_admin


def can_use_feedback(user):
    return bool(user.is_authenticated and user.is_active and (
        is_global_admin(user) or (user.tenant_id is not None and user.tenant.is_active)
    ))


def can_read_feedback(user, feedback):
    return bool(can_use_feedback(user) and (
        is_global_admin(user) or (
            feedback.submitted_by_id == user.pk and feedback.tenant_id == user.tenant_id
        )
    ))


class IsFeedbackParticipant(BasePermission):
    message = 'Aktif hesabınız ve tersane üyeliğiniz gerekir.'

    def has_permission(self, request, view):
        return can_use_feedback(request.user)
