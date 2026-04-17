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
}

export interface RawImportResult {
    message: string;
    created_count: number;
    updated_count: number;
    skipped_count: number;
    error_count: number;
    errors: { row: number; errors: string[] }[];
}

export interface AssetType {
    id: string;
    name: string;
    description: string;
    schema: SchemaField[];
    created_at: string;
    updated_at: string;
    created_by: number | null;
}

export interface AssetTypeCreateInput {
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
}

export interface AssetCreateInput {
    asset_type: string;
    tenant?: number;
    custom_data: Record<string, unknown>;
    assigned_to?: number | null;
}
