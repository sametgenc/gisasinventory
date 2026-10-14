import logging
import uuid

from django.db import transaction
from django.http import JsonResponse

from .context import actor_snapshot, current_request
from .services import AuditPersistenceError, record_event

logger = logging.getLogger("apps.audit")


class AuditMiddleware:
    """Install before CSRF/auth/CAPTCHA so rejected requests are also audited."""

    def __init__(self, get_response):
        self.get_response = get_response

    def process_view(self, request, view_func, view_args, view_kwargs):
        request._audit_actor = actor_snapshot(request=request)

    def __call__(self, request):
        if not request.path_info.startswith(("/api/", "/admin/", "/accounts/", "/_allauth/")):
            return self.get_response(request)
        request.audit_request_id = uuid.uuid4()  # Never trust a caller-supplied correlation ID.
        context_token = current_request.set(request)
        try:
            try:
                with transaction.atomic():
                    response = self.get_response(request)
                    if getattr(request, "_audit_failed", False):
                        raise AuditPersistenceError("Security audit persistence unavailable")
                    if response.status_code >= 500:
                        transaction.set_rollback(True)
                    else:
                        self._record_response(request, response.status_code)
                if response.status_code >= 500:
                    self._record_response(request, response.status_code)
            except AuditPersistenceError:
                logger.error("audit_persistence_unavailable", extra={"audit_code": "audit_persistence_unavailable"})
                response = JsonResponse({"detail": "Security audit unavailable. Retry later."}, status=503)
            response["X-Request-ID"] = str(request.audit_request_id)
            return response
        finally:
            current_request.reset(context_token)

    @staticmethod
    def _record_response(request, status):
        if status >= 500:
            action, outcome = "http.failure", "failure"
        elif status >= 400:
            action, outcome = "http.denied", "denied"
        elif request.path_info.startswith("/admin/"):
            action, outcome = "admin.request", "success"
        else:
            action = "http.read" if request.method in {"GET", "HEAD", "OPTIONS"} else "http.write"
            outcome = "success"
        match = getattr(request, "resolver_match", None)
        kwargs = getattr(match, "kwargs", {})
        record_event(action, request=request, outcome=outcome, status_code=status,
                     object_id=kwargs.get("pk", kwargs.get("user_id")))
