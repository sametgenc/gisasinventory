import logging
from collections.abc import Mapping
from typing import TYPE_CHECKING

from allauth.account.adapter import DefaultAccountAdapter
from allauth.headless.adapter import DefaultHeadlessAdapter
from allauth.mfa.adapter import DefaultMFAAdapter
from django.conf import settings
from django.contrib.sites.shortcuts import get_current_site
from allauth.core import context as allauth_context
from .mail import account_mail_context

if TYPE_CHECKING:
    from .models import User
    from apps.notifications.models import Notification

logger = logging.getLogger(__name__)


class CustomAccountAdapter(DefaultAccountAdapter):
    """
    Loads from_email from SmtpSettings (DB) and surfaces SMTP send failures
    loudly. Without this, allauth swallows or hides email exceptions during
    signup, leaving "test email works but verification email never arrives".
    """

    def get_from_email(self):
        try:
            from apps.settings.models import SmtpSettings

            config = SmtpSettings.load()
            if config and config.is_configured and config.from_email:
                return config.from_email
        except Exception:
            logger.exception("Failed loading SmtpSettings.from_email")
        return super().get_from_email()

    def send_mail(self, template_prefix, email, context):
        from_email = self.get_from_email()
        try:
            msg = self.render_mail(template_prefix, email, context)
            msg.from_email = from_email
            if getattr(settings, "DEMO_MODE", False):
                from django.core.mail import get_connection
                msg.connection = get_connection(backend="django.core.mail.backends.console.EmailBackend", fail_silently=False)
            if msg.send(fail_silently=False) != 1:
                raise RuntimeError('Account email backend did not accept the message.')
            logger.info("Account email dispatched: template=%s", template_prefix)
        except Exception:
            logger.error("Account email dispatch failed: template=%s", template_prefix)
            raise

    def send_notification_mail(self, template_prefix: str, user: "User", context: Mapping[str, object] | None = None,
                               email: str | None = None) -> "Notification | None":
        """Security mutations complete independently of SMTP; notification mail is durable."""
        from allauth.account import app_settings
        from allauth.account.models import EmailAddress
        from django.utils import timezone
        from apps.notifications.services import create_security_notification

        if not app_settings.EMAIL_NOTIFICATIONS:
            return
        recipient = email or EmailAddress.objects.get_primary_email(user)
        if not recipient:
            return
        try:
            return create_security_notification(user, template_prefix, trusted_recipient=recipient,
                                                context={"timestamp": timezone.now(), **(context or {})})
        except Exception:
            logger.error("Account security notification could not be persisted: template=%s", template_prefix)
            raise

    def render_mail(self, template_prefix, email, context, headers=None):
        request = allauth_context.request
        merged = {'request': request, 'email': email, 'current_site': get_current_site(request)}
        merged.update(context)
        merged.update(account_mail_context(template_prefix, email, merged))
        return super().render_mail(template_prefix, email, merged, headers=headers)


class CustomHeadlessAdapter(DefaultHeadlessAdapter):
    def serialize_user(self, user):
        data = super().serialize_user(user)
        data["is_superuser"] = user.is_superuser
        data["role"] = user.role
        data["tenant_slug"] = user.tenant.slug if user.tenant else None
        data["tenant_name"] = user.tenant.name if user.tenant else None
        return data


class CustomMFAAdapter(DefaultMFAAdapter):
    def encrypt(self, text: str) -> str:
        from apps.settings.credentials import encrypt_secret
        return encrypt_secret(text, key_setting='MFA_CREDENTIAL_KEY')

    def decrypt(self, encrypted_text: str) -> str:
        from apps.settings.credentials import decrypt_secret
        return decrypt_secret(encrypted_text, key_setting='MFA_CREDENTIAL_KEY')

    def get_public_key_credential_rp_entity(self):
        # RP ID must be the base domain so WebAuthn credentials stay valid
        # regardless of request path prefix.
        domain = getattr(settings, "DOMAIN", "localhost")
        name = self._get_site_name()
        return {
            "id": domain,
            "name": name,
        }
