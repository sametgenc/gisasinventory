"""Atomic quick entry for individual equipment and quantity stock."""

from copy import deepcopy

from django.db import IntegrityError, transaction
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request

from apps.tenants.models import Tenant
from apps.tenants.permissions import is_global_admin
from .identity import AssetIdentityIndex, identifier_definition, identifier_token
from .models import AssetBatchOperation, AssetType
from .serializers import AssetSerializer
from .validation import MAX_STOCK_QUANTITY, schema_role_key, stock_quantity_value


# The UI limits visible groups to 50. Per-unit identifiers expand those groups
# into wire rows, which may use the full 500-record allowance.
MAX_BATCH_ROWS = 500
MAX_BATCH_RECORDS = 500


class BatchCreateError(Exception):
    def __init__(self, detail: str, *, rows: list[dict[str, object]] | None = None,
                 status: int = 400, **extra: object) -> None:
        super().__init__(detail)
        self.status = status
        self.response = {'detail': detail, **extra}
        if rows is not None:
            self.response['rows'] = rows


class BatchQuantityField(serializers.IntegerField):
    def to_internal_value(self, data: object) -> int:
        if isinstance(data, bool) or not isinstance(data, int):
            raise serializers.ValidationError('Adet pozitif tam sayı olmalıdır.')
        return super().to_internal_value(data)


class BatchRowSerializer(serializers.Serializer):
    asset_type = serializers.UUIDField()
    quantity = BatchQuantityField(min_value=1, max_value=MAX_STOCK_QUANTITY)
    custom_data = serializers.DictField(required=False, default=dict)
    tenant = serializers.IntegerField(required=False, min_value=1)


class BatchInputSerializer(serializers.Serializer):
    operation_id = serializers.UUIDField()
    rows = serializers.ListField(min_length=1, max_length=MAX_BATCH_ROWS)


def _error_rows(errors: dict[int, object]) -> list[dict[str, object]]:
    return [{'row': number, 'errors': detail} for number, detail in sorted(errors.items())]


