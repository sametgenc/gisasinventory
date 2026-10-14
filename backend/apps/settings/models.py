from django.db import models

from .credentials import PREFIX, decrypt_password, encrypt_password


class SmtpSettings(models.Model):
    """
    Singleton model for storing SMTP configuration.
    Only one row (id=1) is ever created.
    """

    host = models.CharField(max_length=255)
    port = models.IntegerField(default=587)
    username = models.CharField(max_length=255, blank=True, default="")
    password = models.TextField(blank=True, default="")
    use_tls = models.BooleanField(default=True)
    use_ssl = models.BooleanField(default=False)
    from_email = models.EmailField()
    is_configured = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "SMTP Settings"
        verbose_name_plural = "SMTP Settings"

    def __str__(self):
        return f"SMTP Settings ({self.host}:{self.port})"

    def save(self, *args, **kwargs):
        self.pk = 1
        if self.password and not self.password.startswith(PREFIX):
            self.password = encrypt_password(self.password)
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = set(kwargs["update_fields"]) | {"password"}
        super().save(*args, **kwargs)

    def get_password(self) -> str:
        return decrypt_password(self.password)

    def set_password(self, value: str) -> None:
        self.password = encrypt_password(value)

    def delete(self, *args, **kwargs):
        pass

    @classmethod
    def load(cls):
        """Load the singleton instance, or return None if not yet created."""
        try:
            return cls.objects.get(pk=1)
        except cls.DoesNotExist:
            return None
