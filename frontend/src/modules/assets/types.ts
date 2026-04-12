// Asset Types for dynamic asset management

export interface SchemaField {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'email' | 'phone';
    required?: boolean;
    options?: string[]; // For select type
    default?: string | number | boolean;
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
