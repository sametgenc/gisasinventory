from django.contrib import admin

from .models import PlatformRelease, PlatformReleaseAttachment


class PlatformReleaseAttachmentInline(admin.TabularInline):
    model = PlatformReleaseAttachment
    extra = 0
    readonly_fields = ("size", "content_type", "uploaded_by", "uploaded_at")


@admin.register(PlatformRelease)
class PlatformReleaseAdmin(admin.ModelAdmin):
    list_display = ("version", "title", "type", "status", "published_at", "created_at")
    list_filter = ("status", "type")
    search_fields = ("version", "title", "body")
    inlines = [PlatformReleaseAttachmentInline]
    readonly_fields = ("created_by", "created_at", "updated_at")


@admin.register(PlatformReleaseAttachment)
class PlatformReleaseAttachmentAdmin(admin.ModelAdmin):
    list_display = ("original_name", "release", "size", "uploaded_at")
    search_fields = ("original_name", "release__version", "release__title")
