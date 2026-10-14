from contextvars import ContextVar
from ipaddress import ip_address
import re
from uuid import UUID

from django.conf import settings


current_request = ContextVar("audit_current_request", default=None)
VALID_ROLES = {"platform_admin", "tenant_admin", "tenant_user"}


def safe_id(value):
    if isinstance(value, bool) or value is None:
        return ""
    if isinstance(value, int):
        return str(value) if 0 <= value < 2**63 else ""
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, str):
        if re.fullmatch(r"[0-9]{1,18}", value):
            return value
        try:
            return str(UUID(value))
        except ValueError:
            pass
    return ""


def actor_snapshot(user=None, request=None):
    if user is None and request is not None:
        user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return {"actor_type": "anonymous" if request is not None else "system"}
    role = getattr(user, "role", "")
    tenant_id = getattr(user, "tenant_id", None)
    return {
        "actor_id": safe_id(user.pk),
        "actor_uuid": safe_id(getattr(user, "uuid", None)),
        "actor_role": role if role in VALID_ROLES else "",
        "actor_is_admin": bool(user.is_superuser or user.is_staff or role in {"platform_admin", "tenant_admin"}),
        "actor_type": "user",
        "actor_tenant_id": tenant_id if isinstance(tenant_id, int) else None,
    }


def request_context(request):
    if request is None:
        return {}
    match = getattr(request, "resolver_match", None)
    route = getattr(match, "route", None) or "<unresolved>"
    # Only the server-defined route template is retained. Never use path/get_full_path.
    route = "".join(char for char in str(route) if ord(char) >= 32)[:500]
    remote_ip = request.META.get("REMOTE_ADDR", "")
    if getattr(settings, "AUDIT_TRUST_PROXY_IP", False):
        remote_ip = request.META.get("HTTP_X_REAL_IP", remote_ip)
    try:
        remote_ip = str(ip_address(remote_ip))
    except ValueError:
        remote_ip = None
    return {
        "request_id": getattr(request, "audit_request_id", None),
        "method": request.method if request.method in {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"} else "OTHER",
        "route": route,
        "peer_ip": remote_ip,
    }
