import api from '@/api/client';
import type { AssetType, AssetTypeCreateInput, Asset, AssetCreateInput, ColumnMapping, ImportPreview, RawImportResult } from './types';

export interface BulkImportResult {
    message: string;
    success_count: number;
    error_count: number;
    errors: { row: number; errors: string[] }[];
}

export const assetsApi = {
    // Asset Types
    listTypes: async (): Promise<AssetType[]> => {
        const response = await api.get('/api/assets/types/');
        return response.data;
    },

    getType: async (id: string): Promise<AssetType> => {
        const response = await api.get(`/api/assets/types/${id}/`);
        return response.data;
    },

    createType: async (data: AssetTypeCreateInput): Promise<AssetType> => {
        const response = await api.post('/api/assets/types/', data);
        return response.data;
    },

    updateType: async (id: string, data: Partial<AssetTypeCreateInput>): Promise<AssetType> => {
        const response = await api.patch(`/api/assets/types/${id}/`, data);
        return response.data;
    },

    deleteType: async (id: string): Promise<void> => {
        await api.delete(`/api/assets/types/${id}/`);
    },

    // Download Excel template for bulk import
    downloadTemplate: async (assetTypeId: string): Promise<Blob> => {
        const response = await api.get(`/api/assets/types/${assetTypeId}/export_template/`, {
            responseType: 'blob'
        });
        return response.data;
    },

    // Assets
    listAssets: async (assetTypeId?: string): Promise<Asset[]> => {
        const params = assetTypeId ? { asset_type: assetTypeId } : {};
        const response = await api.get('/api/assets/items/', { params });
        return response.data;
    },

    getAsset: async (id: string): Promise<Asset> => {
        const response = await api.get(`/api/assets/items/${id}/`);
        return response.data;
    },

    createAsset: async (data: AssetCreateInput): Promise<Asset> => {
        const response = await api.post('/api/assets/items/', data);
        return response.data;
    },

    updateAsset: async (id: string, data: Partial<AssetCreateInput>): Promise<Asset> => {
        const response = await api.patch(`/api/assets/items/${id}/`, data);
        return response.data;
    },

    deleteAsset: async (id: string): Promise<void> => {
        await api.delete(`/api/assets/items/${id}/`);
    },

    // Bulk import from Excel
    bulkImport: async (file: File, assetTypeId: string, tenantId?: number): Promise<BulkImportResult> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('asset_type', assetTypeId);
        if (tenantId) {
            formData.append('tenant', String(tenantId));
        }
        const response = await api.post('/api/assets/items/bulk_import/', formData);
        return response.data;
    },

    // Preview headers and first rows from an arbitrary Excel file
    previewImport: async (file: File, headerRow = 1): Promise<ImportPreview> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('header_row', String(headerRow));
        const response = await api.post('/api/assets/items/preview_import/', formData);
        return response.data;
    },

    // Import from arbitrary Excel with column mapping (upsert by unique key)
    rawImport: async (
        file: File,
        assetTypeId: string,
        mapping: ColumnMapping,
        tenantId?: number,
        headerRow = 1,
        skipRows: string[] = [],
    ): Promise<RawImportResult> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('asset_type', assetTypeId);
        formData.append('mapping', JSON.stringify(mapping));
        formData.append('header_row', String(headerRow));
        formData.append('skip_rows', JSON.stringify(skipRows));
        if (tenantId) {
            formData.append('tenant', String(tenantId));
        }
        const response = await api.post('/api/assets/items/raw_import/', formData);
        return response.data;
    },

    // Export assets to Excel
    exportAssets: async (assetTypeId: string, tenantId?: number): Promise<Blob> => {
        const params: { asset_type: string; tenant?: string } = { asset_type: assetTypeId };
        if (tenantId) {
            params.tenant = String(tenantId);
        }
        const response = await api.get('/api/assets/items/export/', {
            params,
            responseType: 'blob'
        });
        return response.data;
    },
};

