"""Bounded, review-first import of global definitions and one shipyard's inventory.

Workbook cells are untrusted data. Definitions never imply physical inventory or
permission to publish. A signed preview covers the complete atomic operation.
"""

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass, field
from io import BytesIO

from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.tenants.models import Tenant
from apps.tenants.permissions import is_global_admin
from .inventory_import import (
    HEADER_SCAN_ROWS, MAX_UPLOAD_BYTES, InventoryImportError,
    _bounded_workbook, _read_sheets, _row_skip_reason, _suggest_mapping,
    _validate_worksheet_relations, is_blank, normalized,
)
from .models import Asset, AssetType
from .serializers import AssetSerializer, AssetTypeSerializer
from .validation import import_field_value, schema_role_key, validate_custom_data
from .identity import AssetIdentityIndex, identifier_definition, identifier_token


SALT = 'assets.combined-workbook.v1'
MAX_RECORDS = 2000
PUBLIC_TYPE_ATTRIBUTES = (
    'name', 'description', 'category_code', 'sharing_class', 'exclusion_reason', 'tracking_mode',
)
TYPE_HEADERS = {
    'Katalog kodu': 'catalog_code', 'Ekipman türü': 'name', 'Varlık tipi': 'name',
    'Kategori kodu': 'category_code', 'Kategori': 'category_code',
    'Ön paylaşım sınıfı': 'sharing_class', 'Kapsam dışı nedeni': 'exclusion_reason',
    'Açıklama': 'description', 'Takip biçimi': 'tracking_mode',
}
TAXONOMY_HEADERS = {
    'Kod': 'category_code', 'Ana kategori': 'category_name', 'Ekipman': 'name',
    'Kullanım amacı': 'description', 'Ölçü birimi': 'technical_unit',
    'Mobilite': 'mobility', 'Kritiklik': 'criticality',
    'Sertifikasyon / kontrol': 'inspection', 'Ön paylaşım sınıfı': 'sharing_class',
}
FIELD_HEADERS = {
    'Katalog kodu': 'catalog_code', 'Alan kodu': 'key', 'Alan adı': 'label',
    'Alan türü': 'type', 'Zorunlu': 'required', 'Görevi': 'role',
    'Seçenekler': 'options', 'Benzersiz eşleştirme': 'is_unique_key',
}
INVENTORY_HEADERS = {'Katalog kodu': 'catalog_code', 'Envanter kodu': 'inventory_code'}
FIELD_TYPES = {'metin': 'text', 'sayi': 'number', 'tarih': 'date', 'secim': 'select',
               'evethayir': 'checkbox', 'eposta': 'email', 'telefon': 'phone'}
ROLES = {'kimlik': 'identifier', 'gorunenad': 'display_name', 'adet': 'quantity'}
MODES = {'tektekekipman': 'individual', 'tekil': 'individual', 'individual': 'individual',
         'adetlimalzemestoku': 'stock', 'adetli': 'stock', 'stock': 'stock'}


def _header_map(headers):
    return {normalized(label): key for label, key in headers.items()}


def _text(value):
    return '' if is_blank(value) else str(value).strip()


def _errors(detail):
    if isinstance(detail, dict):
        return [f'{key}: {message}' for key, value in detail.items() for message in _errors(value)]
    if isinstance(detail, (list, tuple)):
        return [message for item in detail for message in _errors(item)]
    return [str(detail)]


def _choice(value):
    """Markdown emphasis in source data is decoration, never an instruction."""
    return _text(value).replace('*', '').strip().upper()


def _generated_code(name):
    # Content-derived identity stays stable when source rows are reordered.
    return 'CAT-' + hashlib.sha256(normalized(name).encode()).hexdigest()[:20].upper()


def read_workbook(upload):
    if not upload or not upload.name.lower().endswith('.xlsx'):
        raise ValidationError({'detail': 'Lütfen .xlsx uzantılı Excel dosyası seçin.'})
    upload.seek(0)
    content = upload.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValidationError({'detail': 'Excel dosyası en fazla 5 MB olabilir.'})
    try:
        workbook, metadata = _bounded_workbook(BytesIO(content))
        try:
            _validate_worksheet_relations(workbook, metadata)
            sheets = _read_sheets(workbook, metadata)
        finally:
            workbook.close()
    except InventoryImportError as exc:
        raise ValidationError({'detail': str(exc)}) from exc
    return content, sheets


