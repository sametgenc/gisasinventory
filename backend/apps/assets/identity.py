"""Exact identity matching across legacy JSON numbers and numeric strings."""

import json
from collections import defaultdict
from decimal import Decimal, InvalidOperation


def identifier_definition(schema):
    from .validation import schema_role_key

    key = schema_role_key(schema, 'identifier')
    return next((field for field in schema or [] if field['key'] == key), None)


def canonical_identifier_value(field, value):
    """Numeric identities use strings to retain decimal precision in JSON."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None if value is None else ''
    if field['type'] != 'number':
        return value.strip() if isinstance(value, str) else value
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ValueError('Kayıt kodu geçerli bir sayı olmalıdır.')
    try:
        number = Decimal(str(value))
        if not number.is_finite():
            raise ValueError
        if not number:
            return '0'
        sign, digits, exponent = number.as_tuple()
        coefficient = ''.join(str(digit) for digit in digits)
        trimmed = coefficient.rstrip('0')
        exponent += len(coefficient) - len(trimmed)
        coefficient = trimmed
        prefix = '-' if sign else ''
        # Bound expansion of small scientific input, e.g. 1e-1000000.
        if -160 <= exponent <= 160 and len(coefficient) + abs(exponent) <= 320:
            if exponent >= 0:
                return prefix + coefficient + '0' * exponent
            point = len(coefficient) + exponent
            if point > 0:
                return prefix + coefficient[:point] + '.' + coefficient[point:]
            return prefix + '0.' + '0' * (-point) + coefficient
        return prefix + coefficient + 'e' + str(exponent)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError('Kayıt kodu geçerli bir sayı olmalıdır.') from exc


def identifier_token(field, value):
    if field is None or value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        canonical = canonical_identifier_value(field, value)
    except ValueError:
        return None
    return field['type'], json.dumps(canonical, sort_keys=True, ensure_ascii=False)


class AssetIdentityIndex:
    """One scoped read builds all identity lookups for a workbook plan."""

    def __init__(self, tenant, asset_type, records=None):
        from .models import Asset

        self.tenant_id = str(tenant.pk)
        self.asset_type_id = str(asset_type.pk)
        self.field = identifier_definition(asset_type.schema)
        self.by_code = defaultdict(dict)
        self.by_identifier = defaultdict(dict)
        self.entries = {}
        if records is None:
            records = Asset.objects.filter(tenant=tenant, asset_type=asset_type).select_related('asset_type')
        for record in records:
            self.add(record)

    def matches_scope(self, tenant, asset_type):
        return (self.tenant_id == str(tenant.pk) and self.asset_type_id == str(asset_type.pk)
                and self.field == identifier_definition(asset_type.schema))

    def add(self, record):
        self.remove(record.pk)
        token = identifier_token(self.field, record.custom_data.get(self.field['key'])) if self.field else None
        code = record.inventory_code
        self.entries[record.pk] = code, token
        if code:
            self.by_code[code][record.pk] = record
        if token is not None:
            self.by_identifier[token][record.pk] = record

    def remove(self, pk):
        entry = self.entries.pop(pk, None)
        if entry is None:
            return
        code, token = entry
        if code:
            self.by_code[code].pop(pk, None)
        if token is not None:
            self.by_identifier[token].pop(pk, None)

    def matching(self, *, inventory_code='', identifier=None):
        matches = dict(self.by_code.get(inventory_code, {})) if inventory_code else {}
        token = identifier_token(self.field, identifier)
        if token is not None:
            matches.update(self.by_identifier.get(token, {}))
        return list(matches.values())

    def identifier_matches(self, value):
        token = identifier_token(self.field, value)
        return list(self.by_identifier.get(token, {}).values()) if token is not None else []
