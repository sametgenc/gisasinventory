"""Turnstile enforcement at every public authentication mutation boundary."""
import json
import logging
import re

import requests
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_GET

logger = logging.getLogger(__name__)
SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
PUBLIC_AUTH_PATH = re.compile(
    r"^/_allauth/(?:browser|app)/v1/auth/(?:login|signup|code/(?:request|confirm)"
    r"|password/(?:request|reset)|email/verify(?:/resend)?|phone/verify(?:/resend)?"
    r"|provider/(?:redirect|token|signup)|webauthn/(?:login|signup|authenticate)"
    r"|2fa/authenticate)/?$"
)


def captcha_enabled():
    return getattr(settings, "TURNSTILE_ENABLED", not settings.DEBUG)


@require_GET
def captcha_config(request):
    """The public site key is safe to expose; the secret never leaves the server."""
    response = JsonResponse({
        "enabled": captcha_enabled(),
        "site_key": settings.TURNSTILE_SITE_KEY if captcha_enabled() else "",
    })
    response["Cache-Control"] = "no-store"
    return response


def verify_token(token, action):
    """Fail closed on invalid tokens, upstream failures, or wrong widget context."""
    if not isinstance(token, str) or not token.strip() or len(token) > 2048:
        return False, "missing_or_invalid_token"
    secret = getattr(settings, "TURNSTILE_SECRET_KEY", "")
    hosts = getattr(settings, "TURNSTILE_ALLOWED_HOSTNAMES", [])
    if not secret or not hosts:
        return False, "unconfigured"
    try:
        # Do not let process proxy variables reroute the secret-bearing request.
        with requests.Session() as client:
            client.trust_env = False
            response = client.post(
                SITEVERIFY_URL,
                data={"secret": secret, "response": token},
                timeout=5,
                allow_redirects=False,
                verify=True,
            )
            try:
                response.raise_for_status()
                if response.status_code != 200:
                    return False, "verification_unavailable"
                result = response.json()
            finally:
                response.close()
    except (requests.RequestException, ValueError):
        logger.warning("CAPTCHA verification service unavailable")
        return False, "verification_unavailable"
    if not isinstance(result, dict) or result.get("success") is not True:
        return False, "verification_failed"
    if result.get("action") != action:
        return False, "action_mismatch"
    if result.get("hostname") not in hosts:
        return False, "hostname_mismatch"
    return True, None


class CaptchaMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Allauth's app client must not provide a route around browser checks.
        action = self.action_for(request)
        if captcha_enabled() and action:
            token = request.headers.get("X-Captcha-Token")
            if token is None:
                if request.content_type == "application/json":
                    try:
                        body = json.loads(request.body)
                    except (ValueError, UnicodeDecodeError):
                        body = None
                    token = body.get("captcha_token") if isinstance(body, dict) else None
                else:
                    token = request.POST.get("cf-turnstile-response")
            valid, reason = verify_token(token, action)
            if not valid:
                request.captcha_failure = reason
                return JsonResponse({
                    "status": 403,
                    "errors": [{
                        "code": "captcha_failed",
                        "param": "captcha_token",
                        "message": "Security verification failed. Complete the challenge and try again.",
                    }],
                }, status=403)
        return self.get_response(request)

    @staticmethod
    def action_for(request):
        if request.method not in {"POST", "PUT", "PATCH"}:
            return None
        if PUBLIC_AUTH_PATH.fullmatch(request.path_info):
            return "authenticate"
        if request.path_info.rstrip("/") == "/admin/login":
            return "admin_login"
        # Traditional allauth auth is not used by this SPA (HEADLESS_ONLY); deny
        # an accidentally re-enabled login endpoint without CAPTCHA as well.
        if re.fullmatch(
            r"/accounts/(?:login/?|signup/?|password/reset(?:/.*)?|[^/]+/login/?)",
            request.path_info,
        ):
            return "authenticate"
        if re.fullmatch(r"/_allauth/(?:browser|app)/v1/account/email/?", request.path_info):
            # Allauth allows email verification resend during a pending signup.
            if not getattr(getattr(request, "user", None), "is_authenticated", False):
                return "authenticate"
        return None