def parse_decisions(value):
    if isinstance(value, str):
        if len(value) > 128 * 1024:
            raise ValidationError({'detail': 'İnceleme tercihleri çok büyük.'})
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValidationError({'detail': 'İnceleme tercihleri geçerli JSON olmalıdır.'}) from exc
    value = value or {}
    allowed = {'classifications', 'tracking_modes', 'exclude_rows', 'column_mapping'}
    if not isinstance(value, dict) or set(value) - allowed:
        raise ValidationError({'detail': 'İnceleme tercihleri geçersiz.'})
    result = {key: value.get(key, {}) for key in allowed}
    if any(not isinstance(item, dict) for item in result.values()):
        raise ValidationError({'detail': 'İnceleme tercihleri alan listeleri olmalıdır.'})
    for key, choices in result.items():
        if any(not isinstance(label, str) for label in choices):
            raise ValidationError({'detail': 'İnceleme tercihleri geçersiz.'})
        if key == 'classifications' and any(choice not in ('A', 'B', 'C') for choice in choices.values()):
            raise ValidationError({'detail': 'Paylaşım sınıfı A, B veya C olmalıdır.'})
        if key == 'tracking_modes' and any(choice not in ('individual', 'stock') for choice in choices.values()):
            raise ValidationError({'detail': 'Takip biçimi tek tek veya adetli olmalıdır.'})
        if key == 'column_mapping' and any(not isinstance(choice, str) for choice in choices.values()):
            raise ValidationError({'detail': 'Sütun eşleştirmeleri alan kodları olmalıdır.'})
        if key == 'exclude_rows' and any(not isinstance(rows, list) or any(
                type(row) is not int or not 1 <= row <= 20_000 for row in rows) for rows in choices.values()):
            raise ValidationError({'detail': 'Atlanacak satır numaraları geçersiz.'})
    return result


def resolve_tenant(user, tenant_id):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Aktif hesapla giriş yapın.')
    if not is_global_admin(user):
        if not user.is_tenant_admin or not user.tenant_id or not user.tenant.is_active:
            raise PermissionDenied('Excel aktarımı için tersane yöneticisi yetkisi gerekir.')
        if tenant_id not in (None, '', str(user.tenant_id), user.tenant_id):
            raise PermissionDenied('Yalnızca kendi tersanenizin envanterini aktarabilirsiniz.')
        return user.tenant
    if tenant_id in (None, ''):
        return None
    try:
        return Tenant.objects.get(pk=tenant_id, is_active=True)
    except (Tenant.DoesNotExist, DjangoValidationError, ValueError, TypeError) as exc:
        raise ValidationError({'tenant': 'Aktif bir tersane seçin.'}) from exc


@dataclass
class Definition:
    sheet: str
    row: int
    values: dict
    instance: AssetType | None = None
    schema: list | None = None
    errors: list = field(default_factory=list)
    operation: str = 'unchanged'
    serializer: AssetTypeSerializer | None = None
    impact: dict | None = None

    @property
    def code(self):
        return self.values['catalog_code']


@dataclass
class InventoryLine:
    sheet: str
    row: int
    code: str
    inventory_code: str
    custom_data: dict
    instance: Asset | None = None
    errors: list = field(default_factory=list)
    operation: str = 'create'


