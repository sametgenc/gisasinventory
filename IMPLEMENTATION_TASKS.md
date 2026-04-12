# GİSAŞ Platform - Implementation Tasks

> Öncelik sırası: Backend Data Model → API → Frontend UI  
> Her phase sonunda test edilebilir bir milestone hedeflenir.

---

## Phase 1: Multi-Tenancy Foundation

### 1.1 Backend - Tenant Model
- [ ] `tenants` app oluştur
- [ ] `Tenant` model: `id, name, slug, created_at`
- [ ] `User` modeline `tenant_id` FK ekle
- [ ] `TenantMiddleware`: request'e tenant ekle
- [ ] `TenantScopedManager`: queryset'leri tenant'a göre filtrele
- [ ] Admin panelde tenant yönetimi

### 1.2 Backend - Role & Permissions
- [ ] `Role` enum: `platform_admin, tenant_admin, tenant_user`
- [ ] `User.role` field ekle
- [ ] `IsPlatformAdmin`, `IsTenantAdmin` permission classes
- [ ] `TenantPermissionMixin` for views

### 1.3 API - Tenant Endpoints
- [ ] `GET /api/tenants/` (platform admin only)
- [ ] `POST /api/tenants/` (platform admin only)
- [ ] `GET /api/tenants/current/` (current user's tenant)

---

## Phase 2: Dynamic Asset Types & Schema

### 2.1 Backend - Asset Type Models
- [ ] `asset_types` app oluştur
- [ ] `AssetType` model: `name_i18n, description_i18n, is_active, default_shared_policy`
- [ ] `AssetTypeSchemaVersion` model: `asset_type_id, version, created_at`
- [ ] `AssetTypeField` model:
  - `schema_version_id, key, label_i18n, data_type`
  - `choice_options (JSONB), validation_rules (JSONB)`
  - `help_text_i18n, placeholder_i18n, display_order`
- [ ] Schema versioning logic: yeni version oluşturma

### 2.2 Backend - i18n JSON Field
- [ ] `I18nJSONField` custom field (validate TR/EN structure)
- [ ] Serializer mixin for i18n output

### 2.3 API - Asset Type Endpoints
- [ ] `GET /api/asset-types/` - list all types
- [ ] `POST /api/asset-types/` - create (platform admin)
- [ ] `GET /api/asset-types/{id}/` - detail
- [ ] `GET /api/asset-types/{id}/schema/` - current schema + fields
- [ ] `POST /api/asset-types/{id}/schema/` - new schema version

---

## Phase 3: Assets (Tenant-Scoped)

### 3.1 Backend - Asset Model
- [ ] `assets` app oluştur
- [ ] `Asset` model:
  - `tenant_id, asset_type_id, schema_version`
  - `asset_code, title_i18n, description, location, status`
  - `dynamic_values (JSONB)`
  - `created_at, updated_at, created_by`
- [ ] JSONB GIN index for `dynamic_values`
- [ ] Unique constraint: `(tenant_id, asset_code)`

### 3.2 Backend - Schema Validation
- [ ] `validate_dynamic_values(schema, data)` utility
- [ ] Field type validation (text, number, boolean, date, choice)
- [ ] Required field validation
- [ ] Choice value validation

### 3.3 API - Asset Endpoints
- [ ] `GET /api/assets/` - list (tenant-scoped)
- [ ] `POST /api/assets/` - create with schema validation
- [ ] `GET /api/assets/{id}/` - detail
- [ ] `PATCH /api/assets/{id}/` - update with validation
- [ ] `DELETE /api/assets/{id}/` - soft delete

---

## Phase 4: Sharing & Requests

### 4.1 Backend - Sharing Models
- [ ] `AssetShare` model: `asset_id, visibility, shared_fields_mask`
- [ ] `UsageRequest` model:
  - `requester_tenant_id, asset_id`
  - `desired_start, desired_end, message, status`
- [ ] `Reservation` model:
  - `request_id, actual_start, actual_end, status`

### 4.2 API - Sharing Endpoints
- [ ] `POST /api/assets/{id}/share/` - share asset
- [ ] `DELETE /api/assets/{id}/share/` - unshare
- [ ] `GET /api/shared-assets/` - cross-tenant discovery
- [ ] `POST /api/shared-assets/{id}/request/` - request usage
- [ ] `GET /api/requests/` - list requests (incoming/outgoing)
- [ ] `POST /api/requests/{id}/approve/`
- [ ] `POST /api/requests/{id}/deny/`
- [ ] `GET /api/reservations/`

---

## Phase 5: Audit & Notifications

### 5.1 Backend - Audit Log
- [ ] `AuditLog` model: `action, table_name, record_id, old_data, new_data, user_id, timestamp`
- [ ] `AuditMixin` for tracked models
- [ ] Signal-based logging for create/update/delete

### 5.2 Backend - i18n Notifications
- [ ] Update notification payload for i18n
- [ ] Event types: `usage_request_created, usage_request_approved, usage_request_denied`
- [ ] Tenant-scoped channels: `tenant_notifications_{tenant_id}`

---

## Phase 6: Frontend - Foundation

### 6.1 i18n Setup
- [ ] i18next kurulumu
- [ ] TR/EN translation files
- [ ] Language switcher component
- [ ] User preference persistence

### 6.2 Layout & Navigation
- [ ] Sidebar navigation (shipyard theme)
- [ ] Tenant context display
- [ ] Role-based menu items

### 6.3 UI Components
- [ ] DataTable component (filterable, sortable)
- [ ] DynamicForm component (schema-driven)
- [ ] StatusBadge component
- [ ] i18n Label component

---

## Phase 7: Frontend - Asset Management

### 7.1 Asset Type Catalog
- [ ] Asset type list page
- [ ] Schema viewer (fields, data types, i18n labels)

### 7.2 My Assets
- [ ] Asset list with filters (type, status, location)
- [ ] Asset create (dynamic form from schema)
- [ ] Asset edit
- [ ] Asset detail view

### 7.3 Dynamic Form Renderer
- [ ] Field type → widget mapping:
  - text → Input
  - number → NumberInput
  - boolean → Switch
  - date → DatePicker
  - choice_single → Select
  - choice_multi → MultiSelect
- [ ] Validation error display
- [ ] i18n label rendering

---

## Phase 8: Frontend - Sharing & Discovery

### 8.1 Shared Assets Discovery
- [ ] Cross-tenant asset browser
- [ ] Visibility filters
- [ ] Masked field display

### 8.2 Request Flow
- [ ] Request form (dates, purpose)
- [ ] Request status timeline
- [ ] Incoming requests list (for approvers)
- [ ] Approve/Deny actions

### 8.3 Reservations
- [ ] Reservation list/calendar view
- [ ] Status management

---

## Phase 9: Polish & Production

### 9.1 Performance
- [ ] Redis caching for schemas
- [ ] Pagination optimization
- [ ] JSONB index tuning

### 9.2 Security
- [ ] Tenant isolation audit
- [ ] Permission edge cases

### 9.3 Production Deployment
- [ ] docker-compose.prod.yml güncelleme
- [ ] Environment variables for production
- [ ] SSL configuration

---

## Quick Reference

| Phase | Focus | Estimated Effort |
|-------|-------|------------------|
| 1 | Multi-Tenancy | 2-3 days |
| 2 | Asset Types & Schema | 3-4 days |
| 3 | Assets (CRUD) | 2-3 days |
| 4 | Sharing & Requests | 3-4 days |
| 5 | Audit & Notifications | 1-2 days |
| 6 | Frontend Foundation | 2-3 days |
| 7 | Frontend Assets | 3-4 days |
| 8 | Frontend Sharing | 2-3 days |
| 9 | Polish & Prod | 2-3 days |

**Total Estimate**: ~20-29 days

---

## Related Documents

- [Product Requirements](./PRODUCT_REQUIREMENTS.md)
- [Project Architecture](./PROJECT_ARCHITECTURE.md)
