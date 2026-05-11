import logging
import ssl

from django.core.mail import EmailMessage
from django.core.mail.backends.smtp import EmailBackend as DjangoSmtpBackend

logger = logging.getLogger(__name__)


class SmtpNotConfiguredError(Exception):
    pass


class DatabaseEmailBackend(DjangoSmtpBackend):
    """
    Custom email backend that loads SMTP settings from the database
    (SmtpSettings singleton) instead of Django settings.

    Raises SmtpNotConfiguredError if SMTP has not been configured yet.
    """

    def _load_db_settings(self):
        from apps.settings.models import SmtpSettings

        config = SmtpSettings.load()
        if config is None or not config.is_configured:
            raise SmtpNotConfiguredError(
                "SMTP settings are not configured. "
                "Please configure SMTP settings in the admin panel."
            )

        self.host = config.host
        self.port = config.port
        self.username = config.username
        self.password = config.password
        self.use_tls = config.use_tls
        self.use_ssl = config.use_ssl

        if self.use_ssl and self.ssl_certfile is None:
            self.ssl_context = ssl.create_default_context()

        return config

    def open(self):
        self._load_db_settings()
        return super().open()

    def send_messages(self, email_messages):
        if not email_messages:
            return 0

        try:
            config = self._load_db_settings()
        except SmtpNotConfiguredError:
            logger.error("send_messages aborted: SMTP not configured")
            raise

        if config.from_email:
            for message in email_messages:
                if isinstance(message, EmailMessage):
                    message.from_email = config.from_email

        for message in email_messages:
            logger.info(
                "send_messages: to=%s from=%s subject=%s host=%s:%s tls=%s ssl=%s",
                getattr(message, "to", None),
                getattr(message, "from_email", None),
                getattr(message, "subject", None),
                self.host,
                self.port,
                self.use_tls,
                self.use_ssl,
            )

        try:
            sent = super().send_messages(email_messages)
            logger.info("send_messages OK: sent=%s", sent)
            return sent
        except Exception:
            logger.exception("send_messages FAILED")
            raise