@dataclass
class Plan:
    definitions: dict = field(default_factory=dict)
    inventory: list = field(default_factory=list)
    rows: list = field(default_factory=list)
    sheets: list = field(default_factory=list)
    notices: list = field(default_factory=list)
    action_required: list = field(default_factory=list)
    skipped: int = 0
    fingerprint: str = ''
    identity_indexes: dict = field(default_factory=dict)

    def response(self):
        rows = [{**row, 'operation': 'error' if row.get('errors') else row['operation']} for row in self.rows]
        errors = [row for row in rows if row.get('errors')]
        summary = {
            'types_created': sum(item.operation == 'create' and not item.errors for item in self.definitions.values()),
            'types_updated': sum(item.operation == 'update' and not item.errors for item in self.definitions.values()),
            'assets_created': sum(item.operation == 'create' and not item.errors for item in self.inventory),
            'assets_updated': sum(item.operation == 'update' and not item.errors for item in self.inventory),
            'skipped_rows_count': self.skipped,
        }
        return {'summary': summary, 'rows': rows, 'sheets': self.sheets, 'notices': self.notices,
                'action_required': self.action_required, 'errors': errors, 'can_commit': not errors and not self.action_required,
                'types': [{'catalog_code': item.code, 'name': item.values['name'],
                           'tracking_mode': item.values['tracking_mode'], 'schema': item.schema,
                           'operation': item.operation, 'impact': item.impact} for item in self.definitions.values()]}


def _kind(sheet, taxonomy_present):
    title = normalized(sheet.name)
    if title == '1taksonomi':
        return 'taxonomy'
    if title in ('ekipmanturleri', 'katalog', 'varliktipleri'):
        return 'types'
    if title in ('alanlar', 'fields'):
        return 'fields'
    if title in ('envanter', 'inventory'):
        return 'inventory'
    if taxonomy_present:
        return 'ignored'
    return 'ignored'


def _header(sheet, kind):
    aliases = _header_map({'types': TYPE_HEADERS, 'taxonomy': TAXONOMY_HEADERS,
                           'fields': FIELD_HEADERS, 'inventory': INVENTORY_HEADERS}[kind])
    required = {'types': {'name'}, 'taxonomy': {'name', 'category_code', 'sharing_class'},
                'fields': {'catalog_code', 'label', 'type'}, 'inventory': {'catalog_code'}}[kind]
    for number, row in enumerate(sheet.rows[:HEADER_SCAN_ROWS], 1):
        headers = [_text(cell.value) for cell in row]
        mapped = [aliases.get(normalized(header)) for header in headers]
        if required.issubset(set(mapped)):
            nonempty = [normalized(header) for header in headers if header]
            if len(nonempty) != len(set(nonempty)):
                raise ValidationError({'detail': f'{sheet.name}: aynı sütun başlığı birden fazla kez kullanılmış.'})
            mapped_nonempty = [value for value in mapped if value]
            if len(mapped_nonempty) != len(set(mapped_nonempty)):
                raise ValidationError({'detail': f'{sheet.name}: aynı alan için birden fazla sütun var.'})
            if any(cell.kind in ('f', 'e') for cell in row):
                raise ValidationError({'detail': f'{sheet.name}: başlıklar düz metin olmalıdır.'})
            return number, headers, mapped
    if any(not is_blank(cell.value) for row in sheet.rows for cell in row):
        raise ValidationError({'detail': f'{sheet.name}: sütunlar tanınamadı. Birleşik Excel şablonunu kullanın.'})
    return 0, [], []


def _records(sheet, kind, decisions, plan):
    header_row, headers, mapping = _header(sheet, kind)
    records = []
    if header_row:
        for number, cells in enumerate(sheet.rows[header_row:], header_row + 1):
            if not any(not is_blank(cell.value) for cell in cells):
                continue
            excluded = number in decisions['exclude_rows'].get(sheet.name, [])
            reason = _row_skip_reason(number, cells, headers, sheet, [],
                                      {header: ('code' if key == 'inventory_code' else key)
                                       for header, key in zip(headers, mapping)}, None)
            if excluded or reason:
                plan.skipped += 1
                plan.rows.append({'sheet': sheet.name, 'row': number, 'kind': kind,
                                  'operation': 'skip', 'reason': 'manual' if excluded else reason, 'errors': []})
                continue
            errors = []
            if any(cell.kind in ('f', 'e') for cell in cells):
                errors.append('Formül veya Excel hatası var. Hücreyi gerçek değere dönüştürün ya da satırı atlayın.')
            if kind != 'inventory' and any(not is_blank(cell.value) and not key
                                          for cell, key in zip(cells, mapping)):
                errors.append('Tanınmayan sütunda veri var. Sütunu şablonla eşleştirin veya kaldırın.')
            values = {key: cell.value for key, cell in zip(mapping, cells) if key}
            records.append((number, values, errors, headers, cells))
    plan.sheets.append({'name': sheet.name, 'kind': kind, 'header_row': header_row, 'record_count': len(records)})
    return records


