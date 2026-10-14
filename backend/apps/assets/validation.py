"""Shared field validation for forms and both Excel import paths."""
import math
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Literal, NotRequired, TypeAlias, TypedDict

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from rest_framework import serializers
from .identity import canonical_identifier_value, identifier_definition


MAX_STOCK_QUANTITY = 2 ** 53 - 1


JSONValue: TypeAlias = str | int | float | bool | None | list['JSONValue'] | dict[str, 'JSONValue']


class FieldDefinition(TypedDict):
    key: str
    label: str
    type: Literal['text', 'number', 'date', 'select', 'checkbox', 'email', 'phone']
    required: NotRequired[bool]
    options: NotRequired[list[str]]
    default: NotRequired[JSONValue]
    is_unique_key: NotRequired[bool]
    role: NotRequired[Literal['identifier', 'display_name', 'quantity'] | None]
    unit: NotRequired[str]


def default_stock_schema() -> list[FieldDefinition]:
    """Optional stock suggestions; owners choose their own fields and requirements."""
    return [
        {"key": "material_code", "label": "Malzeme kodu", "type": "text", "required": False,
         "is_unique_key": True, "role": "identifier"},
        {"key": "material_name", "label": "Malzeme adı", "type": "text", "required": False, "role": "display_name"},
        {"key": "quantity", "label": "Stok adedi", "type": "number", "required": False, "role": "quantity"},
    ]


def validate_field_schema(value: object) -> list[FieldDefinition]:
    """One schema contract for manual entry and every spreadsheet import."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError('Alanlar bir liste olmalıdır.')
    valid_types = {'text', 'number', 'date', 'select', 'checkbox', 'email', 'phone'}
    roles = {'identifier', 'display_name', 'quantity'}
    keys, assigned_roles, unique_keys = set(), {}, []
    normalized = []
    for definition in value:
        if not isinstance(definition, dict) or not {'key', 'label', 'type'}.issubset(definition):
            raise serializers.ValidationError('Her alanda anahtar, ad ve alan türü bulunmalıdır.')
        field = dict(definition)
        key = field['key']
        if not isinstance(key, str) or not key.strip() or '__' in key or key in keys:
            raise serializers.ValidationError('Alan anahtarları boş olamaz, tekrarlanamaz ve çift alt çizgi içeremez.')
        keys.add(key)
        if not isinstance(field['label'], str) or not field['label'].strip():
            raise serializers.ValidationError('Alan adı boş olamaz.')
        if not isinstance(field['type'], str) or field['type'] not in valid_types:
            raise serializers.ValidationError('Geçersiz alan türü.')
        for flag in ('required', 'is_unique_key'):
            if flag in field and not isinstance(field[flag], bool):
                raise serializers.ValidationError(f'{flag} yalnızca true veya false olabilir.')
        field.setdefault('required', False)
        if field['type'] == 'select':
            options = field.get('options')
            if not isinstance(options, list) or not options or not all(
                    isinstance(option, str) and option.strip() for option in options):
                raise serializers.ValidationError('Seçim alanında en az bir seçenek bulunmalıdır.')
        role = field.get('role')
        if role is not None:
            if not isinstance(role, str) or role not in roles or role in assigned_roles:
                raise serializers.ValidationError('Alan görevi geçerli olmalı ve yalnızca bir alanda kullanılmalıdır.')
            if role == 'quantity' and field['type'] != 'number':
                raise serializers.ValidationError('Adet alanı sayı türünde olmalıdır.')
            assigned_roles[role] = key
        if field.get('is_unique_key') is True:
            if 'role' in field and role != 'identifier':
                raise serializers.ValidationError('Eşleştirme anahtarı kayıt kodu göreviyle kullanılmalıdır.')
            unique_keys.append(key)
        if 'unit' in field and not isinstance(field['unit'], str):
            raise serializers.ValidationError('Birim metin olmalıdır.')
        normalized.append(field)
    if len(unique_keys) > 1:
        raise serializers.ValidationError('Yalnızca bir alan eşleştirme anahtarı olabilir.')
    if unique_keys and assigned_roles.get('identifier', unique_keys[0]) != unique_keys[0]:
        raise serializers.ValidationError('Kayıt kodu ve eşleştirme anahtarı aynı alan olmalıdır.')
    return normalized


def schema_role_key(schema: list[FieldDefinition], role: str) -> str | None:
    """Explicit roles win; fallback reads only fields that exist in legacy schemas."""
    for field in schema or []:
        if field.get('role') == role:
            return field['key']
    if role == 'identifier':
        for field in schema or []:
            if field.get('is_unique_key') is True and 'role' not in field:
                return field['key']
    fallbacks = {
        'identifier': (),
        'display_name': ('material_name', 'name', 'title'),
        'quantity': ('quantity',),
    }
    fields = {field['key']: field for field in schema or []}
    for key in fallbacks.get(role, ()):
        if (key in fields and 'role' not in fields[key]
                and (role != 'identifier' or fields[key].get('is_unique_key') is not False)
                and (role != 'quantity' or fields[key].get('type') == 'number')):
            return key
    return None


def missing_required_fields(schema: list[FieldDefinition], data: object) -> list[dict[str, str]]:
    """Zero and false are supplied values; whitespace-only text is missing."""
    values = data if isinstance(data, dict) else {}
    return [{'key': field['key'], 'label': field['label']} for field in schema or []
            if field.get('required') is True and _missing_value(values.get(field['key']))]


def _missing_value(value: object) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def stock_quantity_from_data(schema: list[FieldDefinition], data: object) -> int | None:
    """Unknown quantity remains unknown; callers must never offer it as zero."""
    key = schema_role_key(schema, 'quantity')
    if key is None or not isinstance(data, dict) or _missing_value(data.get(key)):
        return None
    try:
        return stock_quantity_value(data[key])
    except ValueError:
        return None


def validate_stock_schema(schema: list[FieldDefinition]) -> list[FieldDefinition]:
    """Stock schemas may be empty or custom; only explicit roles have semantics."""
    return validate_field_schema(schema)


def validate_stock_data(
    data: dict[str, JSONValue], schema: list[FieldDefinition] | None = None,
) -> dict[str, JSONValue]:
    errors = {}
    result = dict(data)
    schema = default_stock_schema() if schema is None else schema
    for role in ('identifier', 'display_name'):
        key = schema_role_key(schema, role)
        if key is None or key not in result:
            continue
        value = data.get(key)
        if isinstance(value, str):
            result[key] = value.strip()
    quantity_key = schema_role_key(schema, 'quantity')
    if quantity_key and not _missing_value(data.get(quantity_key)):
        try:
            result[quantity_key] = stock_quantity_value(data[quantity_key])
        except ValueError:
            errors[quantity_key] = f'Stok adedi 0 ile {MAX_STOCK_QUANTITY} arasında tam sayı olmalıdır.'
    if errors:
        raise serializers.ValidationError({'custom_data': errors})
    return result


def stock_quantity_value(value: object) -> int:
    """Retain decimal precision until integral count validation has finished."""
    try:
        if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
            raise ValueError
        quantity = Decimal(str(value))
        if (not quantity.is_finite() or quantity < 0 or quantity > MAX_STOCK_QUANTITY
                or quantity != quantity.to_integral_value()):
            raise ValueError
        return int(quantity)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f'Stok adedi 0 ile {MAX_STOCK_QUANTITY} arasında tam sayı olmalıdır.') from exc


def import_field_value(value, kind, stock_quantity=False, identifier=False):
    """Convert spreadsheet scalars without conflating zero/false with missing."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if stock_quantity:
        return stock_quantity_value(value)
    if identifier and kind == 'number':
        return canonical_identifier_value({'type': kind}, value)
    if kind == "checkbox":
        text = str(value).strip().lower()
        if text in ("evet", "yes", "true", "1", "x", "doğru"):
            return True
        if text in ("hayır", "hayir", "no", "false", "0", "yanlış", "yanlis"):
            return False
        raise ValueError("Use true/false or yes/no for checkbox fields.")
    if kind == "number":
        if isinstance(value, bool):
            raise ValueError("Expected a number, not a boolean.")
        return float(value)
    if kind == "date" and hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    return str(value).strip()


