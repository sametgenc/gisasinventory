from django.contrib import admin
from .models import SmtpSettings


@admin.register(SmtpSettings)
class SmtpSettingsAdmin(admin.ModelAdmin):
    list_display = ("host", "port", "from_email", "is_configured", "updated_at")

    def has_add_permission(self, request):
        return not SmtpSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