def _type_values(values, kind, instance):
    if instance:
        result = {key: getattr(instance, key) for key in (
            'name', 'catalog_code', 'category_code', 'sharing_class', 'exclusion_reason', 'description', 'tracking_mode')}
    else:
        result = {'name': '', 'catalog_code': None, 'category_code': '', 'sharing_class': '',
                  'exclusion_reason': '', 'description': '', 'tracking_mode': 'individual'}
    for key, value in values.items():
        if key in result:
            if key == 'tracking_mode' and instance and is_blank(value):
                continue
            result[key] = _text(value)
    result['category_code'] = _choice(result['category_code'])
    result['sharing_class'] = _choice(result['sharing_class'])
    if kind == 'taxonomy':
        metadata = [('Ölçü birimi', 'technical_unit'), ('Mobilite', 'mobility'),
                    ('Kritiklik', 'criticality'), ('Sertifikasyon / kontrol', 'inspection')]
        result['description'] = '\n'.join([_text(values.get('description'))] + [
            f'{label}: {_text(values.get(key))}' for label, key in metadata if not is_blank(values.get(key))])
    raw_mode = normalized(result['tracking_mode'])
    result['tracking_mode'] = MODES.get(raw_mode, _text(result['tracking_mode'])) or 'individual'
    return result


