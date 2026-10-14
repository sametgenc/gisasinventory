// Asset Types for dynamic asset management

export interface SchemaField {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'email' | 'phone';
    required?: boolean;
    options?: string[]; // For select type
    default?: string | number | boolean;
    is_unique_key?: boolean; // Marks this field as the uniqueness index for deduplication during import
}

/** Maps Excel column header → schema field key (null = ignore the column) */
export type ColumnMapping = Record<string, string | null>

export interface DetectedTemplate {
    asset_type_id: string;
    asset_type_name: string;
}

export interface ImportPreview {
    headers: string[];
    preview_rows: string[][];
    total_rows: number;
    detected_template?: DetectedTemplate | null;
    preview_row_numbers?: number[];
    analysis?: ImportAnalysis;
}

export interface ImportAnalysisIssue {
    code: string;
    fields?: string[];
    headers?: string[];
}

export interface ImportAnalysisRow {
    row_number: number;
    reason: string;
    label?: string;
    fields?: string[];
    message?: string;
}

export interface ImportTypeSuggestion {
    asset_type_id: string;
    asset_type_name: string;
    confidence: 'high' | 'review';
    mapping: ColumnMapping;
    matched_fields: number;
}

export interface ImportAnalysis {
    version: 1;
    sheet_name: string;
    sheet_names: string[];
    header_row: number;
    data_start_row: number;
    layout_confidence: 'high' | 'review';
    suggested_asset_type_id: string | null;
    analysis_asset_type_id: string | null;
    analysis_mapping: ColumnMapping;
    suggested_mapping: ColumnMapping;
    type_suggestions: ImportTypeSuggestion[];
    counts: { data: number; skipped: number; review: number; ready: number };
    blockers: ImportAnalysisIssue[];
    warnings: ImportAnalysisIssue[];
    skipped_rows: ImportAnalysisRow[];
    review_rows: ImportAnalysisRow[];
    review_row_numbers: number[];
}

export interface ImportPreviewOptions {
    headerRow?: number;
    sheetName?: string;
    assetTypeId?: string;
    mapping?: ColumnMapping;
    skipRows?: string[];
}

export interface ImportSafetyOptions {
    headerRow?: number;
    dataStartRow?: number;
    skipRows?: string[];
    mapping?: ColumnMapping;
    sheetName?: string;
    excludeRowNumbers?: number[];
    requireReview?: boolean;
}

export interface RawImportResult {
    message: string;
    created_count: number;
    updated_count: number;
    skipped_count: number;
    error_count: number;
    errors: { row: number; errors: string[] }[];
}

export interface CatalogMetadata {
    catalog_code?: string | null;
    category_code?: string;
    sharing_class?: '' | 'A' | 'B' | 'C';
    exclusion_reason?: string;
}

export interface AssetType extends CatalogMetadata {
    tracking_mode?: 'individual' | 'stock';
    sharing_excluded?: boolean;
    id: string;
    name: string;
    description: string;
    schema: SchemaField[];
    created_at: string;
    updated_at: string;
    created_by: number | null;
}

export interface AssetTypeCreateInput extends CatalogMetadata {
    tracking_mode?: 'individual' | 'stock';
    name: string;
    description?: string;
    schema: SchemaField[];
}

export interface Asset {
    id: string;
    tenant: number;
    tenant_name: string;
    asset_type: string;
    asset_type_name: string;
    custom_data: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    created_by: number | null;
    assigned_to: number | null;
    assigned_to_username: string | null;
    is_shared?: boolean;
    is_listed_for_sharing?: boolean;
    sharing_note?: string;
    shared_at?: string | null;
}

/** Explicitly published information; private equipment data is never included. */
export interface SharedEquipment {
    id: string;
    tenant: number;
    tenant_name: string;
    asset_type_name: string;
    category_code: string;
    catalog_code: string | null;
    sharing_note: string;
    shared_at: string | null;
}

export interface SharedEquipmentFilters {
    search?: string;
    category_code?: string;
    tenant?: number;
    page?: number;
}

export interface SharedEquipmentPage {
    count: number;
    next: string | null;
    previous: string | null;
    results: SharedEquipment[];
}

export interface AssetCreateInput {
    asset_type: string;
    tenant?: number;
    custom_data: Record<string, unknown>;
    assigned_to?: number | null;
}
