"""Protect mail settings with recent authentication; honor optional MFA."""

import math
import time

from allauth.account.authentication import get_authentication_records
from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from django.conf import settings
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request
from rest_framework.views import APIView


PRIMARY_FACTORS = (Authenticator.Type.TOTP, Authenticator.Type.WEBAUTHN)


class IsActivePlatformAdmin(permissions.BasePermission):
    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return user.is_authenticated and user.is_active and user.is_superuser


def mfa_status(request: Request) -> dict[str, bool]:
    authenticators = {
        obj.pk: obj.type
        for obj in Authenticator.objects.filter(
            user=request.user, type__in=PRIMARY_FACTORS
        ).only("id", "type")
    }
    verified = False
    password_or_code_verified = False
    now = time.time()
    timeout = getattr(settings, "ACCOUNT_REAUTHENTICATION_TIMEOUT", 300)
    for record in get_authentication_records(request):
        if not isinstance(record, dict):
            continue
        timestamp = record.get("at")
        if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)):
            continue
        if not math.isfinite(timestamp) or not 0 <= now - timestamp < timeout:
            continue
        method = record.get("method")
        if method == "password":
            password_or_code_verified = True
            continue
        if method == "code":
            email = record.get("email")
            if isinstance(email, str) and EmailAddress.objects.filter(
                user=request.user, email__iexact=email, verified=True
            ).exists():
                password_or_code_verified = True
            continue
        if method != "mfa":
            continue
        factor_id = record.get("id")
        if isinstance(factor_id, bool) or not isinstance(factor_id, int):
            continue
        factor_type = authenticators.get(factor_id)
        if factor_type and factor_type == record.get("type"):
            verified = True
            break
    mfa_enabled = bool(authenticators)
    return {
        "mfa_enabled": mfa_enabled,
        "mfa_verified_recently": verified,
        "reauthentication_required": not (
            verified if mfa_enabled else password_or_code_verified
        ),
    }


def require_recent_authentication(request: Request) -> None:
    state = mfa_status(request)
    if state["reauthentication_required"]:
        raise PermissionDenied({
            "code": (
                "mfa_verification_required" if state["mfa_enabled"]
                else "reauthentication_required"
            ),
            "detail": "Verify your account again to change mail settings or send a test.",
        })