def build_plan(sheets, decisions, tenant, request):
    plan = Plan()
    existing_types = list(AssetType.objects.order_by('pk'))
    by_code = {item.catalog_code: item for item in existing_types if item.catalog_code}
    by_name = {item.name.casefold(): item for item in existing_types}
    taxonomy_present = any(normalized(sheet.name) == '1taksonomi' for sheet in sheets)
    parsed = []
    total_records = 0
    seen_kinds = set()
    for sheet in sheets:
        kind = _kind(sheet, taxonomy_present)
        if kind == 'ignored':
            plan.sheets.append({'name': sheet.name, 'kind': kind, 'header_row': None, 'record_count': 0})
            continue
        if kind in seen_kinds or (kind in ('types', 'taxonomy') and seen_kinds.intersection({'types', 'taxonomy'})):
            raise ValidationError({'detail': 'Aynı içerik için birden fazla sayfa var. Tek tür, alan ve envanter sayfası kullanın.'})
        seen_kinds.add(kind)
        records = _records(sheet, kind, decisions, plan)
        total_records += len(records)
        if total_records > MAX_RECORDS:
            raise ValidationError({'detail': 'Tek dosyada en fazla 2000 kayıt aktarılabilir. Dosyayı parçalara ayırın.'})
        parsed.append((sheet, kind, records))
    if not total_records and not plan.skipped:
        raise ValidationError({'detail': 'Aktarılacak kayıt bulunamadı. Ekipman türleri, Alanlar veya Envanter sayfasını doldurun.'})
    if taxonomy_present:
        plan.notices += ['Taksonomi yalnızca ortak ekipman türlerini içerir; tersane envanteri veya adet oluşturulmaz.',
                         'Kod sütunundaki A–M harfleri kategoridir. Her ekipman türü ayrı kalıcı katalog kodu alır.',
                         'Kategori sayfaları ana taksonominin tekrarlarıdır; yalnızca 1-TAKSONOMI aktarılır.',
                         'K kategorisi paylaşım kapsamı dışında kalır. Ön paylaşım sınıfı kullanım onayı değildir.']
    seen_names = set()
    for sheet, kind, records in parsed:
        if kind not in ('types', 'taxonomy'):
            continue
        for number, values, errors, _, _ in records:
            name = _text(values.get('name'))
            if name.casefold() in seen_names:
                errors.append('Aynı ekipman türü adı dosyada birden fazla kez kullanılmış.')
            seen_names.add(name.casefold())
            raw_code = _choice(values.get('catalog_code'))
            instance = by_code.get(raw_code) if raw_code else by_name.get(name.casefold())
            data = _type_values(values, kind, instance)
            data['catalog_code'] = raw_code or (instance.catalog_code if instance else None) or _generated_code(name)
            if data['sharing_class'] == 'B/C':
                choice = decisions['classifications'].get(f'{sheet.name}:{number}')
                if choice:
                    data['sharing_class'] = choice
                else:
                    plan.action_required.append({'code': 'classification_required', 'sheet': sheet.name, 'row': number,
                                                 'message': f'{name}: kaynak B/C diyor. Paylaşım sınıfını seçin.',
                                                 'choices': ['B', 'C']})
                    errors.append('B/C paylaşım sınıfı için karar gerekiyor.')
            if data['catalog_code'] in decisions['tracking_modes']:
                data['tracking_mode'] = decisions['tracking_modes'][data['catalog_code']]
            if data['catalog_code'] in plan.definitions:
                errors.append('Katalog kodu dosyada birden fazla kez kullanılmış.')
                plan.definitions[data['catalog_code']].errors.append('Katalog kodu dosyada birden fazla kez kullanılmış.')
            definition = Definition(sheet.name, number, data, instance, deepcopy(instance.schema) if instance else [], errors)
            if data['catalog_code'] not in plan.definitions:
                plan.definitions[data['catalog_code']] = definition
            else:
                plan.rows.append({'sheet': sheet.name, 'row': number, 'kind': 'type', 'operation': 'error',
                                  'catalog_code': data['catalog_code'], 'name': name, 'errors': errors})
    # Existing definitions can be referenced by fields/inventory without copying
    # the global catalog into each shipyard's workbook.
    def get_definition(code, sheet, number):
        if code in plan.definitions:
            return plan.definitions[code]
        instance = by_code.get(code)
        if not instance:
            return None
        definition = Definition(sheet, number, _type_values({}, 'types', instance), instance, deepcopy(instance.schema))
        plan.definitions[code] = definition
        return definition

    field_keys = set()
    for sheet, kind, records in parsed:
        if kind != 'fields':
            continue
        for number, values, errors, _, _ in records:
            code = _choice(values.get('catalog_code'))
            definition = get_definition(code, sheet.name, number)
            if not definition:
                errors.append('Katalog kodu bulunamadı. Türü Ekipman türleri sayfasına ekleyin veya mevcut kodu kullanın.')
            key = _text(values.get('key')) or normalized(values.get('label'))
            if (code, key) in field_keys:
                errors.append('Aynı alan kodu dosyada birden fazla kez kullanılmış.')
            field_keys.add((code, key))
            schema = definition.schema if definition else []
            previous = next((item for item in schema if item['key'] == key), None)
            proposed = deepcopy(previous) if previous else {'key': key, 'required': False}
            proposed.update(label=_text(values.get('label')), type=FIELD_TYPES.get(
                normalized(values.get('type')), _text(values.get('type')).lower()))
            for boolean in ('required', 'is_unique_key'):
                if not is_blank(values.get(boolean)):
                    try:
                        proposed[boolean] = import_field_value(values[boolean], 'checkbox')
                    except ValueError:
                        errors.append(f'{boolean}: Evet veya Hayır yazın.')
            if 'role' in values:
                role = _text(values['role'])
                if role:
                    proposed['role'] = ROLES.get(normalized(role), role)
            if 'options' in values and not is_blank(values['options']):
                proposed['options'] = [option.strip() for option in str(values['options']).split('|') if option.strip()]
            if definition and not errors:
                definition.schema = [item for item in schema if item['key'] != key] + [proposed]
            if errors and definition:
                definition.errors += [f'Alanlar satır {number}: {message}' for message in errors]
            plan.rows.append({'sheet': sheet.name, 'row': number, 'kind': 'field', 'catalog_code': code,
                              'name': proposed['label'], 'operation': 'error' if errors else 'proposal', 'errors': errors})
    for definition in plan.definitions.values():
        definition.values['schema'] = definition.schema
        serializer = AssetTypeSerializer(definition.instance, data=definition.values,
                                         partial=bool(definition.instance), context={'request': request})
        if serializer.is_valid():
            definition.values = dict(serializer.validated_data)
            definition.values['catalog_code'] = definition.values.get('catalog_code') or definition.code
            definition.schema = definition.values['schema']
            definition.serializer = serializer
        else:
            definition.errors += _errors(serializer.errors)
        changed = not definition.instance or any(getattr(definition.instance, key) != value
                                                for key, value in definition.values.items())
        definition.operation = ('create' if not definition.instance else 'update') if changed else 'unchanged'
        if changed and not is_global_admin(request.user):
            definition.errors.append('Ortak ekipman türünü veya alanlarını değiştirmek için platform yöneticisi yetkisi gerekir.')
        if changed and definition.instance and not definition.errors:
            previous_required = {item['key'] for item in definition.instance.schema or [] if item.get('required') is True}
            new_required = [item for item in definition.schema if item.get('required') is True
                            and item['key'] not in previous_required]
            if new_required:
                from .schema_evolution import schema_impact
                definition.impact = schema_impact(definition.instance, new_required)
        plan.rows.append({'sheet': definition.sheet, 'row': definition.row, 'kind': 'type',
                          'catalog_code': definition.code, 'name': definition.values['name'],
                          'operation': 'error' if definition.errors else definition.operation, 'errors': definition.errors,
                          'changes': {key: {'before': getattr(definition.instance, key), 'after': definition.values[key]}
                                      for key in PUBLIC_TYPE_ATTRIBUTES if definition.instance
                                      and getattr(definition.instance, key) != definition.values[key]}})
    _build_inventory(plan, parsed, decisions, tenant, get_definition)
    # Definitions first referenced by inventory still need to appear in proposals.
    for definition in plan.definitions.values():
        if definition.serializer is None and not definition.errors:
            definition.values['schema'] = definition.schema
    fingerprint = {'types': [{key: getattr(item, key) for key in (
        'pk', 'name', 'catalog_code', 'category_code', 'sharing_class', 'exclusion_reason',
        'description', 'tracking_mode', 'schema', 'schema_revision', 'updated_at')} for item in existing_types],
        'assets': [(str(line.instance.pk), line.instance.updated_at, line.instance.custom_data,
                    line.instance.inventory_code, line.instance.is_shared, line.instance.sharing_quantity)
                   for line in plan.inventory if line.instance]}
    plan.fingerprint = hashlib.sha256(json.dumps(fingerprint, sort_keys=True, default=str).encode()).hexdigest()
    return plan


