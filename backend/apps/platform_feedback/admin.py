from django.contrib import admin

from .models import PlatformFeedback, PlatformFeedbackAttachment


class PlatformFeedbackAttachmentInline(admin.TabularInline):
    model = PlatformFeedbackAttachment
    extra = 0
    readonly_fields = ("size", "content_type", "uploaded_at")


@admin.register(PlatformFeedback)
class PlatformFeedbackAdmin(admin.ModelAdmin):
    list_display = ("subject", "type", "status", "submitted_by", "created_at")
    list_filter = ("type", "status")
    search_fields = ("subject", "description", "submitted_by__email")
    readonly_fields = (
        "submitted_by",
        "page_url",
        "user_agent",
        "created_at",
        "updated_at",
    )
    inlines = [PlatformFeedbackAttachmentInline]


@admin.register(PlatformFeedbackAttachment)
class PlatformFeedbackAttachmentAdmin(admin.ModelAdmin):
    list_display = ("original_name", "feedback", "size", "uploaded_at")
    search_fields = ("original_name", "feedback__subject")
