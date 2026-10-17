from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.http import HttpResponse
from django.utils.http import content_disposition_header
from django.conf import settings
from .models import AssetType, Asset
from .serializers import AssetTypeSerializer, AssetSerializer, AssetSharingSerializer, SharedAssetSerializer
from .inventory_import import analyze_inventory, import_options, InventoryImportError
from .validation import schema_role_key
from .identity import AssetIdentityIndex
from apps.tenants.permissions import IsActiveTenantUser, IsTenantMember, is_global_admin
from rest_framework.exceptions import ValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from io import BytesIO
import json
import re
from django.db.models.deletion import ProtectedError
from django.db import transaction
from django.db.models import Q
from .catalog_import import CatalogImportMixin
from apps.notifications.services import notify_import_result, notify_sharing_changed


def equipment_sheet_title(name):
    """Keep an equipment name valid for Excel and reserve import metadata names."""
    title = re.sub(r'[\\*?:/\[\]]', ' ', name).strip().strip("'").strip()
    title = title[:31].strip().strip("'").strip()
    return title if title and title.casefold() != '_mapping' else 'Ekipmanlar'


def incomplete_inventory_query():
    """Filter missing values without rewriting inventory when a schema changes."""
    result = Q(pk__in=[])
    for type_id, schema in AssetType.objects.values_list('pk', 'schema'):
        missing = Q(pk__in=[])
        for field in schema or []:
            if field.get('required') is True:
                key = f"custom_data__{field['key']}"
                missing |= (Q(**{f'{key}__isnull': True}) | Q(**{key: None})
                            | Q(**{f'{key}__regex': r'^\s*$'}))
        result |= Q(asset_type_id=type_id) & missing
    return result