def _build_inventory(plan, parsed, decisions, tenant, get_definition):
    seen_codes = {}
    seen_identifiers = {}
    if tenant:
        for sheet, kind, records in parsed:
            if kind != 'inventory':
                continue
            for number, values, _, _, _ in records:
                code = _choice(values.get('catalog_code'))
                definition = get_definition(code, sheet.name, number)
                if not definition or code in plan.identity_indexes:
                    continue
                proposed = AssetType(**{**definition.values, 'schema': definition.schema})
                if definition.instance:
                    proposed.pk = definition.instance.pk
                plan.identity_indexes[code] = AssetIdentityIndex(
                    tenant, proposed, records=None if definition.instance else [],
                )
    # Most inventory records have no reservations. Read that fact once instead
    # of issuing a reservation query for every existing line in the preview.
    existing_type_ids = [index.asset_type_id for index in plan.identity_indexes.values() if index.entries]
    reserved_assets = set()
    if existing_type_ids:
        from .usage_models import SharedUsageRequest
        reserved_assets = set(SharedUsageRequest.objects.filter(
            asset__tenant=tenant, asset__asset_type_id__in=existing_type_ids,
            status__in=('approved', 'active'),
        ).values_list('asset_id', flat=True))
    for sheet, kind, records in parsed:
        if kind != 'inventory':
            continue
        for number, values, errors, headers, cells in records:
            code = _choice(values.get('catalog_code'))
            inventory_code = _text(values.get('inventory_code'))
            definition = get_definition(code, sheet.name, number)
            if not tenant:
                errors.append('Envanter aktarımı için hedef tersaneyi seçin.')
            if not definition:
                errors.append('Katalog kodu bulunamadı. Önce ekipman türünü tanımlayın.')
                transient = None
            else:
                transient = AssetType(**{**definition.values, 'schema': definition.schema})
                if definition.instance:
                    transient.pk = definition.instance.pk
            custom_data = {}
            if transient:
                suggestion, ambiguous = _suggest_mapping(headers, transient)
                fixed = _header_map(INVENTORY_HEADERS)
                chosen = {header: decisions['column_mapping'].get(header, suggestion.get(header)) for header in headers
                          if normalized(header) not in fixed}
                chosen_values = [key for key in chosen.values() if key]
                if len(chosen_values) != len(set(chosen_values)):
                    errors.append('Bir alan birden fazla sütunla eşleşiyor. Sütun eşleştirmesini düzeltin.')
                fields = {item['key']: item for item in transient.schema or []}
                for header, cell in zip(headers, cells):
                    if normalized(header) in fixed or is_blank(cell.value):
                        continue
                    key = chosen.get(header)
                    if not key or key not in fields:
                        errors.append(f'{header or "Başlıksız sütun"}: alan tanınmadı. Eşleştirin veya boş bırakın.')
                        continue
                    if header in ambiguous and header not in decisions['column_mapping']:
                        errors.append(f'{header}: birden fazla alanla eşleşiyor; elle seçim gerekiyor.')
                        continue
                    try:
                        custom_data[key] = import_field_value(cell.value, fields[key]['type'],
                            stock_quantity=(transient.tracking_mode == 'stock'
                                            and key == schema_role_key(transient.schema, 'quantity')),
                            identifier=key == schema_role_key(transient.schema, 'identifier'))
                    except (ValueError, TypeError, OverflowError) as exc:
                        errors.append(f'{fields[key]["label"]}: {exc}')
            instance = None
            identifier_key = schema_role_key(transient.schema, 'identifier') if transient else None
            identifier = custom_data.get(identifier_key) if identifier_key else None
            if inventory_code and len(inventory_code) > 160:
                errors.append('Envanter kodu en fazla 160 karakter olabilir.')
            if any(ord(character) < 32 or ord(character) == 127 for character in inventory_code):
                errors.append('Envanter kodunda satır sonu veya kontrol karakteri kullanmayın.')
            if not inventory_code and is_blank(identifier):
                errors.append('Envanter kodu veya türün benzersiz eşleştirme alanı gerekiyor; tekrar yüklemede çift kayıt oluşmamalı.')
            if tenant and definition and definition.instance:
                matched = plan.identity_indexes[code].matching(inventory_code=inventory_code, identifier=identifier)
                if len(matched) > 1:
                    errors.append('Envanter kodu birden fazla mevcut kayıtla eşleşiyor. Kayıtları elle ayırın.')
                elif matched:
                    instance = matched[0]
                    if inventory_code and instance.inventory_code and instance.inventory_code != inventory_code:
                        errors.append('Bu ekipman farklı envanter koduyla kayıtlı. Mevcut kodu kullanın.')
                    inventory_code = inventory_code or instance.inventory_code
                    custom_data = {**instance.custom_data, **custom_data}
            if transient:
                try:
                    custom_data = validate_custom_data(transient.schema, custom_data, transient.tracking_mode)
                except ValidationError as exc:
                    errors += _errors(exc.detail)
                if instance and instance.pk in reserved_assets:
                    from .usage import validate_inventory_usage_change
                    # Preview uses the proposed schema without writing it. The
                    # atomic commit repeats this check through AssetSerializer.
                    instance.asset_type = transient
                    try:
                        validate_inventory_usage_change(instance, custom_data=custom_data)
                    except ValidationError as exc:
                        errors += _errors(exc.detail)
            field = identifier_definition(transient.schema) if transient else None
            token = identifier_token(field, identifier)
            identity = (code, ('inventory_code', inventory_code) if inventory_code else token)
            if identity in seen_codes:
                errors.append('Aynı ekipman dosyada birden fazla kez var. Adetler otomatik toplanmaz.')
                seen_codes[identity].errors.append('Aynı ekipman dosyada birden fazla kez var. Adetler otomatik toplanmaz.')
            line = InventoryLine(sheet.name, number, code, inventory_code, custom_data, instance, errors,
                                 'update' if instance else 'create')
            if not is_blank(identifier):
                identifier_identity = (code, token)
                if identifier_identity in seen_identifiers:
                    message = 'Benzersiz eşleştirme değeri dosyada birden fazla ekipmanda kullanılmış. Kodları ayırın.'
                    errors.append(message)
                    seen_identifiers[identifier_identity].errors.append(message)
                seen_identifiers[identifier_identity] = line
            seen_codes[identity] = line
            plan.inventory.append(line)
            plan.rows.append({'sheet': sheet.name, 'row': number, 'kind': 'asset', 'catalog_code': code,
                              'name': inventory_code, 'operation': 'error' if errors else line.operation, 'errors': errors})


