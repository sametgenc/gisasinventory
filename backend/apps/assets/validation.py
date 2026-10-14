"""Shared field validation for forms and both Excel import paths."""
import math
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Literal, NotRequired, TypeAlias, TypedDict

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from rest_framework import serializers


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


def default_stock_schema() -> list[FieldDefinition]:
    """Canonical stock fields; each caller receives its own mutable definitions."""
    return [
        {"key": "material_code", "label": "Malzeme kodu", "type": "text", "required": True, "is_unique_key": True},
        {"key": "material_name", "label": "Malzeme adı", "type": "text", "required": True},
        {"key": "quantity", "label": "Stok adedi", "type": "number", "required": True},
    ]


def validate_stock_schema(schema: list[FieldDefinition]) -> list[FieldDefinition]:
    """Stock semantics must remain explicit even when additional fields are added."""
    fields = {field['key']: field for field in schema}
    for canonical in default_stock_schema():
        field = fields.get(canonical['key'])
        if not field or field.get('type') != canonical['type'] or field.get('required') is not True:
            raise serializers.ValidationError(
                {'schema': f"Stok takibinde '{canonical['label']}' alanı zorunlu ve {canonical['type']} türünde olmalıdır."}
            )
        if canonical.get('is_unique_key') and field.get('is_unique_key') is not True:
            raise serializers.ValidationError({'schema': 'Malzeme kodu eşleştirme alanı olmalıdır.'})
    return schema


def validate_stock_data(data: dict[str, JSONValue]) -> dict[str, JSONValue]:
    errors = {}
    result = dict(data)
    for key, label in [('material_code', 'Malzeme kodu'), ('material_name', 'Malzeme adı')]:
        value = data.get(key)
        if not isinstance(value, str) or not value.strip():
            errors[key] = f'{label} boş bırakılamaz.'
        else:
            result[key] = value.strip()
    try:
        result['quantity'] = stock_quantity_value(data.get('quantity'))
    except ValueError:
        errors['quantity'] = f'Stok adedi 0 ile {MAX_STOCK_QUANTITY} arasında tam sayı olmalıdır.'
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


def import_field_value(value, kind, stock_quantity=False):
    """Convert spreadsheet scalars without conflating zero/false with missing."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if stock_quantity:
        return stock_quantity_value(value)
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
        data = validate_stock_data(data)
    errors = {}
    for field in schema:
        key = field["key"]
        value = data.get(key)
        if value is None or value == "":
            if field.get("required"):
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
        except (ValueError, TypeError, ValidationError):
            errors[key] = f"Invalid {kind} value for '{field['label']}'."
    if errors:
        raise serializers.ValidationError({"custom_data": errors})
    return data
