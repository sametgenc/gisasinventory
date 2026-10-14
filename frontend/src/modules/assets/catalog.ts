import api from '@/api/client'
import type { CatalogMetadata } from './types'

export const categoryCodes = 'ABCDEFGHIJKLM'.split('')
export type CatalogMode = 'create' | 'update'
export type CatalogOperation = 'create' | 'update' | 'skip' | 'error'
export type CatalogSummary = Record<CatalogOperation, number>
export type CatalogValues = CatalogMetadata & { name: string; description: string }
export interface CatalogRow {
    row: number
    values: CatalogValues
    current_values?: CatalogValues | null
    changes?: Record<string, { before: string | null; after: string | null }>
    skip_reason?: 'exists' | 'unchanged' | null
    errors: string[]
    operation: CatalogOperation
    sharing_excluded: boolean
}
export interface CatalogPreview {
    rows: CatalogRow[]
    summary: CatalogSummary
    preview_token: string | null
}

function upload(file: File, mode: CatalogMode, token?: string) {
    const body = new FormData()
    body.append('file', file)
    body.append('mode', mode)
    if (token) body.append('preview_token', token)
    return body
}

export const catalogApi = {
    template: async (): Promise<Blob> => (await api.get('/api/assets/types/catalog_template/', { responseType: 'blob' })).data,
    preview: async (file: File, mode: CatalogMode): Promise<CatalogPreview> =>
        (await api.post('/api/assets/types/catalog_preview/', upload(file, mode))).data,
    import: async (file: File, mode: CatalogMode, token: string): Promise<{ summary: CatalogSummary }> =>
        (await api.post('/api/assets/types/catalog_import/', upload(file, mode, token))).data,
}
