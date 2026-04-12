"""
Tenant middleware for multi-tenancy support.
Attaches the current tenant to the request based on the authenticated user.
"""
import threading

from django.http import HttpRequest


# Thread-local storage for current tenant
_thread_locals = threading.local()


def get_current_tenant():
    """Get the current tenant from thread-local storage."""
    return getattr(_thread_locals, "tenant", None)


def get_current_user():
    """Get the current user from thread-local storage."""
    return getattr(_thread_locals, "user", None)


class TenantMiddleware:
    """
    Middleware that attaches the tenant to the request.
    The tenant is determined from the authenticated user's tenant field.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest):
        # Clear thread locals at the start of each request
        _thread_locals.tenant = None
        _thread_locals.user = None

        # Set tenant from authenticated user
        if hasattr(request, "user") and request.user.is_authenticated:
            _thread_locals.user = request.user
            _thread_locals.tenant = getattr(request.user, "tenant", None)
            request.tenant = _thread_locals.tenant
        else:
            request.tenant = None

        response = self.get_response(request)

        # Clean up thread locals after request
        _thread_locals.tenant = None
        _thread_locals.user = None

        return response
