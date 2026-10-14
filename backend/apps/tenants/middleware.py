"""
Tenant middleware for multi-tenancy support.
Attaches the current tenant to the request based on the authenticated user.
"""
from contextvars import ContextVar

from django.http import HttpRequest


# Context isolation also protects concurrent ASGI tasks on a shared thread.
_current_tenant = ContextVar("current_tenant", default=None)
_current_user = ContextVar("current_tenant_user", default=None)


def get_current_tenant():
    """Get the tenant attached to the current request context."""
    return _current_tenant.get()


def get_current_user():
    """Get the user attached to the current request context."""
    return _current_user.get()


class TenantMiddleware:
    """
    Middleware that attaches the tenant to the request.
    The tenant is determined from the authenticated user's tenant field.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest):
        user = None
        tenant = None
        if hasattr(request, "user") and request.user.is_authenticated:
            user = request.user
            tenant = getattr(user, "tenant", None)
        request.tenant = tenant
        tenant_token = _current_tenant.set(tenant)
        user_token = _current_user.set(user)
        try:
            return self.get_response(request)
        finally:
            _current_tenant.reset(tenant_token)
            _current_user.reset(user_token)