class AssetTypeViewSet(CatalogImportMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing Asset Types (Schemas).
    AssetTypes are global - any authenticated user can view them.
    Only superusers/admins can create/edit/delete.
    """
    serializer_class = AssetTypeSerializer
    permission_classes = [permissions.IsAuthenticated, IsActiveTenantUser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']

    def get_queryset(self):
        # All authenticated users can see all asset types (they're global)
        return AssetType.objects.all()

    def create(self, request, *args, **kwargs):
        # Only superusers can create global asset types
        if not is_global_admin(request.user):
            return Response(
                {"detail": "Only platform administrators can create asset types."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not is_global_admin(request.user):
            return Response(
                {"detail": "Only platform administrators can update asset types."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def schema_impact(self, request, pk=None):
        if not is_global_admin(request.user):
            return Response({'detail': 'Bu işlemi platform yöneticisi yapabilir.'}, status=403)
        asset_type = self.get_object()
        schema = self.get_serializer().validate_schema(request.data.get('schema'))
        from .schema_evolution import schema_impact
        return Response(schema_impact(asset_type, schema))

    def destroy(self, request, *args, **kwargs):
        if not is_global_admin(request.user):
            return Response(
                {"detail": "Only platform administrators can delete asset types."},
                status=status.HTTP_403_FORBIDDEN
            )
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'detail': 'Bu tipe bağlı ekipmanlar var. Önce ekipmanları başka bir tipe taşıyın.'}, status=409)

    @action(detail=True, methods=['get'])
    def export_template(self, request, pk=None):
        """
        Generate Excel template for bulk asset import.
        Uses field labels (not keys) for user-friendly headers.
        """
        asset_type = self.get_object()
        schema = asset_type.schema or []
        
        # Create workbook
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = equipment_sheet_title(asset_type.name)
        
        # Header styles
        header_font = Font(bold=True, color="FFFFFF", size=12)
        header_fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
        header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        thin_border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        
        # Info row styles
        info_font = Font(italic=True, color="666666", size=10)
        info_fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")
        
        # Build headers and info from schema
        headers = []
        info_row = []
        field_mapping = {}  # Store label -> key mapping in hidden sheet
        
        for field in schema:
            label = field.get('label', field.get('key', 'Alan'))
            key = field.get('key', '')
            field_type = field.get('type', 'text')
            required = field.get('required', False)
            options = field.get('options', [])
            
            # Add required marker
            if required:
                label = f"{label} *"
            
            headers.append(label)
            field_mapping[label.replace(' *', '')] = key
            
            # Build info text
            type_names = {
                'text': 'Metin',
                'number': 'Sayı',
                'date': 'Tarih (YYYY-AA-GG)',
                'select': f"Seçenek: {', '.join(options)}" if options else 'Seçenek',
                'checkbox': 'Evet/Hayır',
                'email': 'E-posta',
                'phone': 'Telefon'
            }
            info_text = type_names.get(field_type, field_type)
            if required:
                info_text = f"[Zorunlu] {info_text}"
            info_row.append(info_text)
        
        # Write headers (Row 1)
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.data_type = 's'
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            cell.border = thin_border
            # Auto-adjust column width
            ws.column_dimensions[get_column_letter(col_idx)].width = max(len(header) + 5, 15)
        
        # Write info row (Row 2)
        for col_idx, info in enumerate(info_row, 1):
            cell = ws.cell(row=2, column=col_idx, value=info)
            cell.font = info_font
            cell.fill = info_fill
            cell.alignment = Alignment(horizontal="center")
            cell.border = thin_border
        
        # Add example row (Row 3)
        example_fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
        for col_idx, field in enumerate(schema, 1):
            field_type = field.get('type', 'text')
            options = field.get('options', [])
            
            examples = {
                'text': 'Örnek metin',
                'number': '100',
                'date': '2024-01-15',
                'select': options[0] if options else 'Seçenek1',
                'checkbox': 'Evet',
                'email': 'ornek@email.com',
                'phone': '+90 555 123 45 67'
            }
            cell = ws.cell(row=3, column=col_idx, value=examples.get(field_type, ''))
            if isinstance(cell.value, str):
                cell.data_type = 's'
            cell.fill = example_fill
            cell.alignment = Alignment(horizontal="center")
        
        # Store field mapping in hidden sheet for import reference
        mapping_ws = wb.create_sheet("_mapping")
        mapping_ws.sheet_state = 'hidden'
        mapping_ws.cell(row=1, column=1, value=json.dumps(field_mapping, ensure_ascii=False))
        mapping_ws.cell(row=2, column=1, value=str(asset_type.id))
        
        # Freeze header rows
        ws.freeze_panes = 'A4'
        
        # Save to buffer
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        # Create response
        filename = f"{ws.title.replace(' ', '_')}_sablonu.xlsx"
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = content_disposition_header(True, filename)
        
        return response


class IsActiveAssetUser(permissions.BasePermission):
    """Inactive accounts cannot use sharing, including forced authentication."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_active


class SharedAssetPagination(PageNumberPagination):
    page_size = 24


class AssetViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing Assets.
    Assets are tenant-specific - users only see their tenant's assets.
    """
    serializer_class = AssetSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['asset_type__name']
    ordering_fields = ['created_at', 'updated_at']

    def get_queryset(self):
        user = self.request.user
        
        # Superusers can see all assets (with optional tenant filter)
        if is_global_admin(user):
            queryset = Asset.objects.all()
            tenant_id = self.request.query_params.get('tenant')
            if tenant_id:
                try:
                    queryset = queryset.filter(tenant_id=tenant_id)
                except (DjangoValidationError, ValueError, TypeError) as exc:
                    raise ValidationError({'tenant': 'Invalid tenant filter.'}) from exc
        else:
            # Regular users see only their tenant's assets
            if not user.tenant:
                return Asset.objects.none()
            queryset = Asset.objects.filter(tenant=user.tenant)
        
        # Filter by asset_type
        asset_type_id = self.request.query_params.get('asset_type')
        if asset_type_id:
            try:
                queryset = queryset.filter(asset_type_id=asset_type_id)
            except (DjangoValidationError, ValueError, TypeError) as exc:
                raise ValidationError({'asset_type': 'Invalid asset type filter.'}) from exc
        
        # Filter by assigned_to
        assigned_to_id = self.request.query_params.get('assigned_to')
        if assigned_to_id:
            try:
                queryset = queryset.filter(assigned_to_id=assigned_to_id)
            except (DjangoValidationError, ValueError, TypeError) as exc:
                raise ValidationError({'assigned_to': 'Invalid assignee filter.'}) from exc
            
        if self.request.query_params.get('needs_update') == 'true':
            queryset = queryset.filter(incomplete_inventory_query())
        queryset = queryset.select_related('tenant', 'asset_type', 'assigned_to')
        if self.action in ('sharing', 'destroy'):
            queryset = queryset.select_for_update(of=('self',))
        return queryset

    def destroy(self, request, *args, **kwargs):
        # A concurrent owner transfer must finish before delete checks membership.
        with transaction.atomic():
            from .usage import validate_inventory_usage_delete
            validate_inventory_usage_delete(self.get_object())
            return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'])
    def batch_create(self, request):
        from .batch_create import BatchCreateError, create_batch

        try:
            return Response(create_batch(request), status=status.HTTP_201_CREATED)
        except BatchCreateError as exc:
            return Response(exc.response, status=exc.status)

    @action(detail=False, methods=['get'], permission_classes=[
        permissions.IsAuthenticated, IsTenantMember, IsActiveAssetUser,
    ], pagination_class=SharedAssetPagination,
       search_fields=['asset_type__name', 'tenant__name', 'sharing_title', 'sharing_capacity', 'sharing_note'])
    def shared(self, request):
        """Discover owner-published items without crossing private inventory access."""
        if not getattr(settings, 'CROSS_TENANT_SHARING_ENABLED', False):
            return Response({'detail': 'Cross-shipyard sharing is disabled.'}, status=status.HTTP_403_FORBIDDEN)
        queryset = Asset.objects.filter(is_shared=True, tenant__is_active=True).exclude(
            asset_type__category_code='K',
        ).exclude(asset_type__sharing_class='C').exclude(
            asset_type__exclusion_reason__regex=r'\S',
        ).select_related('tenant', 'asset_type').order_by('-shared_at', 'id')
        queryset = queryset.exclude(incomplete_inventory_query())
        for parameter, field in [('tenant', 'tenant_id'), ('asset_type', 'asset_type_id'),
                                 ('category_code', 'asset_type__category_code')]:
            value = request.query_params.get(parameter)
            if value:
                try:
                    queryset = queryset.filter(**{field: value})
                except (DjangoValidationError, ValueError):
                    return Response({'detail': 'Geçersiz liste filtresi.'}, status=status.HTTP_400_BAD_REQUEST)
        queryset = filters.SearchFilter().filter_queryset(request, queryset, self)
        page = self.paginate_queryset(queryset)
        serializer = SharedAssetSerializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'], permission_classes=[
        permissions.IsAuthenticated, IsTenantMember, IsActiveAssetUser,
    ])
    def sharing(self, request, pk=None):
        """Shipyard managers publish only their own assets; admins retain oversight."""
        if not getattr(settings, 'CROSS_TENANT_SHARING_ENABLED', False):
            return Response({'detail': 'Cross-shipyard sharing is disabled.'}, status=status.HTTP_403_FORBIDDEN)
        user = request.user
        if not (is_global_admin(user) or user.is_tenant_admin):
            return Response({'detail': 'Paylaşım kararını tersane yöneticisi verebilir.'},
                            status=status.HTTP_403_FORBIDDEN)
        with transaction.atomic():
            asset = self.get_object()
            previous_state = asset.is_shared
            serializer = AssetSharingSerializer(asset, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            asset = serializer.save()
            notify_sharing_changed(asset, previous_state)
            return Response(self.get_serializer(asset).data)

    @action(detail=False, methods=['post'])
    def bulk_import(self, request):
        """Import application templates through the shared, reviewed row plan."""
        return self._import_inventory(request, template_mode=True)

    @action(detail=False, methods=['post'])
    def preview_import(self, request):
        """Suggest a sheet, header, existing type and mapping without writing."""
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'Dosya gerekli.'}, status=400)
        asset_type = None
        if request.data.get('asset_type'):
            try:
                asset_type = AssetType.objects.get(id=request.data['asset_type'])
            except (AssetType.DoesNotExist, DjangoValidationError, ValueError):
                return Response({'detail': 'Varlık tipi bulunamadı.'}, status=404)
        try:
            plan = analyze_inventory(file, AssetType.objects.all(), asset_type=asset_type,
                                     **import_options(request.data))
            return Response(plan.preview)
        except InventoryImportError as exc:
            return Response({'detail': str(exc)}, status=400)
        except Exception as exc:
            return Response({'detail': f'Dosya okunamadı: {exc}'}, status=400)

    @action(detail=False, methods=['post'])
    def raw_import(self, request):
        """Import an arbitrary inventory using the same layout shown in preview."""
        return self._import_inventory(request, template_mode=False)

    def _import_inventory(self, request, *, template_mode):
        file = request.FILES.get('file')
        asset_type_id = request.data.get('asset_type')
        if not file:
            return Response({'detail': 'Dosya gerekli.'}, status=400)
        if not asset_type_id:
            return Response({'detail': 'Varlık tipi gerekli.'}, status=400)
        try:
            asset_type = AssetType.objects.get(id=asset_type_id)
        except (AssetType.DoesNotExist, DjangoValidationError, ValueError):
            return Response({'detail': 'Varlık tipi bulunamadı.'}, status=404)
        user = request.user
        if is_global_admin(user):
            tenant_id = request.data.get('tenant')
            if not tenant_id:
                return Response({'detail': 'Superuser için tersane seçimi gerekli.'}, status=400)
            from apps.tenants.models import Tenant
            try:
                tenant = Tenant.objects.get(id=tenant_id)
            except (Tenant.DoesNotExist, DjangoValidationError, ValueError):
                return Response({'detail': 'Tersane bulunamadı.'}, status=404)
        else:
            tenant = user.tenant
            if not tenant:
                return Response({'detail': 'Kullanıcının tersanesi yok.'}, status=400)
            submitted_tenant = request.data.get('tenant')
            if submitted_tenant not in (None, '') and str(submitted_tenant) != str(tenant.pk):
                return Response({'detail': 'You can only import into your own shipyard.'}, status=400)
        try:
            options = import_options(request.data)
            if not template_mode and options['mapping'] is None:
                return Response({'detail': 'Sütun eşleştirmesi gerekli.'}, status=400)
            if template_mode and not options['require_review']:
                # Legacy template callers sometimes send a raw-file mapping;
                # this endpoint has always used the template's own headers.
                options['mapping'] = None
                options['header_row'] = 1
            plan = analyze_inventory(file, AssetType.objects.all(), asset_type=asset_type,
                                     template_mode=template_mode, **options)
            analysis = plan.analysis
            # New UI requests a whole-file review before any per-row writes.
            # Existing API callers retain their partial-success import contract.
            legacy_mapping_errors = {'duplicate_headers', 'invalid_mapping', 'no_mapped_columns', 'ambiguous_mapping'}
            mapping_blocked = any(item['code'] in legacy_mapping_errors for item in analysis['blockers'])
            needs_review = options['require_review'] and (analysis['blockers'] or analysis['review_row_numbers'])
            if mapping_blocked or needs_review:
                return Response({
                    'detail': 'Aktarımdan önce işaretli alanları/satırları kontrol edin veya atlanacak satırları seçin.',
                    'analysis': analysis,
                }, status=400)
            unique_key_field = schema_role_key(asset_type.schema, 'identifier')
            identity_index = AssetIdentityIndex(tenant, asset_type) if unique_key_field else None
            results = {'created': 0, 'updated': 0, 'skipped': plan.skipped_count,
                       'sharing_paused': 0, 'errors': []}
            for row_number, _ in plan.rows:
                if row_number in plan.row_errors:
                    results['errors'].append({'row': row_number, 'errors': plan.row_errors[row_number]})
                    continue
                custom_data = plan.converted.get(row_number, {})
                try:
                    existing = None
                    if unique_key_field and custom_data.get(unique_key_field) not in (None, ''):
                        matches = identity_index.identifier_matches(custom_data[unique_key_field])
                        if len(matches) > 1:
                            raise ValidationError({'custom_data': {
                                unique_key_field: 'Kayıt kodu birden fazla mevcut ekipmanla eşleşiyor. Kayıtları elle ayırın.',
                            }})
                        existing = matches[0] if matches else None
                    if existing:
                        # The serializer merges these mapped values with the locked current row.
                        custom_data = {key: value for key, value in custom_data.items() if value is not None}
                    serializer = self.get_serializer(existing, data={
                        'asset_type': str(asset_type.pk), 'tenant': tenant.pk, 'custom_data': custom_data,
                    }, partial=existing is not None)
                    serializer.is_valid(raise_exception=True)
                    saved = serializer.save()
                    if identity_index is not None:
                        identity_index.add(saved)
                    if getattr(serializer, 'sharing_paused', False):
                        results['sharing_paused'] += 1
                    results['updated' if existing else 'created'] += 1
                except Exception as exc:
                    results['errors'].append({'row': row_number, 'errors': [str(exc)]})
            total = results['created'] + results['updated']
            message = f"{total} satır işlendi: {results['created']} oluşturuldu, {results['updated']} güncellendi."
            if results['skipped']:
                message += f" {results['skipped']} satır atlandı."
            if results['sharing_paused']:
                message += f" {results['sharing_paused']} paylaşım stok değiştiği için yayından kaldırıldı; paylaşım adedini kontrol edin."
            notify_import_result(user, results)
            response = {
                'message': message, 'created_count': results['created'], 'updated_count': results['updated'],
                'skipped_count': results['skipped'], 'error_count': len(results['errors']),
                'sharing_paused_count': results['sharing_paused'],
                'errors': results['errors'][:20],
            }
            if template_mode:
                response['success_count'] = total
            return Response(response)
        except InventoryImportError as exc:
            return Response({'detail': str(exc)}, status=400)
        except Exception as exc:
            return Response({'detail': f'Dosya işlenirken hata: {exc}'}, status=400)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """
        Export assets to Excel file.
        """
        asset_type_id = request.query_params.get('asset_type')
        tenant_id = request.query_params.get('tenant')
        
        if not asset_type_id:
            return Response({"detail": "Varlık tipi gerekli."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            asset_type = AssetType.objects.get(id=asset_type_id)
        except (AssetType.DoesNotExist, DjangoValidationError, ValueError):
            return Response({"detail": "Varlık tipi bulunamadı."}, status=status.HTTP_404_NOT_FOUND)
        
        # Get assets based on user permissions
        queryset = self.get_queryset().filter(asset_type=asset_type)
        
        # Apply tenant filter if provided (for superusers)
        if tenant_id and is_global_admin(request.user):
            queryset = queryset.filter(tenant_id=tenant_id)
        
        schema = asset_type.schema or []
        
        # Create workbook
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = equipment_sheet_title(asset_type.name)
        
        # Header styles
        header_font = Font(bold=True, color="FFFFFF", size=12)
        header_fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
        header_alignment = Alignment(horizontal="center", vertical="center")
        
        # Build headers
        headers = ['ID', 'Tersane', 'Oluşturulma Tarihi']
        for field in schema:
            headers.append(field.get('label', field.get('key', 'Alan')))
        
        # Write headers
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.data_type = 's'
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            ws.column_dimensions[get_column_letter(col_idx)].width = max(len(header) + 5, 15)
        
        # Write data
        for row_idx, asset in enumerate(queryset, 2):
            ws.cell(row=row_idx, column=1, value=str(asset.id)[:8]).data_type = 's'
            ws.cell(row=row_idx, column=2, value=asset.tenant.name if asset.tenant else '-').data_type = 's'
            ws.cell(row=row_idx, column=3, value=asset.created_at.strftime('%Y-%m-%d %H:%M')).data_type = 's'
            
            for col_idx, field in enumerate(schema, 4):
                key = field.get('key', '')
                value = asset.custom_data.get(key, '')
                
                if field.get('type') == 'checkbox':
                    value = 'Evet' if value else 'Hayır'
                
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                if isinstance(value, str):
                    cell.data_type = 's'
        
        # Freeze header
        ws.freeze_panes = 'A2'
        
        # Save to buffer
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        filename = f"{ws.title.replace(' ', '_')}_listesi.xlsx"
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = content_disposition_header(True, filename)
        
        return response
