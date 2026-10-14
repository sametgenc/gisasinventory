"""Keep the unrestricted Django admin behind global ownership and allauth MFA."""

import json
import hashlib
import logging
from datetime import datetime, timezone

from django.conf import settings
from django.contrib.auth import HASH_SESSION_KEY, logout
from django.http import HttpResponseForbidden, HttpResponseRedirect, JsonResponse
from django.utils.crypto import constant_time_compare


class SecurityLogFormatter(logging.Formatter):
    """Framework errors must never print reset keys, query values or tracebacks."""

    def format(self, record):
        request = getattr(record, "request", None)
        match = getattr(request, "resolver_match", None)
        return json.dumps({
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "event": "framework.security",
            "logger": record.name,
            "level": record.levelname,
            "route": getattr(match, "route", None),
            "status": getattr(record, "status_code", None),
        }, separators=(",", ":"))


class SecurityAccessMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from apps.tenants.permissions import is_global_admin

        path = request.path_info
        # This application uses CSRF-protected browser sessions exclusively.
        # Headless app endpoints replace sessions and intentionally exempt CSRF.
        if path.startswith("/_allauth/app/"):
            response = JsonResponse({"detail": "Not found."}, status=404)
            response["Cache-Control"] = "private, no-store"
            return response
        if path.startswith(("/api/", "/_allauth/", "/accounts/", "/admin/")) and request.user.is_authenticated:
            from apps.user.models import User

            # AuditMiddleware keeps this lock until the response and evidence
            # commit. Membership changes cannot race a private inventory read.
            locked_user = User.objects.select_for_update(no_key=True).get(pk=request.user.pk)
            session_hash = request.session.get(HASH_SESSION_KEY, "")
            if not session_hash or not constant_time_compare(session_hash, locked_user.get_session_auth_hash()):
                # AuthenticationMiddleware may have validated the previous
                # membership just before a transfer committed. Recheck under lock.
                logout(request)
            else:
                request.user = locked_user
        if (path.startswith("/api/") and path not in {"/api/auth/captcha/", "/api/settings/smtp/status/"}
                and is_global_admin(request.user) and getattr(settings, "ADMIN_REQUIRE_MFA", True)):
            from apps.settings.security import mfa_status

            state = mfa_status(request)
            if not state["mfa_enabled"] or not state["mfa_verified_recently"]:
                response = JsonResponse({
                    "code": "mfa_verification_required" if state["mfa_enabled"] else "mfa_setup_required",
                    "detail": "Enable and verify MFA through /account/authenticators before using administrator APIs.",
                }, status=403)
                response["Cache-Control"] = "private, no-store"
                return response
        if path.startswith("/admin/"):
            user = request.user
            if not user.is_authenticated:
                response = HttpResponseRedirect("/login")
            elif not is_global_admin(user) or not user.is_staff:
                response = HttpResponseForbidden("Global administrator access is required.")
            elif getattr(settings, "ADMIN_REQUIRE_MFA", True):
                from apps.settings.security import mfa_status

                state = mfa_status(request)
                if not state["mfa_enabled"] or not state["mfa_verified_recently"]:
                    response = HttpResponseForbidden(
                        "Enable MFA and verify your account through /account/authenticators "
                        "before opening the administrator site."
                    )
                elif path == "/admin/login/":
                    response = HttpResponseRedirect("/admin/")
                else:
                    response = self.get_response(request)
            elif path == "/admin/login/":
                response = HttpResponseRedirect("/admin/")
            else:
                response = self.get_response(request)
        else:
            response = self.get_response(request)

        if path.startswith(("/api/", "/_allauth/", "/accounts/", "/admin/")):
            response["Cache-Control"] = "private, no-store"
            response["Pragma"] = "no-cache"
            response["Referrer-Policy"] = "no-referrer"
            response["X-Content-Type-Options"] = "nosniff"
        return response


class AuthenticationRateLimitMiddleware:
    """Bound upstream CAPTCHA work with a shared, fail-closed per-IP counter."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from django.core.cache import cache
        from apps.user.adapters import CustomAccountAdapter
        from apps.user.captcha import CaptchaMiddleware, captcha_enabled

        if captcha_enabled() and CaptchaMiddleware.action_for(request):
            address = CustomAccountAdapter().get_client_ip(request)
            key = "captcha-attempts:" + hashlib.sha256(address.encode()).hexdigest()
            try:
                cache.add(key, 0, timeout=60)
                count = cache.incr(key)
            except Exception:
                logging.getLogger("django.security").error("authentication_rate_limit_unavailable")
                return JsonResponse({"detail": "Security verification unavailable. Retry later."}, status=503)
            if count > getattr(settings, "AUTH_CAPTCHA_RATE_LIMIT", 60):
                request.captcha_failure = "rate_limited"
                response = JsonResponse({
                    "status": 429,
                    "errors": [{"code": "rate_limited", "message": "Too many attempts. Retry later."}],
                }, status=429)
                response["Retry-After"] = "60"
                return response
        return self.get_response(request)
