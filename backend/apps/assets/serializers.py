from rest_framework import serializers
from .models import AssetType, Asset
from apps.tenants.models import Tenant


class AssetTypeSerializer(serializers.ModelSerializer):
    """
    Serializer for AssetType definitions.
    AssetTypes are global - no tenant required.
    """
    
    class Meta:
        model = AssetType
        fields = [
            'id', 'name', 'description', 
            'schema', 'created_at', 'updated_at', 'created_by'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

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
        
        for field in value:
            if not isinstance(field, dict):
                raise serializers.ValidationError("Each schema item must be a dictionary.")
            
            if 'key' not in field or 'label' not in field or 'type' not in field:
                raise serializers.ValidationError("Field definition must contain 'key', 'label', and 'type'.")
            
            if field['type'] not in valid_types:
                raise serializers.ValidationError(f"Invalid field type: {field['type']}. Valid types: {valid_types}")
                
            if field['type'] == 'select' and 'options' not in field:
                 raise serializers.ValidationError("Select fields must have 'options' list.")

            if field.get('is_unique_key'):
                unique_key_count += 1

        if unique_key_count > 1:
            raise serializers.ValidationError("Only one field can be marked as the unique index key (is_unique_key).")
                 
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user:
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class AssetSerializer(serializers.ModelSerializer):
    """
    Serializer for Assets.
    Assets are tenant-specific - tenant is required.
    """
    
    asset_type_name = serializers.CharField(source='asset_type.name', read_only=True)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    assigned_to_username = serializers.CharField(source='assigned_to.username', read_only=True, allow_null=True)
    
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
            'created_by', 'assigned_to', 'assigned_to_username'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by', 'tenant_name']

    def validate(self, data):
        """
        Validate custom_data against the AssetType schema.
        Also handle tenant assignment.
        """
        request = self.context.get('request')
        user = request.user if request else None
        
        # Handle tenant assignment
        if 'tenant' not in data or data['tenant'] is None:
            if user:
                if user.tenant:
                    # Regular user: use their tenant
                    data['tenant'] = user.tenant
                elif user.is_superuser or user.is_platform_admin:
                    # Superuser without tenant must specify tenant
                    raise serializers.ValidationError({
                        "tenant": "Please select a tenant for this asset."
                    })
                else:
                    raise serializers.ValidationError({
                        "tenant": "You must be assigned to a tenant."
                    })
        else:
            # Validate that non-superuser can only create for their tenant
            if user and not user.is_superuser and not user.is_platform_admin:
                if user.tenant and data['tenant'] != user.tenant:
                    raise serializers.ValidationError({
                        "tenant": "You can only create assets for your own tenant."
                    })
        
        # Validate custom_data against schema
        asset_type = data.get('asset_type')
        if not asset_type and self.instance:
            asset_type = self.instance.asset_type
            
        custom_data = data.get('custom_data', {})
        
        if asset_type:
            schema = asset_type.schema or []
            errors = {}
            
            for field in schema:
                key = field['key']
                required = field.get('required', False)
                field_type = field['type']
                
                value = custom_data.get(key)
                
                if required and (value is None or value == ""):
                    errors[key] = f"Field '{field['label']}' is required."
                    continue
                
                # Basic type validation
                if value is not None and value != "":
                    if field_type == 'number':
                        try:
                            float(value)
                        except (ValueError, TypeError):
                            errors[key] = f"Field '{field['label']}' must be a number."
                            
            if errors:
                raise serializers.ValidationError({"custom_data": errors})
            
        return data

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user:
            validated_data['created_by'] = request.user
        return super().create(validated_data)
