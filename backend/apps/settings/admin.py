from django.contrib import admin
from django.utils.html import format_html
from django.utils.safestring import SafeString

from .models import SmtpSettings


@admin.register(SmtpSettings)
class SmtpSettingsAdmin(admin.ModelAdmin):
    list_display = ("host", "port", "from_email", "is_configured", "updated_at")
    exclude = ("password",)
    readonly_fields = (
        "host", "port", "username", "password_set", "use_tls", "use_ssl",
        "from_email", "is_configured", "updated_at", "configure_mail",
    )

    @admin.display(description="Password configured")
    def password_set(self, obj: SmtpSettings) -> bool:
        return bool(obj.password)

    @admin.display(description="Mail settings")
    def configure_mail(self, obj: SmtpSettings) -> SafeString:
        return format_html(
            '<a href="/platform/settings">'
            'Open mail settings and verify your account</a>'
        )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
