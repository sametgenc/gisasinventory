import logging
import re

from django.db import DatabaseError, transaction

from .context import actor_snapshot, current_request, request_context, safe_id
from .models import AuditEvent, SiemDelivery

logger = logging.getLogger("apps.audit")
VALID_ACTIONS = {
    "http.read", "http.write", "http.denied", "http.failure", "admin.request",
    "model.create", "model.update", "model.delete", "model.membership",
    "auth.login", "auth.logout", "auth.login_failed", "admin.add", "admin.change", "admin.delete",
}
REASON_CODES = {
    "missing_or_invalid_token", "unconfigured", "verification_unavailable", "verification_failed",
    "action_mismatch", "hostname_mismatch", "rate_limited",
}


class AuditPersistenceError(RuntimeError):
    """Persistence failures must prevent the audited request from committing."""


def record_event(action, *, outcome="success", actor=None, request=None, object_type="", object_id=None,
                 target_tenant_id=None, field_names=(), status_code=None, reason_code=None):
    if action not in VALID_ACTIONS or outcome not in AuditEvent.Outcome.values:
        raise ValueError("Unknown audit action or outcome")
    request = request if request is not None else current_request.get()
    if reason_code is None:
        reason_code = getattr(request, "captcha_failure", "") if request is not None else ""
    reason_code = reason_code if isinstance(reason_code, str) and reason_code in REASON_CODES else ""
    identity = actor_snapshot(actor, request)
    if actor is None and request is not None:
        initial_identity = getattr(request, "_audit_actor", {})
        if initial_identity.get("actor_type") == "user" or identity.get("actor_type") != "user":
            identity = initial_identity or identity
    fields = sorted({name for name in field_names if isinstance(name, str) and re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]{0,63}", name)})
    if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*", object_type):
        object_type = ""
    try:
        with transaction.atomic():
            event = AuditEvent.objects.create(
                action=action, outcome=outcome, **identity, **request_context(request),
                object_type=object_type[:80], object_id=safe_id(object_id), field_names=fields,
                target_tenant_id=target_tenant_id if isinstance(target_tenant_id, int) else None,
                status_code=status_code,
                reason_code=reason_code,
            )
            SiemDelivery.objects.create(event=event)
            # Local structured output is supplementary; DB evidence is authoritative.
            transaction.on_commit(lambda: logger.info("audit_event", extra={"audit_event": event.payload()}), robust=True)
        return event
    except DatabaseError as error:
        if request is not None:
            request._audit_failed = True
        raise AuditPersistenceError("Security audit persistence unavailable") from error
