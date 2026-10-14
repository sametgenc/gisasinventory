import api from '@/api/client'

export interface WorkbookSummary {
    types_created: number; types_updated: number; assets_created: number; assets_updated: number; skipped_rows_count: number
}
export interface WorkbookRow {
    changes?: Record<string, { before: string; after: string }>
    current_values?: Record<string, unknown>
    sheet: string; row: number; kind: string; operation: string; catalog_code?: string; name?: string; errors: string[]
}
export interface WorkbookPreview {
    types?: { catalog_code: string; name: string; impact?: { affected_asset_count: number; affected_tenant_count: number } }[]
    preview_token: string | null
    summary: WorkbookSummary
    rows: WorkbookRow[]
    notices: string[]
    action_required: { code: string; sheet: string; row: number; message: string; choices?: string[] }[]
    errors: { sheet?: string; row?: number; errors?: string[]; message?: string }[]
    can_commit: boolean
}
export interface WorkbookDecisions { classifications: Record<string, string> }

function upload(file: File, tenant: number | undefined, decisions: WorkbookDecisions, token?: string) {
    const body = new FormData()
    body.append('file', file)
    body.append('decisions', JSON.stringify(decisions))
    if (tenant) body.append('tenant', String(tenant))
    if (token) body.append('preview_token', token)
    return body
}

export const workbookApi = {
    preview: async (file: File, tenant: number | undefined, decisions: WorkbookDecisions): Promise<WorkbookPreview> =>
        (await api.post('/api/assets/workbook/preview/', upload(file, tenant, decisions))).data,
    commit: async (file: File, tenant: number | undefined, decisions: WorkbookDecisions, token: string): Promise<{ summary: WorkbookSummary; detail: string }> =>
        (await api.post('/api/assets/workbook/commit/', upload(file, tenant, decisions, token))).data,
    template: async (): Promise<Blob> => (await api.get('/api/assets/workbook/template/', { responseType: 'blob' })).data,
}
