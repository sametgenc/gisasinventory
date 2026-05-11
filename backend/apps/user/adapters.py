import logging

from allauth.account.adapter import DefaultAccountAdapter
from allauth.headless.adapter import DefaultHeadlessAdapter
from allauth.mfa.adapter import DefaultMFAAdapter
from django.conf import settings

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
        logger.info(
            "allauth send_mail: template=%s to=%s from=%s",
            template_prefix,
            email,
            from_email,
        )
        try:
            msg = self.render_mail(template_prefix, email, context)
            msg.from_email = from_email
            msg.send()
            logger.info("allauth send_mail OK: to=%s", email)
        except Exception:
            logger.exception(
                "allauth send_mail FAILED: template=%s to=%s", template_prefix, email
            )
            raise


class CustomHeadlessAdapter(DefaultHeadlessAdapter):
    def serialize_user(self, user):
        data = super().serialize_user(user)
        data["is_superuser"] = user.is_superuser
        data["role"] = user.role
        data["tenant_slug"] = user.tenant.slug if user.tenant else None
        data["tenant_name"] = user.tenant.name if user.tenant else None
        return data


class CustomMFAAdapter(DefaultMFAAdapter):
    def get_public_key_credential_rp_entity(self):
        # RP ID must be the base domain so WebAuthn credentials stay valid
        # regardless of request path prefix.
        domain = getattr(settings, "DOMAIN", "localhost")
        name = self._get_site_name()
        return {
            "id": domain,
            "name": name,
        }