def create_batch(request: Request) -> dict[str, int | str]:
    submitted = BatchInputSerializer(data=request.data)
    if not submitted.is_valid():
        raise BatchCreateError(
            'İşlem kimliği ve 1–500 envanter kaydı gönderin.', errors=submitted.errors,
        )
    operation_id = submitted.validated_data['operation_id']
    rows, errors = [], {}
    for number, raw in enumerate(submitted.validated_data['rows'], start=1):
        row = BatchRowSerializer(data=raw)
        if row.is_valid():
            rows.append((number, row.validated_data))
        else:
            errors[number] = row.errors
    if errors:
        raise BatchCreateError('İşaretli satırları düzeltin. Hiçbir kayıt eklenmedi.', rows=_error_rows(errors))

    with transaction.atomic():
        # Claim before type locks: even concurrent retries with changed types
        # serialize on one durable key. Any later failure rolls the claim back.
        try:
            with transaction.atomic():
                AssetBatchOperation.objects.create(operation_id=operation_id, created_by=request.user)
        except IntegrityError as exc:
            if not AssetBatchOperation.objects.filter(pk=operation_id).exists():
                raise
            raise BatchCreateError(
                'Bu işlem daha önce kaydedildi. Envanteri yenileyin; aynı işlem yeniden eklenmedi.',
                status=409, operation_id=str(operation_id),
            ) from exc

        # Every creator uses the same type lock. Sorted acquisition avoids cycles
        # between batches that select equipment types in different display orders.
        types = {item.pk: item for item in AssetType.objects.select_for_update().filter(
            pk__in={row['asset_type'] for _, row in rows},
        ).order_by('pk')}
        privileged = is_global_admin(request.user)
        target_tenants = Tenant.objects.filter(
            pk__in={row['tenant'] for _, row in rows if 'tenant' in row}, is_active=True,
        ).in_bulk() if privileged else {}

        prepared = []
        identities = {}
        identity_indexes = {}
        record_count = unit_count = 0
        for number, row in rows:
            asset_type = types.get(row['asset_type'])
            if asset_type is None:
                errors[number] = {'asset_type': ['Ekipman türü bulunamadı. Tür listesini yenileyin.']}
                continue
            quantity = row['quantity']
            stock = asset_type.tracking_mode == AssetType.TrackingMode.STOCK
            count = 1 if stock else quantity
            record_count += count
            unit_count += quantity
            if record_count > MAX_BATCH_RECORDS:
                errors[number] = {'quantity': ['Tek işlemde en fazla 500 envanter kaydı ekleyin.']}
                continue
            if unit_count > MAX_STOCK_QUANTITY:
                errors[number] = {'quantity': ['Toplam adet güvenli sayı sınırını aşıyor. İşlemi bölün.']}
                continue

            custom_data = deepcopy(row['custom_data'])
            if stock:
                quantity_key = schema_role_key(asset_type.schema, 'quantity')
                if not quantity_key:
                    errors[number] = {'quantity': [
                        'Bu adetli türün miktar alanı tanımlı değil. Platform yöneticisi katalogda adet alanı belirlemeli.',
                    ]}
                    continue
                existing_quantity = custom_data.get(quantity_key)
                if existing_quantity is not None and existing_quantity != '':
                    try:
                        if stock_quantity_value(existing_quantity) != quantity:
                            raise ValueError
                    except ValueError:
                        errors[number] = {'custom_data': {quantity_key: [
                            'Özelliklerdeki stok miktarı girilen adetle aynı olmalıdır.',
                        ]}}
                        continue
                custom_data[quantity_key] = quantity

            field = identifier_definition(asset_type.schema)
            token = identifier_token(field, custom_data.get(field['key'])) if field else None
            if count > 1 and token is not None:
                errors[number] = {'custom_data': {field['key']: [
                    'Aynı benzersiz kayıt kodunu birden fazla ekipmanda kullanmayın. Her kodu ayrı satırda girin.',
                ]}}
                continue

            payload = {'asset_type': str(asset_type.pk), 'custom_data': custom_data}
            if 'tenant' in row:
                payload['tenant'] = row['tenant']
            tenant = target_tenants.get(row.get('tenant')) if privileged else request.user.tenant
            context = {'request': request}
            if tenant is not None and row.get('tenant', tenant.pk) == tenant.pk:
                scope = (tenant.pk, asset_type.pk)
                if scope not in identity_indexes:
                    identity_indexes[scope] = AssetIdentityIndex(tenant, asset_type)
                context['asset_identity_index'] = identity_indexes[scope]
            row_serializers = []
            for unit in range(1, count + 1):
                serializer = AssetSerializer(data={
                    **payload, 'inventory_code': f'BATCH-{operation_id.hex}-{number}-{unit}',
                }, context=context)
                if not serializer.is_valid():
                    errors[number] = serializer.errors
                    break
                row_serializers.append(serializer)
            if number in errors:
                continue

            if token is not None:
                scope = (row_serializers[0].validated_data['tenant'].pk, asset_type.pk, token)
                if scope in identities:
                    duplicate = {'custom_data': {field['key']: [
                        'Bu benzersiz kayıt kodu başka bir satırda da kullanılıyor.',
                    ]}}
                    errors[number] = duplicate
                    errors[identities[scope]] = duplicate
                else:
                    identities[scope] = number
            prepared.extend((number, serializer) for serializer in row_serializers)

        if errors:
            raise BatchCreateError('İşaretli satırları düzeltin. Hiçbir kayıt eklenmedi.', rows=_error_rows(errors))

        for number, serializer in prepared:
            try:
                saved = serializer.save()
                identity_index = serializer.context.get('asset_identity_index')
                if identity_index is not None:
                    identity_index.add(saved)
            except ValidationError as exc:
                raise BatchCreateError(
                    'Kayıt bilgileri değişti. İşaretli satırı kontrol edin. Hiçbir kayıt eklenmedi.',
                    rows=[{'row': number, 'errors': exc.detail}],
                ) from exc

    return {
        'created_count': record_count, 'record_count': record_count,
        'unit_count': unit_count, 'operation_id': str(operation_id),
    }
