"""Mail transport using saved SMTP settings, with explicit environment fallback."""

import logging
from dataclasses import dataclass, field

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.core.mail.backends.smtp import EmailBackend as DjangoSmtpBackend

logger = logging.getLogger(__name__)

PREVIEW_BACKENDS = {
    "django.core.mail.backends.console.EmailBackend",
    "django.core.mail.backends.locmem.EmailBackend",
    "django.core.mail.backends.filebased.EmailBackend",
    "django.core.mail.backends.dummy.EmailBackend",
}


class SmtpNotConfiguredError(Exception):
    pass


@dataclass
class SmtpConfiguration:
    host: str
    port: int
    username: str
    password: str = field(repr=False)
    use_tls: bool
    use_ssl: bool
    from_email: str


def delivery_mode() -> str:
    backend = settings.EMAIL_BACKEND
    if getattr(settings, "DEMO_MODE", False) or backend in PREVIEW_BACKENDS:
        return "preview"
    return "smtp"


def smtp_configuration(*, decrypt: bool = True) -> SmtpConfiguration:
    from .models import SmtpSettings

    saved = SmtpSettings.load()
    if saved and saved.is_configured:
        config = SmtpConfiguration(
            host=saved.host,
            port=saved.port,
            username=saved.username,
            password=saved.get_password() if decrypt else saved.password,
            use_tls=saved.use_tls,
            use_ssl=saved.use_ssl,
            from_email=saved.from_email,
        )
    else:
        config = SmtpConfiguration(
            host=getattr(settings, "EMAIL_HOST", ""),
            port=getattr(settings, "EMAIL_PORT", 587),
            username=getattr(settings, "EMAIL_HOST_USER", ""),
            password=getattr(settings, "EMAIL_HOST_PASSWORD", ""),
            use_tls=getattr(settings, "EMAIL_USE_TLS", False),
            use_ssl=getattr(settings, "EMAIL_USE_SSL", False),
            from_email=settings.DEFAULT_FROM_EMAIL,
        )
    if (
        not config.host.strip()
        or not config.from_email
        or not 1 <= config.port <= 65535
        or (config.use_tls and config.use_ssl)
        or (not config.use_tls and not config.use_ssl and not getattr(settings, "DEMO_MODE", False))
        or bool(config.username) != bool(config.password)
    ):
        raise SmtpNotConfiguredError("SMTP settings are missing or incomplete.")
    return config


def smtp_is_configured() -> bool:
    try:
        smtp_configuration(decrypt=False)
        return True
    except SmtpNotConfiguredError:
        return False


class DatabaseEmailBackend(DjangoSmtpBackend):
    def __init__(self, *args, **kwargs):
        timeout = kwargs.get("timeout") or getattr(settings, "EMAIL_TIMEOUT", None) or 15
        kwargs["timeout"] = min(max(float(timeout), 1), 15)
        super().__init__(*args, **kwargs)

    def _load_db_settings(self) -> SmtpConfiguration:
        config = smtp_configuration()
        self.host = config.host
        self.port = config.port
        self.username = config.username
        self.password = config.password
        self.use_tls = config.use_tls
        self.use_ssl = config.use_ssl
        return config

    def open(self) -> bool | None:
        self._load_db_settings()
        return super().open()

    def send_messages(self, email_messages: list[EmailMessage]) -> int:
        if not email_messages:
            return 0
        if getattr(settings, "DEMO_MODE", False):
            preview = get_connection(
                backend="django.core.mail.backends.console.EmailBackend",
                fail_silently=self.fail_silently,
            )
            return preview.send_messages(email_messages)
        config = self._load_db_settings()
        for message in email_messages:
            message.from_email = config.from_email
        try:
            sent = super().send_messages(email_messages)
        except Exception:
            # SMTP provider responses may contain credentials or recipient details.
            logger.error("SMTP delivery failed.")
            raise
        logger.info("SMTP delivery completed: messages=%s", sent)
        return sent