def preview_identity(content, decisions, tenant, user):
    return {'file': hashlib.sha256(content).hexdigest(), 'decisions': decisions,
            'tenant': str(tenant.pk) if tenant else None, 'user': str(user.pk)}


def commit_workbook(sheets, decisions, tenant, request, preview):
    """Hold inventory rows before definitions, matching ordinary inventory writes."""
    initial_plan = build_plan(sheets, decisions, tenant, request)
    existing_ids = [line.instance.pk for line in initial_plan.inventory if line.instance]
    try:
        with transaction.atomic():
            if existing_ids:
                list(Asset.objects.filter(tenant=tenant, pk__in=existing_ids).select_for_update()
                     .order_by('pk').values_list('pk', flat=True))
            list(AssetType.objects.select_for_update().order_by('pk').values_list('pk', flat=True))
            plan = build_plan(sheets, decisions, tenant, request)
            if plan.fingerprint != preview.get('revision'):
                raise WorkbookConflict('Katalog veya envanter önizlemeden sonra değişti. Yeniden önizleyin; hiçbir kayıt kaydedilmedi.')
            if not plan.response()['can_commit']:
                raise ValidationError({'detail': 'Dosyada karar veya düzeltme gerekiyor. Hiçbir kayıt kaydedilmedi.',
                                       'errors': plan.response()['errors']})
            for definition in plan.definitions.values():
                if definition.operation in ('create', 'update'):
                    definition.instance = definition.serializer.save()
                if definition.code in plan.identity_indexes:
                    plan.identity_indexes[definition.code].asset_type_id = str(definition.instance.pk)
            sharing_paused = 0
            for line in plan.inventory:
                definition = plan.definitions[line.code]
                data = {'tenant': str(tenant.pk), 'asset_type': str(definition.instance.pk),
                        'inventory_code': line.inventory_code, 'custom_data': line.custom_data}
                identity_index = plan.identity_indexes[line.code]
                serializer = AssetSerializer(line.instance, data=data, partial=bool(line.instance), context={
                    'request': request, 'asset_identity_index': identity_index,
                })
                serializer.is_valid(raise_exception=True)
                saved = serializer.save()
                identity_index.add(saved)
                sharing_paused += bool(getattr(serializer, 'sharing_paused', False))
            summary = plan.response()['summary']
            summary['sharing_paused_count'] = sharing_paused
            return summary
    except IntegrityError as exc:
        raise WorkbookConflict('Eşzamanlı kayıt değişikliği oluştu. Yeniden önizleyin; hiçbir kayıt kaydedilmedi.') from exc


class WorkbookConflict(Exception):
    """An inspected database state changed before atomic commit."""


def signed_preview(identity, revision):
    return signing.dumps({**identity, 'revision': revision}, salt=SALT, compress=True)


def verify_preview(token, identity):
    try:
        preview = signing.loads(token or '', salt=SALT, max_age=1800)
    except (signing.BadSignature, TypeError) as exc:
        raise ValidationError({'detail': 'Önizleme eksik veya süresi doldu. Dosyayı yeniden önizleyin.'}) from exc
    if any(preview.get(key) != value for key, value in identity.items()):
        raise ValidationError({'detail': 'Dosya, tersane veya inceleme tercihleri değişti. Yeniden önizleyin.'})
    return preview
