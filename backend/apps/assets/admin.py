from django.contrib import admin
from .models import AssetType, Asset


@admin.register(AssetType)
class AssetTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'description', 'created_at', 'updated_at']
    list_filter = ['created_at']
    search_fields = ['name', 'description']
    readonly_fields = ['id', 'created_at', 'updated_at', 'created_by']
    
    fieldsets = (
        (None, {
            'fields': ('name', 'description')
        }),
        ('Schema', {
            'fields': ('schema',),
            'description': 'JSON array of field definitions'
        }),
        ('Meta', {
            'fields': ('id', 'created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ['id', 'asset_type', 'tenant', 'assigned_to', 'created_at']
    list_filter = ['tenant', 'asset_type', 'created_at']
    search_fields = ['asset_type__name', 'tenant__name']
    readonly_fields = ['id', 'created_at', 'updated_at', 'created_by']
    autocomplete_fields = ['asset_type', 'assigned_to', 'tenant']
    
    fieldsets = (
        (None, {
            'fields': ('tenant', 'asset_type', 'assigned_to')
        }),
        ('Custom Data', {
            'fields': ('custom_data',),
            'description': 'JSON data matching the asset type schema'
        }),
        ('Meta', {
            'fields': ('id', 'created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
