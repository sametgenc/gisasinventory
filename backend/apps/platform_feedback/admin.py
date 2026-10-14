from django.contrib import admin

from .models import PlatformFeedback, PlatformFeedbackAttachment, PlatformFeedbackEvent


class PlatformFeedbackAttachmentInline(admin.TabularInline):
    model = PlatformFeedbackAttachment
    extra = 0
    readonly_fields = ('file', 'original_name', 'size', 'content_type', 'uploaded_at')
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class PlatformFeedbackEventInline(admin.TabularInline):
    model = PlatformFeedbackEvent
    extra = 0
    can_delete = False
    readonly_fields = ('kind', 'body', 'before', 'after', 'created_by', 'created_at')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(PlatformFeedback)
class PlatformFeedbackAdmin(admin.ModelAdmin):
    list_display = ('subject', 'type', 'status', 'priority', 'tenant', 'assigned_to', 'created_at')
    list_filter = ('type', 'status', 'priority', 'area')
    search_fields = ('subject', 'description', 'submitted_by__email')
    readonly_fields = ('submitted_by', 'tenant', 'page_url', 'user_agent', 'created_at', 'updated_at')
    inlines = [PlatformFeedbackAttachmentInline, PlatformFeedbackEventInline]

    def save_model(self, request, obj, form, change):
        from django.db import transaction
        from .services import apply_management, lock_assignee, notify_feedback_event, record_event
        with transaction.atomic():
            if change:
                existing = PlatformFeedback.objects.select_for_update().get(pk=obj.pk)
                values = {field: getattr(obj, field) for field in form.changed_data if field in form.fields}
                apply_management(existing, request.user, values)
                obj.updated_at = existing.updated_at
            else:
                obj.assigned_to = lock_assignee(obj.assigned_to)
                obj.submitted_by = request.user
                obj.tenant_id = None
                obj.save()
                event = record_event(obj, request.user, 'created')
                notify_feedback_event(obj, event)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'assigned_to':
            from apps.user.models import User
            kwargs['queryset'] = User.objects.filter(is_active=True, is_superuser=True, tenant_id=None)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(PlatformFeedbackAttachment)
class PlatformFeedbackAttachmentAdmin(admin.ModelAdmin):
    list_display = ('original_name', 'feedback', 'size', 'uploaded_at')
    search_fields = ('original_name', 'feedback__subject')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
