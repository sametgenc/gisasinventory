import ssl

from django.core.mail import EmailMessage
from django.core.mail.backends.smtp import EmailBackend as DjangoSmtpBackend


class SmtpNotConfiguredError(Exception):
    pass


class DatabaseEmailBackend(DjangoSmtpBackend):
    """
    Custom email backend that loads SMTP settings from the database
    (SmtpSettings singleton) instead of Django settings.

    Raises SmtpNotConfiguredError if SMTP has not been configured yet.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._db_settings_loaded = False

    def _load_db_settings(self):
        if self._db_settings_loaded:
            return

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

        self._db_settings_loaded = True

    def open(self):
        self._load_db_settings()
        return super().open()

    def send_messages(self, email_messages):
        from apps.settings.models import SmtpSettings

        config = SmtpSettings.load()
        if config and config.is_configured and config.from_email:
            for message in email_messages:
                if isinstance(message, EmailMessage) and not message.from_email:
                    message.from_email = config.from_email

        return super().send_messages(email_messages)
