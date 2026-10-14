from rest_framework import serializers
from rest_framework.exceptions import NotFound
from django.utils import timezone
from django.db import transaction
from .models import AssetType, Asset
from apps.tenants.models import Tenant
from .validation import default_stock_schema, validate_custom_data, validate_stock_schema
import re


class AssetTypeSerializer(serializers.ModelSerializer):
    """
    Serializer for AssetType definitions.
    AssetTypes are global - no tenant required.
    """
    
    sharing_excluded = serializers.BooleanField(read_only=True)

    class Meta:
        model = AssetType
        fields = [
            'id', 'name', 'tracking_mode', 'description', 'catalog_code', 'category_code',
            'sharing_class', 'exclusion_reason', 'sharing_excluded',
            'schema', 'created_at', 'updated_at', 'created_by'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def validate_catalog_code(self, value):
        value = (value or '').strip().upper() or None
        if value and not re.fullmatch(r'[A-Z0-9][A-Z0-9._-]*', value):
            raise serializers.ValidationError('Katalog kodunda harf, rakam, nokta, tire ve alt çizgi kullanın.')
        if value:
            existing = AssetType.objects.filter(catalog_code=value)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError('Bu katalog kodu zaten kullanılıyor.')
        return value

    def validate_schema(self, value):
        """
        Validate that schema is a list of field definitions.
        """
        if value is None:
            return []
            
        if not isinstance(value, list):
            raise serializers.ValidationError("Schema must be a list of field definitions.")
        
        valid_types = ['text', 'number', 'date', 'select', 'checkbox', 'email', 'phone']
        unique_key_count = 0
        keys = set()
        
        for field in value:
            if not isinstance(field, dict):
                raise serializers.ValidationError("Each schema item must be a dictionary.")
            
            if 'key' not in field or 'label' not in field or 'type' not in field:
                raise serializers.ValidationError("Field definition must contain 'key', 'label', and 'type'.")
            key = field['key']
            if not isinstance(key, str) or not key.strip() or '__' in key or key in keys:
                raise serializers.ValidationError("Field keys must be non-empty, unique, and must not contain '__'.")
            keys.add(key)
            if not isinstance(field['label'], str) or not field['label'].strip():
                raise serializers.ValidationError("Field labels must be non-empty text.")
            
            if field['type'] not in valid_types:
                raise serializers.ValidationError(f"Invalid field type: {field['type']}. Valid types: {valid_types}")
                
            if field['type'] == 'select':
                options = field.get('options')
                if not isinstance(options, list) or not options or not all(isinstance(option, str) and option for option in options):
                    raise serializers.ValidationError("Select fields must have a non-empty list of text options.")

            if field.get('is_unique_key'):
                unique_key_count += 1

        if unique_key_count > 1:
            raise serializers.ValidationError("Only one field can be marked as the unique index key (is_unique_key).")
                 
        return value

    def validate(self, data):
        previous_mode = self.instance.tracking_mode if self.instance else AssetType.TrackingMode.INDIVIDUAL
        mode = data.get('tracking_mode', previous_mode)
        if self.instance and mode != previous_mode and self.instance.assets.exists():
            raise serializers.ValidationError({
                'tracking_mode': 'Bu türe bağlı kayıtlar var. Takip biçimi değiştirilemez; yeni bir tür oluşturun.',
            })
        if mode == AssetType.TrackingMode.STOCK:
            if 'schema' not in data and (not self.instance or mode != previous_mode):
                data['schema'] = default_stock_schema()
            schema = data.get('schema', self.instance.schema if self.instance else [])
            validate_stock_schema(schema)
        return data

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user:
            validated_data['created_by'] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        with transaction.atomic():
            current = AssetType.objects.select_for_update().get(pk=instance.pk)
            self.instance = current
            validated_data = self.validate(validated_data)
            return super().update(current, validated_data)


class AssetSerializer(serializers.ModelSerializer):
    """
    Serializer for Assets.
    Assets are tenant-specific - tenant is required.
    """
    
    asset_type_name = serializers.CharField(source='asset_type.name', read_only=True)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    assigned_to_username = serializers.CharField(source='assigned_to.username', read_only=True, allow_null=True)
    is_listed_for_sharing = serializers.BooleanField(read_only=True)
    
    # Allow tenant to be writable for superusers, auto-assign for regular users
    tenant = serializers.PrimaryKeyRelatedField(
        queryset=Tenant.objects.all(),
        required=False,
        allow_null=True
    )
    
    class Meta:
        model = Asset
        fields = [
            'id', 'tenant', 'tenant_name', 'asset_type', 'asset_type_name',
            'custom_data', 'created_at', 'updated_at', 
            'created_by', 'assigned_to', 'assigned_to_username',
            'is_shared', 'sharing_note', 'shared_at', 'is_listed_for_sharing',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'created_by', 'tenant_name',
            'is_shared', 'sharing_note', 'shared_at',
        ]

    def validate(self, data):
        """
        Validate custom_data against the AssetType schema.
        Also handle tenant assignment.
        """
        request = self.context.get('request')
        user = request.user if request else None
        
        privileged = user and (user.is_superuser or user.is_platform_admin)
        if user and not privileged and (not user.tenant or not user.tenant.is_active):
            raise serializers.ValidationError({"tenant": "You must belong to an active tenant."})

        tenant = data.get('tenant')
        if tenant is None:
            tenant = self.instance.tenant if self.instance else getattr(user, 'tenant', None)
        if tenant is None:
            raise serializers.ValidationError({"tenant": "Please select a tenant for this asset."})
        if not tenant.is_active:
            raise serializers.ValidationError({"tenant": "This tenant is inactive."})
        if user and not privileged and tenant.pk != user.tenant_id:
            raise serializers.ValidationError({"tenant": "You can only manage assets for your own tenant."})
        data['tenant'] = tenant

        assignee = data.get('assigned_to', self.instance.assigned_to if self.instance else None)
        if assignee and (assignee.tenant_id != tenant.pk or not assignee.is_active):
            raise serializers.ValidationError({"assigned_to": "Choose an active user in the asset's tenant."})

        asset_type = data.get('asset_type') or (self.instance.asset_type if self.instance else None)
        custom_data = data.get('custom_data', self.instance.custom_data if self.instance else {})
        if asset_type:
            normalized = validate_custom_data(asset_type.schema or [], custom_data, asset_type.tracking_mode)
            if 'custom_data' in data:
                data['custom_data'] = normalized

        return data

    def create(self, validated_data):
        with transaction.atomic():
            validated_data['asset_type'] = self._lock_asset_type(validated_data['asset_type'])
            validated_data = self.validate(validated_data)
            request = self.context.get('request')
            if request and request.user:
                validated_data['created_by'] = request.user
            return super().create(validated_data)

    @staticmethod
    def _lock_asset_type(asset_type: AssetType) -> AssetType:
        """Use current schema and serialize writes with tracking-mode changes."""
        try:
            return AssetType.objects.select_for_update().get(pk=asset_type.pk)
        except AssetType.DoesNotExist as exc:
            raise NotFound('Ekipman türü silinmiş. Tür listesini yenileyin.') from exc

    def update(self, instance, validated_data):
        with transaction.atomic():
            try:
                current = Asset.objects.select_for_update().get(pk=instance.pk)
            except Asset.DoesNotExist as exc:
                raise NotFound('Ekipman silinmiş. Listeyi yenileyin.') from exc
            if current.tenant_id != instance.tenant_id:
                raise serializers.ValidationError({'tenant': 'Ekipmanın sahibi değişti. Listeyi yenileyip tekrar deneyin.'})
            # Revalidate current assignment/schema and preserve any newer consent decision.
            self.instance = current
            validated_data['asset_type'] = self._lock_asset_type(
                validated_data.get('asset_type', current.asset_type),
            )
            validated_data = self.validate(validated_data)
            tenant = validated_data.get('tenant', current.tenant)
            if tenant.pk != current.tenant_id:
                # Consent belongs to the owner; a new owner must explicitly opt in.
                validated_data.update(is_shared=False, sharing_note='', shared_at=None)
            return super().update(current, validated_data)


class AssetSharingSerializer(serializers.ModelSerializer):
    """Only the dedicated owner action can publish inventory."""

    class Meta:
        model = Asset
        fields = ['is_shared', 'sharing_note']

    def validate(self, data):
        unknown = set(self.initial_data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError({key: 'Bu alan paylaşım işleminde değiştirilemez.' for key in unknown})
        publishing = data.get('is_shared', self.instance.is_shared)
        if publishing:
            if not self.instance.tenant.is_active:
                raise serializers.ValidationError({'is_shared': 'Pasif tersane ekipmanı ortak listede yayınlanamaz.'})
            if self.instance.asset_type.sharing_excluded:
                raise serializers.ValidationError({'is_shared': 'Bu ekipman türü ortak kullanım kapsamı dışında.'})
        return data

    def update(self, instance, validated_data):
        publishing = validated_data.get('is_shared', instance.is_shared)
        if publishing and not instance.is_shared:
            validated_data['shared_at'] = timezone.now()
        elif not publishing:
            validated_data['shared_at'] = None
        return super().update(instance, validated_data)


class SharedAssetSerializer(serializers.ModelSerializer):
    """Allow-listed public projection; inventory fields remain private."""

    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    asset_type_name = serializers.CharField(source='asset_type.name', read_only=True)
    category_code = serializers.CharField(source='asset_type.category_code', read_only=True)
    catalog_code = serializers.CharField(source='asset_type.catalog_code', read_only=True, allow_null=True)

    class Meta:
        model = Asset
        fields = [
            'id', 'tenant', 'tenant_name', 'asset_type_name', 'category_code',
            'catalog_code', 'sharing_note', 'shared_at',
        ]
        read_only_fields = fields
