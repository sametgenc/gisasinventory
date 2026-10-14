from rest_framework import serializers
from rest_framework.exceptions import NotFound
from django.utils import timezone
from django.db import DatabaseError, transaction
from .models import AssetType, Asset
from apps.tenants.models import Tenant
from apps.tenants.permissions import is_global_admin
from .validation import (
    MAX_STOCK_QUANTITY, default_stock_schema, stock_quantity_value,
    schema_role_key, validate_custom_data, validate_field_schema, validate_stock_schema,
)
from .schema_evolution import advance_schema_revision, notify_schema_change
from .identity import AssetIdentityIndex
import re


SHARING_DETAIL_FIELDS = [
    'sharing_title', 'sharing_quantity', 'sharing_capacity', 'sharing_note',
    'sharing_availability', 'sharing_availability_note',
    'sharing_contact_name', 'sharing_contact_email', 'sharing_contact_phone',
]


class SingleLineCharField(serializers.CharField):
    """Reject raw control characters before DRF trims surrounding whitespace."""

    def run_validation(self, data: object = serializers.empty) -> str:
        if isinstance(data, str) and any(ord(char) < 32 or ord(char) == 127 for char in data):
            raise serializers.ValidationError('Bu alanda satır sonu veya kontrol karakteri kullanmayın.')
        return super().run_validation(data)


class SingleLineEmailField(SingleLineCharField, serializers.EmailField):
    """Retain email syntax validation together with the raw single-line check."""


class OfferQuantityField(serializers.IntegerField):
    def to_internal_value(self, data: object) -> int:
        try:
            value = stock_quantity_value(data)
            if value < 1:
                raise ValueError
            return value
        except ValueError as exc:
            raise serializers.ValidationError(
                f'Paylaşım adedi 1 ile {MAX_STOCK_QUANTITY} arasında tam sayı olmalıdır.',
            ) from exc


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
            'schema', 'schema_revision', 'created_at', 'updated_at', 'created_by'
        ]
        read_only_fields = ['id', 'schema_revision', 'created_at', 'updated_at', 'created_by']

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
        return validate_field_schema(value)

    def validate(self, data):
        previous_mode = self.instance.tracking_mode if self.instance else AssetType.TrackingMode.INDIVIDUAL
        mode = data.get('tracking_mode', previous_mode)
        request = self.context.get('request')
        if (self.instance and mode != previous_mode and request is not None
                and not is_global_admin(request.user)):
            raise serializers.ValidationError({
                'tracking_mode': 'Only platform administrators can change equipment tracking mode.',
            })
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
            previous_schema = current.schema
            if 'schema' in validated_data:
                current.schema = validated_data['schema']
            changed = advance_schema_revision(current, previous_schema)
            result = super().update(current, validated_data)
            if changed:
                notify_schema_change(result, previous_schema)
            return result


