from allauth.headless.adapter import DefaultHeadlessAdapter
from allauth.mfa.adapter import DefaultMFAAdapter
from django.conf import settings


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
        # We want the RP ID to be the base domain (myproject.co)
        # even when requests come from different path prefixes
        domain = getattr(settings, "DOMAIN", "myproject.co")
        name = self._get_site_name()
        return {
            "id": domain,
            "name": name,
        }