def validate_custom_data(schema, data, tracking_mode='individual'):
    if not isinstance(data, dict):
        raise serializers.ValidationError({"custom_data": "Expected an object of field values."})
    if tracking_mode == 'stock':
        data = validate_stock_data(data, schema)
    errors = {}
    for field in schema:
        key = field["key"]
        value = data.get(key)
        if _missing_value(value):
            if field.get("required") is True:
                errors[key] = f"Field '{field['label']}' is required."
            continue
        kind = field["type"]
        try:
            if kind == "number":
                if isinstance(value, bool) or not math.isfinite(float(value)):
                    raise ValueError("Expected a finite number.")
            elif kind == "checkbox":
                if not isinstance(value, bool):
                    raise ValueError("Expected true or false.")
            elif kind == "date":
                if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
                    raise ValueError("Expected a date in YYYY-MM-DD format.")
            elif kind == "select":
                if value not in field.get("options", []):
                    raise ValueError("Select one of the configured options.")
            elif kind == "email":
                validate_email(value)
            elif kind in ("text", "phone") and not isinstance(value, str):
                raise ValueError("Expected text.")
        except (ValueError, TypeError, OverflowError, ValidationError):
            errors[key] = f"Invalid {kind} value for '{field['label']}'."
    if errors:
        raise serializers.ValidationError({"custom_data": errors})
    field = identifier_definition(schema)
    if field and field['key'] in data:
        data = {**data, field['key']: canonical_identifier_value(field, data[field['key']])}
    return data
