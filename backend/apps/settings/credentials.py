"""Encryption for persisted application credentials."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


PREFIX = "fernet:v1:"


def _cipher(key_setting: str) -> Fernet:
    configured_key = getattr(settings, key_setting, "")
    key = configured_key or base64.urlsafe_b64encode(
        hashlib.sha256(
            f"{settings.SECRET_KEY}:{key_setting}".encode("utf-8")
        ).digest()
    )
    try:
        return Fernet(key)
    except (TypeError, ValueError) as exc:
        raise ImproperlyConfigured("Credential encryption key is invalid.") from exc


def encrypt_secret(value: str, key_setting: str = "SMTP_CREDENTIAL_KEY") -> str:
    if not value:
        return ""
    return PREFIX + _cipher(key_setting).encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str, key_setting: str = "SMTP_CREDENTIAL_KEY") -> str:
    if not value or not value.startswith(PREFIX):
        # Older installations stored plaintext. Encrypt it on their next save.
        return value
    try:
        return _cipher(key_setting).decrypt(
            value[len(PREFIX):].encode("ascii")
        ).decode("utf-8")
    except (InvalidToken, UnicodeError, ValueError) as exc:
        raise ImproperlyConfigured(
            "Credentials cannot be decrypted with the configured encryption key."
        ) from exc


def encrypt_password(value: str) -> str:
    return encrypt_secret(value)


def decrypt_password(value: str) -> str:
    return decrypt_secret(value)