class AssetSerializer(serializers.ModelSerializer):
    """
    Serializer for Assets.
    Assets are tenant-specific - tenant is required.
    """
    
    asset_type_name = serializers.CharField(source='asset_type.name', read_only=True)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    assigned_to_username = serializers.CharField(source='assigned_to.username', read_only=True, allow_null=True)
    is_listed_for_sharing = serializers.BooleanField(read_only=True)
    sharing_needs_review = serializers.BooleanField(read_only=True)
    schema_revision = serializers.IntegerField(source='asset_type.schema_revision', read_only=True)
    missing_required_fields = serializers.ReadOnlyField()
    needs_update = serializers.BooleanField(read_only=True)
    inventory_code = SingleLineCharField(max_length=160, allow_blank=True, required=False)
    
    # Allow tenant to be writable for superusers, auto-assign for regular users
    tenant = serializers.PrimaryKeyRelatedField(
        queryset=Tenant.objects.all(),
        required=False,
        allow_null=True
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request is not None and not is_global_admin(request.user):
            from apps.user.models import User

            tenant_id = getattr(request.user, 'tenant_id', None)
            self.fields['tenant'].queryset = Tenant.objects.filter(pk=tenant_id, is_active=True)
            self.fields['assigned_to'].queryset = User.objects.filter(tenant_id=tenant_id, is_active=True)
            if tenant_id is None:
                self.fields['assigned_to'].queryset = User.objects.none()
    
    class Meta:
        model = Asset
        fields = [
            'id', 'tenant', 'tenant_name', 'asset_type', 'asset_type_name',
            'custom_data', 'inventory_code', 'schema_revision', 'missing_required_fields', 'needs_update',
            'created_at', 'updated_at',
            'created_by', 'assigned_to', 'assigned_to_username',
            'is_shared', 'shared_at', 'is_listed_for_sharing', 'sharing_needs_review',
            *SHARING_DETAIL_FIELDS,
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'created_by', 'tenant_name',
            'is_shared', 'shared_at', *SHARING_DETAIL_FIELDS,
        ]
        # Tenant is assigned during object validation. Enforce scoped identity there
        # instead of DRF requiring a caller-supplied tenant for its constraint validator.
        validators = []

    def validate(self, data):
        """
        Validate custom_data against the AssetType schema.
        Also handle tenant assignment.
        """
        request = self.context.get('request')
        user = request.user if request else None
        
        privileged = user and is_global_admin(user)
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
        if (self.instance and self.partial and 'custom_data' in data and isinstance(custom_data, dict)
                and asset_type.pk == self.instance.asset_type_id):
            custom_data = {**self.instance.custom_data, **custom_data}
        elif (self.instance and 'custom_data' in data and isinstance(custom_data, dict)
              and asset_type.pk == self.instance.asset_type_id):
            field_keys = {field['key'] for field in asset_type.schema or []}
            historic = {key: value for key, value in self.instance.custom_data.items() if key not in field_keys}
            custom_data = {**historic, **custom_data}
        if asset_type:
            normalized = validate_custom_data(asset_type.schema or [], custom_data, asset_type.tracking_mode)
            if 'custom_data' in data:
                data['custom_data'] = normalized

        inventory_code = data.get('inventory_code', self.instance.inventory_code if self.instance else '')
        identifier = schema_role_key(asset_type.schema, 'identifier') if asset_type else None
        value = normalized.get(identifier) if identifier and asset_type else None
        identity_index = self.context.get('asset_identity_index')
        if identity_index is not None and not identity_index.matches_scope(tenant, asset_type):
            identity_index = None
        if identifier and value not in (None, ''):
            if identity_index is None:
                identity_index = AssetIdentityIndex(tenant, asset_type)
        if inventory_code:
            if identity_index is not None:
                duplicate = any(record.pk != getattr(self.instance, 'pk', None)
                                for record in identity_index.matching(inventory_code=inventory_code))
            else:
                matches = Asset.objects.filter(tenant=tenant, asset_type=asset_type, inventory_code=inventory_code)
                if self.instance:
                    matches = matches.exclude(pk=self.instance.pk)
                duplicate = matches.exists()
            if duplicate:
                raise serializers.ValidationError({
                    'inventory_code': 'Bu ekipman kodu aynı tersane ve ekipman türünde kullanılıyor.',
                })

        if value is not None and value != '':
            duplicate = [record for record in identity_index.identifier_matches(value)
                         if not self.instance or record.pk != self.instance.pk]
            if duplicate:
                raise serializers.ValidationError({'custom_data': {
                    identifier: 'Bu kayıt kodu aynı tersane ve ekipman türünde kullanılıyor.',
                }})

        return data

    def create(self, validated_data):
        with transaction.atomic():
            self._refresh_submitted_assignee(validated_data)
            validated_data['asset_type'] = self._lock_asset_type(validated_data['asset_type'])
            validated_data = self.validate(validated_data)
            request = self.context.get('request')
            if request and request.user:
                validated_data['created_by'] = request.user
            return super().create(validated_data)

    @staticmethod
    def _refresh_submitted_assignee(validated_data):
        assignee = validated_data.get('assigned_to')
        if assignee is None:
            return
        from apps.user.models import User

        try:
            with transaction.atomic():
                validated_data['assigned_to'] = User.objects.select_for_update(nowait=True, no_key=True).get(pk=assignee.pk)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError({'assigned_to': 'Selected user is no longer available.'}) from exc
        except DatabaseError as exc:
            # The authenticated actor is already locked. Never wait for another
            # user's lock and create a cycle with a concurrent ownership change.
            if getattr(exc.__cause__, 'pgcode', None) == '55P03':
                raise serializers.ValidationError({'assigned_to': 'Selected user changed. Retry the assignment.'}) from exc
            raise

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.assigned_to_id and (
            instance.assigned_to.tenant_id != instance.tenant_id or not instance.assigned_to.is_active
        ):
            data['assigned_to'] = None
            data['assigned_to_username'] = None
        return data

    @staticmethod
    def _lock_asset_type(asset_type: AssetType) -> AssetType:
        """Use current schema and serialize writes with tracking-mode changes."""
        try:
            return AssetType.objects.select_for_update().get(pk=asset_type.pk)
        except AssetType.DoesNotExist as exc:
            raise NotFound('Ekipman türü silinmiş. Tür listesini yenileyin.') from exc

    def update(self, instance, validated_data):
        self.sharing_paused = False
        with transaction.atomic():
            self._refresh_submitted_assignee(validated_data)
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
            if validated_data['asset_type'].pk == current.asset_type_id:
                current.asset_type = validated_data['asset_type']
            if self.partial and 'custom_data' in validated_data and 'custom_data' in self.initial_data:
                # Re-merge the caller's patch with the row locked above, not a stale snapshot.
                validated_data['custom_data'] = self.initial_data['custom_data']
            validated_data = self.validate(validated_data)
            tenant = validated_data.get('tenant', current.tenant)
            from .usage import validate_inventory_usage_change
            validate_inventory_usage_change(
                current, tenant_id=tenant.pk, asset_type_id=validated_data['asset_type'].pk,
                custom_data=validated_data.get('custom_data', current.custom_data),
            )
            if tenant.pk != current.tenant_id:
                # Consent belongs to the owner; a new owner must explicitly opt in.
                validated_data.update(
                    is_shared=False, shared_at=None, sharing_quantity=None,
                    sharing_availability=Asset.SharingAvailability.BY_ARRANGEMENT,
                    **{field: '' for field in SHARING_DETAIL_FIELDS
                       if field not in ('sharing_quantity', 'sharing_availability')},
                )
            elif current.is_shared:
                candidate = Asset(
                    asset_type=validated_data['asset_type'],
                    custom_data=validated_data.get('custom_data', current.custom_data),
                    sharing_quantity=current.sharing_quantity,
                    sharing_availability=current.sharing_availability,
                )
                if validated_data['asset_type'].pk != current.asset_type_id or candidate.sharing_needs_review:
                    validated_data.update(is_shared=False, shared_at=None)
                    self.sharing_paused = True
            return super().update(current, validated_data)


class AssetSharingSerializer(serializers.ModelSerializer):
    """Only the dedicated owner action can publish inventory."""

    sharing_title = SingleLineCharField(max_length=160, allow_blank=True, required=False)
    sharing_capacity = SingleLineCharField(max_length=160, allow_blank=True, required=False)
    sharing_quantity = OfferQuantityField(allow_null=True, required=False)
    sharing_availability_note = SingleLineCharField(max_length=255, allow_blank=True, required=False)
    sharing_contact_name = SingleLineCharField(max_length=120, allow_blank=True, required=False)
    sharing_contact_email = SingleLineEmailField(max_length=254, allow_blank=True, required=False)
    sharing_contact_phone = SingleLineCharField(max_length=40, allow_blank=True, required=False)

    class Meta:
        model = Asset
        fields = ['is_shared', *SHARING_DETAIL_FIELDS]

    def validate_sharing_contact_phone(self, value: str) -> str:
        if value and (not re.fullmatch(r'\+?[0-9 ().-]+', value)
                      or not 6 <= len(re.findall(r'[0-9]', value)) <= 15):
            raise serializers.ValidationError('Telefon için 6–15 rakam, başta +, boşluk, parantez, nokta veya tire kullanın.')
        return value

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
            if self.instance.needs_update:
                labels = ', '.join(field['label'] for field in self.instance.missing_required_fields)
                raise serializers.ValidationError({
                    'is_shared': f'Paylaşımdan önce eksik zorunlu bilgileri tamamlayın: {labels}.',
                })
        if publishing or any(key in data for key in ('sharing_quantity', 'sharing_availability')):
            quantity = data.get('sharing_quantity', self.instance.sharing_quantity)
            availability = data.get('sharing_availability', self.instance.sharing_availability)
            candidate = Asset(
                asset_type=self.instance.asset_type, custom_data=self.instance.custom_data,
                sharing_quantity=quantity, sharing_availability=availability,
            )
            if not candidate.sharing_quantity_is_valid:
                if quantity is None:
                    message = 'Uygun durumunda paylaşıma açılan adedi belirtin.'
                elif self.instance.asset_type.tracking_mode == AssetType.TrackingMode.INDIVIDUAL:
                    message = 'Tek tek takip edilen ekipman için paylaşım adedi yalnızca 1 olabilir.'
                else:
                    message = 'Paylaşım adedi mevcut stok adedini aşamaz; stok kaydını kontrol edin.'
                raise serializers.ValidationError({'sharing_quantity': message})
        return data

    def update(self, instance, validated_data):
        with transaction.atomic():
            try:
                current = Asset.objects.select_for_update(of=('self',)).select_related(
                    'tenant', 'asset_type',
                ).get(pk=instance.pk)
            except Asset.DoesNotExist as exc:
                raise NotFound('Ekipman silinmiş. Listeyi yenileyin.') from exc
            if current.tenant_id != instance.tenant_id:
                raise serializers.ValidationError({'tenant': 'Ekipmanın sahibi değişti. Listeyi yenileyip tekrar deneyin.'})
            current.asset_type = AssetSerializer._lock_asset_type(current.asset_type)
            self.instance = current
            validated_data = self.validate(validated_data)
            if 'sharing_quantity' in validated_data:
                from .usage import validate_inventory_usage_change
                validate_inventory_usage_change(current, sharing_quantity=validated_data['sharing_quantity'])
            publishing = validated_data.get('is_shared', current.is_shared)
            if publishing and not current.is_shared:
                validated_data['shared_at'] = timezone.now()
            elif not publishing:
                validated_data['shared_at'] = None
            return super().update(current, validated_data)


class SharedAssetSerializer(serializers.ModelSerializer):
    """Allow-listed public projection; inventory fields remain private."""

    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    asset_type_name = serializers.CharField(source='asset_type.name', read_only=True)
    category_code = serializers.CharField(source='asset_type.category_code', read_only=True)
    catalog_code = serializers.CharField(source='asset_type.catalog_code', read_only=True, allow_null=True)
    tracking_mode = serializers.CharField(source='asset_type.tracking_mode', read_only=True)
    sharing_quantity = serializers.SerializerMethodField()
    sharing_availability = serializers.SerializerMethodField()

    def get_sharing_quantity(self, asset: Asset) -> int | None:
        return asset.sharing_quantity if asset.sharing_quantity_is_valid else None

    def get_sharing_availability(self, asset: Asset) -> str:
        if not asset.sharing_quantity_is_valid:
            return Asset.SharingAvailability.BY_ARRANGEMENT
        return asset.sharing_availability

    class Meta:
        model = Asset
        fields = [
            'id', 'tenant', 'tenant_name', 'asset_type_name', 'category_code',
            'catalog_code', 'tracking_mode', 'shared_at', *SHARING_DETAIL_FIELDS,
        ]
        read_only_fields = fields
