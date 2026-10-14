import { useState, useMemo, useRef, useCallback, useEffect, useId } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    Package, Plus, Search, ArrowLeft,
    Download, Upload, FileSpreadsheet, CheckCircle, AlertCircle,
    X, KeyRound, RefreshCw, MoreHorizontal, Check, FileText,
} from 'lucide-react'
import { exportReport } from '@/utils/report'
import { useAssetTypes, useAssets, useCreateAsset, useUpdateAsset, useDeleteAsset } from '@/modules/assets'
import { assetsApi, type BulkImportResult } from '@/modules/assets/data'
import { useTenants } from '@/modules/tenants'
import { useAuth } from '@/auth/context'
import type { AssetType, SchemaField, Asset, ColumnMapping, ImportPreview, RawImportResult } from '@/modules/assets'
import {
    Modal,
    ConfirmationModal,
    FormField,
    FormSection,
    FormFooter,
    PageHeader,
    Button,
    EmptyState,
    DataTable,
    type ColumnDef,
    formControlClass,
} from '@/components/ui'
import { AssetFormModal, type AssetFormPayload } from '@/components/assets/AssetFormModal'
import { InventoryTypeOverview } from '@/components/assets/InventoryTypeOverview'
import { EquipmentRecordList } from '@/components/assets/EquipmentRecordList'
import { getEquipmentModelKey, getInventoryModelGroups, getInventoryTotals, getStockRecord, isStockType, normalizeInventoryText, type InventoryModelGroup } from '@/modules/assets/inventory-groups'
import { AssetSharingModal } from '@/components/assets/AssetSharingModal'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_secured/assets/')({
    component: AssetsPage,
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type Tenant = { id: number; name: string }

function equipmentIdentifier(asset: Asset, assetType?: AssetType): string {
    const key = assetType?.schema.find(field => field.is_unique_key)?.key
    const value = key ? asset.custom_data[key] : undefined
    return (typeof value === 'string' && value.trim() !== '') || typeof value === 'number'
        ? String(value)
        : asset.id
}

function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
}

function extractApiError(err: unknown, fallback: string): string {
    const errorObj = err as { response?: { data?: Record<string, unknown> | { detail?: string } } }
    const data = errorObj.response?.data
    if (!data) return fallback
    if (typeof data === 'string') return data
    if ('detail' in data && typeof data.detail === 'string') return data.detail
    try {
        return Object.entries(data as Record<string, unknown>).map(([key, val]) => {
            if (typeof val === 'object' && val !== null) {
                return Object.entries(val as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(', ')
            }
            return Array.isArray(val) ? val.join(', ') : `${key}: ${val}`
        }).join('; ')
    } catch {
        return fallback
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail modal
// ─────────────────────────────────────────────────────────────────────────────

function AssetDetailModal({ asset, assetTypes, isOpen, onClose, onEdit, onSharing }: {
    asset: Asset | null
    assetTypes: AssetType[]
    isOpen: boolean
    onClose: () => void
    onEdit: (asset: Asset) => void
    onSharing?: (asset: Asset) => void
}) {
    const { t, i18n } = useTranslation()
    if (!asset) return null

    const assetType = assetTypes.find(at => at.id === asset.asset_type)
    const stock = isStockType(assetType) ? getStockRecord(asset, assetType) : null
    const stockKeys = ['material_code', 'material_name', 'quantity']
    const schema = stock ? [...stockKeys.flatMap(key => assetType?.schema.filter(field => field.key === key) ?? []), ...(assetType?.schema.filter(field => !stockKeys.includes(field.key)) ?? [])] : assetType?.schema || []
    const extraFields = Object.entries(asset.custom_data).filter(([key]) => !schema.some(field => field.key === key))
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={stock ? stock.materialName || assetType?.name || t('inventory.stockInformation') : t('assets.detailTitle', { type: assetType?.name || t('assets.title') })} footer={stock ? <div className="flex flex-wrap justify-end gap-2 px-5 py-4"><Button variant="secondary" onClick={() => { onClose(); onEdit(asset) }}>{t('common.edit')}</Button>{onSharing && <Button onClick={() => { onClose(); onSharing(asset) }}>{t('inventory.sharingAction')}</Button>}</div> : undefined}>
            <div className="space-y-1">
                {stock && <p className="pb-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{t('inventory.stockQuantityHelp')}</p>}
                <div className="flex justify-between items-start gap-3 py-3 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-sm text-slate-500">{t('assets.assetType')}</span>
                    <span className="max-w-[65%] text-right text-sm font-medium text-slate-900 dark:text-white [overflow-wrap:anywhere]">{asset.asset_type_name}</span>
                </div>
                {asset.tenant_name && (
                    <div className="flex justify-between items-start gap-3 py-3 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-sm text-slate-500">{t('assets.shipyard')}</span>
                        <span className="max-w-[65%] text-right text-sm font-medium text-slate-900 dark:text-slate-200 [overflow-wrap:anywhere]">{asset.tenant_name}</span>
                    </div>
                )}
                {schema.map((field) => {
                    const value = asset.custom_data[field.key]
                    return (
                        <div key={field.key} className="flex justify-between items-start py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <span className="min-w-0 flex-1 pr-3 text-sm text-slate-500">{field.label}</span>
                            <span className="max-w-[65%] text-sm font-medium text-slate-900 dark:text-white text-right [overflow-wrap:anywhere]">
                                {stock && field.key === 'quantity' ? stock.quantity === null ? t('inventory.quantityUnknown') : t('inventory.stockQuantity', { quantity: stock.quantity.toLocaleString(locale) }) : field.type === 'checkbox'
                                    ? (value ? `✓ ${t('common.yes')}` : `✗ ${t('common.no')}`)
                                    : (value !== undefined && value !== '' ? String(value) : '-')}
                            </span>
                        </div>
                    )
                })}
                {extraFields.map(([key, value]) => <div key={key} className="flex justify-between items-start gap-3 border-b border-slate-100 py-3 dark:border-slate-800"><span className="text-sm text-slate-500">{key}</span><span className="max-w-[65%] text-right text-sm font-medium text-slate-900 dark:text-white [overflow-wrap:anywhere]">{value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</span></div>)}
                <div className="flex justify-between items-start py-3">
                    <span className="text-sm text-slate-500">{t('assets.createdDate')}</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                        {new Date(asset.created_at).toLocaleDateString(locale, {
                            day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                    </span>
                </div>
            </div>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Export dialog
// ─────────────────────────────────────────────────────────────────────────────

function ExportDialog({ isOpen, onClose, assetTypes, tenants, isSuperuser }: {
    isOpen: boolean
    onClose: () => void
    assetTypes: AssetType[]
    tenants: Tenant[]
    isSuperuser: boolean
}) {
    const { t } = useTranslation()
    const [typeId, setTypeId] = useState('')
    const [tenantId, setTenantId] = useState<number | null>(null)
    const [downloading, setDownloading] = useState<'list' | 'template' | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) { setTypeId(''); setTenantId(null); setError(null); setDownloading(null) }
    }, [isOpen])

    const selectedType = assetTypes.find(tp => tp.id === typeId)

    const runDownload = async (kind: 'list' | 'template') => {
        if (!typeId) return
        setDownloading(kind)
        setError(null)
        try {
            const blob = kind === 'list'
                ? await assetsApi.exportAssets(typeId, tenantId || undefined)
                : await assetsApi.downloadTemplate(typeId)
            const typeName = selectedType?.name || 'assets'
            const suffix = kind === 'list' ? 'export' : 'template'
            downloadBlob(blob, `${typeName.replace(/\s/g, '_')}_${suffix}.xlsx`)
            if (kind === 'list') onClose()
        } catch (err) {
            setError(extractApiError(err, kind === 'list' ? t('assets.exportFailed') : t('assets.templateFailed')))
        } finally {
            setDownloading(null)
        }
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            closeDisabled={downloading !== null}
            title={t('assets.exportDialog.title')}
            size="md"
            footer={
                <FormFooter
                    primaryLabel={t('assets.exportDialog.downloadList')}
                    icon={<Download size={16} />}
                    loading={downloading === 'list'}
                    cancelDisabled={downloading !== null}
                    disabled={!typeId || downloading !== null}
                    onPrimary={() => runDownload('list')}
                    onCancel={onClose}
                />
            }
        >
            <div className="space-y-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('assets.exportDialog.description')}</p>
                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <fieldset disabled={downloading !== null} className="min-w-0">
                <FormSection layout="stack">
                    <FormField label={t('assets.typeLabel')} required help={t('assets.exportDialog.selectTypeHelp')}>
                        <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={formControlClass} required>
                            <option value="">{t('assets.typePlaceholder')}</option>
                            {assetTypes.map((type) => (
                                <option key={type.id} value={type.id}>{type.name}</option>
                            ))}
                        </select>
                    </FormField>
                    {isSuperuser && (
                        <FormField label={t('assets.shipyardLabel')} help={t('assets.allShipyards')}>
                            <select value={tenantId || ''} onChange={(e) => setTenantId(e.target.value ? Number(e.target.value) : null)} className={formControlClass}>
                                <option value="">{t('assets.allShipyards')}</option>
                                {tenants.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                                ))}
                            </select>
                        </FormField>
                    )}
                </FormSection>
                </fieldset>

                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('assets.exportDialog.downloadTemplateHint')}</p>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={!typeId || downloading !== null}
                        onClick={() => runDownload('template')}
                        loading={downloading === 'template'}
                        icon={<Download size={14} />}
                    >
                        {t('assets.exportDialog.downloadTemplate')}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk import wizard — unified (template auto-detect + external)
// ─────────────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3

function BulkImportWizard({ isOpen, onClose, assetTypes, tenants, isSuperuser, onImported }: {
    isOpen: boolean
    onClose: () => void
    assetTypes: AssetType[]
    tenants: Tenant[]
    isSuperuser: boolean
    onImported: () => void
}) {
    const { t } = useTranslation()

    const [step, setStep] = useState<WizardStep>(1)
    const [file, setFile] = useState<File | null>(null)
    const [tenantId, setTenantId] = useState<number | null>(null)
    const [headerRow, setHeaderRow] = useState(1)
    const [manualHeader, setManualHeader] = useState(false)
    const [sheetName, setSheetName] = useState('')
    const [skipRows, setSkipRows] = useState<string[]>([])
    const [skipInput, setSkipInput] = useState('')
    const [previewing, setPreviewing] = useState(false)
    const [preview, setPreview] = useState<ImportPreview | null>(null)
    const [assetTypeId, setAssetTypeId] = useState('')
    const [mapping, setMapping] = useState<ColumnMapping>({})
    const [manualMapping, setManualMapping] = useState(false)
    const [autoMatched, setAutoMatched] = useState<Set<string>>(new Set())
    const [analysisDirty, setAnalysisDirty] = useState(false)
    const [excludeReviewRows, setExcludeReviewRows] = useState(false)
    const [importing, setImporting] = useState(false)
    const [templateResult, setTemplateResult] = useState<BulkImportResult | null>(null)
    const [rawResult, setRawResult] = useState<RawImportResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const skipInputId = useId()
    // Closing, replacing a file or editing settings invalidates any in-flight response.
    const requestSequence = useRef(0)
    const settingsRevision = useRef(0)

    const reset = useCallback(() => {
        requestSequence.current += 1
        settingsRevision.current += 1
        setStep(1); setFile(null); setTenantId(null); setHeaderRow(1)
        setManualHeader(false); setSheetName(''); setSkipRows([]); setSkipInput('')
        setPreview(null); setAssetTypeId(''); setMapping({}); setAutoMatched(new Set())
        setAnalysisDirty(false); setExcludeReviewRows(false); setManualMapping(false)
        setTemplateResult(null); setRawResult(null); setError(null)
        setPreviewing(false); setImporting(false); setDragOver(false)
    }, [])

    useEffect(() => { if (!isOpen) reset() }, [isOpen, reset])

    const selectedAssetType = assetTypes.find(at => at.id === assetTypeId)
    const uniqueKeyField = selectedAssetType?.schema?.find(f => f.is_unique_key)
    const isTemplate = !!preview?.detected_template
    const analysis = preview?.analysis
    const needsTenant = isSuperuser
    const mappedFields = Object.values(mapping).filter((value): value is string => !!value)
    const missingFields = !isTemplate && analysis ? (selectedAssetType?.schema ?? []).filter(field => field.required && !mappedFields.includes(field.key)) : []
    const duplicateFields = !isTemplate && analysis ? [...new Set(mappedFields.filter((key, index) => mappedFields.indexOf(key) !== index))] : []
    const reviewNumbers = analysis?.review_row_numbers ?? []
    const analysisBlocked = !!analysis && (
        analysis.layout_confidence !== 'high' || analysis.blockers.length > 0 ||
        missingFields.length > 0 || duplicateFields.length > 0 ||
        (reviewNumbers.length > 0 && !excludeReviewRows) || analysis.counts.ready === 0
    )

    const invalidateAnalysis = () => {
        settingsRevision.current += 1
        setAnalysisDirty(!!analysis)
        setExcludeReviewRows(false)
        setError(null)
    }

    const pickFile = (f: File | null) => {
        if (previewing || importing) return
        requestSequence.current += 1
        settingsRevision.current += 1
        setFile(f); setPreview(null); setAssetTypeId(''); setMapping({}); setAutoMatched(new Set())
        setHeaderRow(1); setManualHeader(false); setSheetName(''); setSkipRows([]); setSkipInput('')
        setAnalysisDirty(false); setExcludeReviewRows(false); setManualMapping(false); setTemplateResult(null); setRawResult(null)
        setError(f && !f.name.toLowerCase().endsWith('.xlsx') ? t('ux.inventoryInvalidFile') : null)
        if (f && !f.name.toLowerCase().endsWith('.xlsx')) setFile(null)
    }

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) pickFile(f)
    }

    const runPreview = async () => {
        if (!file || previewing || importing) return
        if (needsTenant && !tenantId) { setError(t('assets.shipyardRequired')); return }
        const request = ++requestSequence.current
        const revision = settingsRevision.current
        setPreviewing(true); setError(null)
        try {
            const res = await assetsApi.previewImport(file, {
                headerRow: manualHeader ? headerRow : undefined,
                sheetName: sheetName || undefined,
                assetTypeId: assetTypeId || undefined,
                mapping: preview && assetTypeId && !isTemplate && manualMapping ? mapping : undefined,
                skipRows,
            })
            if (request !== requestSequence.current || revision !== settingsRevision.current) return
            setPreview(res)
            if (res.analysis) {
                const proposedTypeId = res.analysis.suggested_asset_type_id
                const suggestion = res.analysis.type_suggestions.find(candidate => candidate.asset_type_id === proposedTypeId)
                const suggestedTypeId = suggestion?.confidence === 'high' && !res.analysis.blockers.some(issue => issue.code === 'asset_type_selection_required') ? res.analysis.suggested_asset_type_id : ''
                const chosenTypeId = res.detected_template?.asset_type_id || assetTypeId || suggestedTypeId || ''
                setAssetTypeId(chosenTypeId)
                setHeaderRow(res.analysis.header_row)
                const nextMapping = res.analysis.analysis_mapping ?? res.analysis.suggested_mapping ?? {}
                setMapping(nextMapping)
                setAutoMatched(manualMapping ? new Set() : new Set(Object.entries(nextMapping).filter(([, value]) => value).map(([header]) => header)))
                setAnalysisDirty(false)
                setExcludeReviewRows(false)
            } else if (res.detected_template) {
                setAssetTypeId(res.detected_template.asset_type_id)
            } else if (assetTypes.length === 1) {
                setAssetTypeId(assetTypes[0].id)
            }
            setStep(2)
        } catch (err) {
            if (request === requestSequence.current && revision === settingsRevision.current) setError(extractApiError(err, t('assets.wizard.uploadFailed')))
        } finally {
            if (request === requestSequence.current) setPreviewing(false)
        }
    }

    // Older servers return no analysis; retain their existing column-alias behavior.
    useEffect(() => {
        if (!preview || preview.analysis || !selectedAssetType || isTemplate) return
        const schema = selectedAssetType.schema || []
        const next: ColumnMapping = {}
        const matches = new Set<string>()
        const stockAliases: Record<string, string[]> = {
            material_code: ['malzeme kodu', 'material code', 'seri numarası', 'seri numarasi'],
            material_name: ['malzeme adı', 'malzeme adi', 'material name', 'isim', 'name'],
            quantity: ['stok adedi', 'adet', 'stock quantity', 'quantity'],
            source_record_id: ['kaynak kayıt id', 'id'],
            source_created_at: ['kaynak kayıt tarihi', 'oluşturulma tarihi', 'olusturulma tarihi', 'created at'],
            original_shipyard: ['kaynak tersane', 'tersane', 'shipyard'],
        }
        for (const h of preview.headers ?? []) {
            if (!h) continue
            const header = normalizeInventoryText(h)
            const found = schema.find(f => normalizeInventoryText(f.label ?? '') === header)
                ?? (isStockType(selectedAssetType) ? schema.find(f => stockAliases[f.key]?.some(alias => normalizeInventoryText(alias) === header)) : undefined)
            next[h] = found ? found.key : null
            if (found) matches.add(h)
        }
        setMapping(next)
        setAutoMatched(matches)
    }, [preview, selectedAssetType, isTemplate])

    const changeAssetType = (id: string) => {
        setAssetTypeId(id)
        setManualMapping(false)
        if (analysis) {
            const suggestion = analysis.type_suggestions.find(candidate => candidate.asset_type_id === id)
            setMapping(suggestion?.mapping ?? Object.fromEntries((preview?.headers ?? []).map(header => [header, null])))
            setAutoMatched(new Set())
            invalidateAnalysis()
        }
    }

    const runImport = async () => {
        if (!file || !assetTypeId || previewing || importing) return
        if (needsTenant && !tenantId) { setError(t('assets.shipyardRequired')); return }
        if (analysisDirty) { await runPreview(); return }
        if (analysisBlocked) return
        const request = ++requestSequence.current
        const revision = settingsRevision.current
        setImporting(true); setError(null)
        try {
            const options = analysis ? {
                headerRow: analysis.header_row,
                dataStartRow: analysis.data_start_row,
                skipRows,
                mapping: analysis.analysis_mapping,
                sheetName: analysis.sheet_name,
                excludeRowNumbers: excludeReviewRows ? reviewNumbers : [],
                requireReview: true,
            } : {}
            if (isTemplate) {
                const res = await assetsApi.bulkImport(file, assetTypeId, tenantId || undefined, options)
                if (request !== requestSequence.current || revision !== settingsRevision.current) return
                setTemplateResult(res)
            } else {
                const res = await assetsApi.rawImport(
                    file, assetTypeId, mapping, tenantId || undefined, analysis?.header_row ?? headerRow, skipRows, options,
                )
                if (request !== requestSequence.current || revision !== settingsRevision.current) return
                setRawResult(res)
            }
            setStep(3)
            onImported()
        } catch (err) {
            if (request === requestSequence.current && revision === settingsRevision.current) setError(extractApiError(err, t('assets.importFailed')))
        } finally {
            if (request === requestSequence.current) setImporting(false)
        }
    }

    const addSkipRow = () => {
        const v = skipInput.trim()
        if (v && !skipRows.includes(v)) { setSkipRows([...skipRows, v]); invalidateAnalysis() }
        setSkipInput('')
    }

    const summary = (() => {
        if (rawResult) return {
            created_count: rawResult.created_count ?? 0,
            updated_count: rawResult.updated_count ?? 0,
            skipped_count: rawResult.skipped_count ?? 0,
            sharing_paused_count: rawResult.sharing_paused_count ?? 0,
            error_count: rawResult.error_count ?? 0,
            errors: rawResult.errors ?? [],
            message: rawResult.message ?? '',
        }
        if (templateResult) return {
            created_count: templateResult.created_count ?? templateResult.success_count ?? 0,
            updated_count: templateResult.updated_count ?? 0,
            skipped_count: templateResult.skipped_count ?? 0,
            sharing_paused_count: templateResult.sharing_paused_count ?? 0,
            error_count: templateResult.error_count ?? 0,
            errors: templateResult.errors ?? [],
            message: templateResult.message ?? '',
        }
        return null
    })()

    const steps: { n: WizardStep; label: string }[] = [
        { n: 1, label: t('assets.wizard.stepFile') },
        { n: 2, label: t('assets.wizard.stepPreview') },
        { n: 3, label: t('assets.wizard.stepResult') },
    ]

    const layoutOptions = (
        <details className="rounded-md border border-slate-200 px-4 py-3 dark:border-slate-700">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">
                {t('assets.wizard.fileLayout')}
                <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">{manualHeader ? t('assets.wizard.fileLayoutSummary', { headerRow, count: skipRows.length }) : t('assets.wizard.analysis.automaticLayout', { count: skipRows.length })}</span>
            </summary>
            <FormSection layout="grid" className="mt-4">
                {analysis && (
                    <FormField label={t('assets.wizard.analysis.sheet')} help={t('assets.wizard.analysis.sheetHelp')}>
                        <select value={sheetName} onChange={event => { setSheetName(event.target.value); setManualMapping(false); setMapping({}); setAutoMatched(new Set()); invalidateAnalysis() }} className={formControlClass}>
                            <option value="">{t('assets.wizard.analysis.automatic')}</option>
                            {analysis.sheet_names.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </FormField>
                )}
                <FormField label={t('assets.wizard.headerRow')} help={t('assets.wizard.headerRowHelp')}>
                    <input
                        type="number"
                        min={1}
                        value={headerRow}
                        onChange={(e) => { setHeaderRow(Number(e.target.value) || 1); setManualHeader(true); setManualMapping(false); setMapping({}); setAutoMatched(new Set()); invalidateAnalysis() }}
                        className={formControlClass}
                    />
                </FormField>
                <div>
                    <label htmlFor={skipInputId} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('assets.wizard.skipRows')}</label>
                    <div className="flex gap-2">
                        <input
                            id={skipInputId}
                            aria-describedby={`${skipInputId}-help`}
                            type="text"
                            value={skipInput}
                            onChange={(e) => setSkipInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkipRow() } }}
                            placeholder="TOPLAM"
                            className={formControlClass}
                        />
                        <Button type="button" variant="secondary" size="md" onClick={addSkipRow}>
                            {t('common.add')}
                        </Button>
                    </div>
                    {skipRows.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {skipRows.map(r => (
                                <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs">
                                    {r}
                                    <button type="button" aria-label={t('assets.wizard.removeSkipRule', { value: r })} onClick={() => { setSkipRows(skipRows.filter(x => x !== r)); invalidateAnalysis() }} className="hover:text-red-500"><X size={10} aria-hidden="true" /></button>
                                </span>
                            ))}
                        </div>
                    )}
                    <p id={`${skipInputId}-help`} className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('assets.wizard.skipRowsHelp')}</p>
                </div>
            </FormSection>
            {analysis && <div className="mt-3 flex flex-wrap gap-2">
                {analysis.layout_confidence === 'review' && <Button type="button" variant="secondary" onClick={() => { setManualHeader(true); setSheetName(sheetName || analysis.sheet_name); setManualMapping(false); setMapping({}); setAutoMatched(new Set()); invalidateAnalysis() }}>{t('assets.wizard.analysis.confirmLayout')}</Button>}
                <Button type="button" variant="secondary" onClick={runPreview} loading={previewing} disabled={previewing || importing}>{t('assets.wizard.analysis.recheck')}</Button>
            </div>}
        </details>
    )

    // Per-step footer is rendered in the Modal's `footer` slot so it can
    // never overlap the scrollable body content.
    let footerNode: React.ReactNode = null
    if (step === 1) {
        footerNode = (
            <FormFooter
                primaryLabel={t('assets.wizard.previewAction')}
                icon={null}
                onPrimary={runPreview}
                loading={previewing}
                disabled={!file || (needsTenant && !tenantId)}
                onCancel={onClose}
            />
        )
    } else if (step === 2 && preview) {
        footerNode = (
            <FormFooter
                primaryLabel={analysisDirty ? t('assets.wizard.analysis.recheck') : analysis ? t('assets.wizard.analysis.importReady', { count: analysis.counts.ready }) : isTemplate ? t('assets.wizard.runTemplateImport') : t('assets.wizard.importAction')}
                icon={<Upload size={16} />}
                loading={previewing || importing}
                disabled={!assetTypeId || (!analysisDirty && (analysisBlocked || (!isTemplate && !Object.values(mapping).some(Boolean))))}
                onPrimary={runImport}
                onCancel={() => setStep(1)}
                cancelLabel={t('assets.wizard.back')}
            />
        )
    } else if (step === 3 && summary) {
        footerNode = (
            <FormFooter
                primaryLabel={t('assets.wizard.newImport')}
                icon={<RefreshCw size={16} />}
                onPrimary={reset}
                onCancel={onClose}
                cancelLabel={t('assets.wizard.close')}
            />
        )
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('assets.bulkImportTitle')}
            closeDisabled={previewing || importing}
            size="xl"
            footer={footerNode}
        >
            <fieldset disabled={previewing || importing} className="min-w-0 space-y-5">
                <div className="border-l-2 border-slate-400 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300">
                    <p>{t('catalog.inventoryImportHelp')}</p>
                    <Link to="/assets/types" onClick={event => { if (previewing || importing) event.preventDefault(); else onClose() }} aria-disabled={previewing || importing} className="mt-1 inline-block font-medium underline">{t('catalog.goToTypes')}</Link>
                </div>
                {/* Stepper */}
                <ol className="flex flex-wrap items-center gap-5 border-b border-slate-200 dark:border-slate-700" aria-label={t('assets.bulkImportTitle')}>
                    {steps.map((s) => {
                        const active = step === s.n
                        const done = step > s.n
                        return (
                            <li key={s.n} aria-current={active ? 'step' : undefined}>
                                <div className={`flex shrink-0 items-center gap-2 border-b-2 pb-3 text-xs transition-colors ${active
                                    ? 'border-blue-700 font-semibold text-slate-900 dark:border-blue-400 dark:text-white'
                                    : 'border-transparent text-slate-500 dark:text-slate-400'
                                    }`}>
                                    {done ? <CheckCircle size={12} /> : <span>{s.n}</span>}
                                    <span>{s.label}</span>
                                </div>
                            </li>
                        )
                    })}
                </ol>

                {error && (
                    <div role="alert" className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* ── STEP 1: File upload ───────────────────────────────── */}
                {step === 1 && (
                    <div className="space-y-4">
                        {needsTenant && (
                            <FormSection title={t('assets.fields.generalInfo')}>
                                <FormField label={t('assets.shipyardLabel')} required>
                                    <select
                                        value={tenantId || ''}
                                        onChange={(e) => setTenantId(e.target.value ? Number(e.target.value) : null)}
                                        className={formControlClass}
                                        required
                                    >
                                        <option value="">{t('assets.shipyardPlaceholder')}</option>
                                        {tenants.map((tenant) => (
                                            <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                                        ))}
                                    </select>
                                </FormField>
                            </FormSection>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Excel {t('common.upload')}
                            </label>
                            <input type="file" ref={fileInputRef} accept=".xlsx" aria-label={t('ux.inventoryFile')} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} className="hidden" />
                            <div
                                role="button"
                                tabIndex={0}
                                aria-label={t('assets.wizard.dropOrClick')}
                                aria-disabled={previewing || importing}
                                onClick={() => { if (!previewing && !importing) fileInputRef.current?.click() }}
                                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!previewing && !importing) fileInputRef.current?.click() } }}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={onDrop}
                                className={`w-full px-4 py-6 rounded-md border border-dashed cursor-pointer flex flex-col items-center gap-2 transition-colors ${file
                                    ? 'border-blue-600 bg-slate-50 dark:border-blue-400 dark:bg-slate-950'
                                    : dragOver
                                        ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-slate-950'
                                        : 'border-slate-300 dark:border-slate-600 hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-950'
                                    }`}
                            >
                                <FileSpreadsheet size={22} className="text-slate-500 dark:text-slate-400" />
                                {file ? (
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{file.name}</p>
                                        <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB · {t('assets.wizard.droppedFile')}</p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500 text-center">{t('assets.wizard.dropOrClick')}</p>
                                )}
                            </div>
                        </div>

                        {layoutOptions}
                    </div>
                )}

                {/* ── STEP 2: Mapping + preview ─────────────────────────── */}
                {step === 2 && preview && (
                    <div className="space-y-4">
                        {analysis && (
                            <section aria-label={t('assets.wizard.analysis.title')} className="min-w-0 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                                <div>
                                    <h4 className="font-semibold text-slate-900 dark:text-white">{t('assets.wizard.analysis.title')}</h4>
                                    <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{t('assets.wizard.analysis.detectedLayout', { sheet: analysis.sheet_name, row: analysis.header_row })}</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('assets.wizard.analysis.ownership')}</p>
                                </div>
                                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                                    <p><span className="font-semibold tabular-nums">{analysis.counts.ready}</span> {t('assets.wizard.analysis.ready')}</p>
                                    <p><span className="font-semibold tabular-nums">{analysis.counts.skipped + (excludeReviewRows ? reviewNumbers.length : 0)}</span> {t('assets.wizard.analysis.skipped')}</p>
                                    <p><span className="font-semibold tabular-nums">{excludeReviewRows ? 0 : analysis.counts.review}</span> {t('assets.wizard.analysis.review')}</p>
                                </div>
                                {analysisDirty && <p role="status" className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('assets.wizard.analysis.dirty')}</p>}
                                {!analysisDirty && analysis.layout_confidence === 'review' && <p className="text-sm text-amber-800 dark:text-amber-300">{t('assets.wizard.analysis.layoutReview')}</p>}
                                {analysis.type_suggestions.length > 0 && !isTemplate && (
                                    <p className="break-words text-sm text-slate-600 dark:text-slate-300">{t('assets.wizard.analysis.typeSuggestions', { names: analysis.type_suggestions.map(candidate => `${candidate.asset_type_name} (${candidate.matched_fields})`).join(', ') })}</p>
                                )}
                                {!analysisDirty && analysis.blockers.length > 0 && (
                                    <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-300" aria-label={t('assets.wizard.analysis.requiredActions')}>
                                        {analysis.blockers.map((issue, index) => <li key={`${issue.code}-${index}`}>{t(`assets.wizard.analysis.issues.${issue.code}`, { defaultValue: t('assets.wizard.analysis.manualRequired'), fields: (issue.fields ?? issue.headers ?? []).map(key => selectedAssetType?.schema.find(field => field.key === key)?.label ?? key).join(', ') })}</li>)}
                                    </ul>
                                )}
                                {missingFields.length > 0 && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t('assets.wizard.analysis.issues.missing_required_mapping', { fields: missingFields.map(field => field.label).join(', ') })}</p>}
                                {duplicateFields.length > 0 && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t('assets.wizard.analysis.issues.ambiguous_mapping', { fields: duplicateFields.map(key => selectedAssetType?.schema.find(field => field.key === key)?.label ?? key).join(', ') })}</p>}
                                {analysis.warnings.length > 0 && <ul className="space-y-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{analysis.warnings.map((issue, index) => <li key={`${issue.code}-${index}`}>{t(`assets.wizard.analysis.issues.${issue.code}`, { defaultValue: t('assets.wizard.analysis.manualRequired'), fields: (issue.fields ?? issue.headers ?? []).join(', ') })}</li>)}</ul>}
                                {analysis.skipped_rows.length > 0 && (
                                    <details>
                                        <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">{t('assets.wizard.analysis.skippedDetails', { count: analysis.counts.skipped })}</summary>
                                        <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs leading-5 text-slate-600 dark:text-slate-300">
                                            {analysis.skipped_rows.map(row => <li key={row.row_number} className="break-words">{t('assets.wizard.analysis.excelRow', { row: row.row_number })} · {t(`assets.wizard.analysis.reasons.${row.reason}`, { defaultValue: row.reason })}{row.label ? ` · ${row.label}` : ''}</li>)}
                                        </ul>
                                        {analysis.skipped_rows.length < analysis.counts.skipped && <p className="mt-2 text-xs text-slate-500">{t('assets.wizard.analysis.detailSample', { count: analysis.skipped_rows.length, total: analysis.counts.skipped })}</p>}
                                    </details>
                                )}
                                {reviewNumbers.length > 0 && (
                                    <details open>
                                        <summary className="cursor-pointer text-sm font-medium text-amber-800 dark:text-amber-300">{t('assets.wizard.analysis.reviewDetails', { count: analysis.counts.review })}</summary>
                                        <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs leading-5 text-slate-600 dark:text-slate-300">
                                            {analysis.review_rows.map(row => <li key={`${row.row_number}-${row.reason}`} className="break-words">{t('assets.wizard.analysis.excelRow', { row: row.row_number })} · {t(`assets.wizard.analysis.reasons.${row.reason}`, { defaultValue: row.reason })}{row.fields?.length ? ` · ${row.fields.map(key => selectedAssetType?.schema.find(field => field.key === key)?.label ?? key).join(', ')}` : ''}</li>)}
                                        </ul>
                                        {analysis.review_rows.length < analysis.counts.review && <p className="mt-2 text-xs text-slate-500">{t('assets.wizard.analysis.detailSample', { count: analysis.review_rows.length, total: analysis.counts.review })}</p>}
                                        <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{t('assets.wizard.analysis.reviewHelp')}</p>
                                        <label className="mt-3 flex items-start gap-2 text-sm leading-5 text-slate-700 dark:text-slate-200">
                                            <input type="checkbox" checked={excludeReviewRows} disabled={analysisDirty} onChange={event => setExcludeReviewRows(event.target.checked)} className="mt-1 shrink-0" />
                                            <span>{t('assets.wizard.analysis.excludeReview', { count: reviewNumbers.length })}</span>
                                        </label>
                                    </details>
                                )}
                                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('assets.wizard.analysis.sampleHelp', { count: preview.preview_rows.length, total: analysis.counts.data })}</p>
                            </section>
                        )}
                        {layoutOptions}

                        {isTemplate ? (
                            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                                <div className="flex items-start gap-3">
                                    <CheckCircle size={22} className="text-emerald-600 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-semibold text-slate-900 dark:text-white mb-1">
                                            {t('assets.wizard.templateDetectedTitle')}
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                            {t('assets.wizard.templateDetectedBody', {
                                                name: preview.detected_template?.asset_type_name,
                                                count: analysis?.counts.ready ?? preview.total_rows,
                                            })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <FormSection title={t('assets.fields.generalInfo')}>
                                <FormField label={t('assets.typeLabel')} required>
                                    <select value={assetTypeId} onChange={(e) => changeAssetType(e.target.value)} className={formControlClass} required>
                                        <option value="">{t('assets.typePlaceholder')}</option>
                                        {assetTypes.map((type) => (
                                            <option key={type.id} value={type.id}>{type.name}</option>
                                        ))}
                                    </select>
                                </FormField>
                            </FormSection>
                        )}

                        {isStockType(selectedAssetType) && <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">{t('inventory.stockImportHelp')}</p>}

                        {uniqueKeyField && (
                            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                                <KeyRound size={15} className="text-amber-600 mt-0.5 shrink-0" />
                                <p className="text-amber-700 dark:text-amber-400">
                                    {t('assets.wizard.uniqueKeyNotice', { field: uniqueKeyField.label })}
                                </p>
                            </div>
                        )}

                        {!isTemplate && assetTypeId ? (
                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                                {/* Mapping column */}
                                <div className="lg:col-span-2">
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                        {t('assets.wizard.mapping')}
                                    </h4>
                                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                        <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                                            {(preview.headers ?? []).map((header) => {
                                                const mapped = mapping[header] ?? ''
                                                const mappedField = selectedAssetType?.schema?.find(f => f.key === mapped)
                                                const wasAuto = autoMatched.has(header)
                                                return (
                                                    <div key={header} className="px-3 py-2 flex items-center gap-2">
                                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate flex-1" title={header}>
                                                            {header}
                                                        </span>
                                                        {wasAuto && mapped && (
                                                            <Check size={12} className="text-emerald-500 shrink-0" aria-label={t('assets.wizard.autoMatched')} />
                                                        )}
                                                        <select
                                                            aria-label={t('assets.wizard.mapColumn', { column: header })}
                                                            value={mapped}
                                                            onChange={(e) => {
                                                                setMapping({ ...mapping, [header]: e.target.value || null })
                                                                setManualMapping(true)
                                                                invalidateAnalysis()
                                                                setAutoMatched((prev) => {
                                                                    const next = new Set(prev)
                                                                    next.delete(header)
                                                                    return next
                                                                })
                                                            }}
                                                            className={`${formControlClass} py-1 text-xs min-w-0 flex-1`}
                                                        >
                                                            <option value="">{t('assets.wizard.ignore')}</option>
                                                            {(selectedAssetType?.schema || []).map((f: SchemaField) => (
                                                                <option key={f.key} value={f.key} disabled={!!analysis && f.key !== mapped && mappedFields.includes(f.key)}>
                                                                    {f.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {mappedField?.is_unique_key && (
                                                            <KeyRound size={12} className="text-amber-500 shrink-0" />
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Preview column */}
                                <div className="lg:col-span-3">
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                        {t('assets.wizard.dataPreview')} · {t('assets.wizard.rowCount', { count: preview.total_rows })}
                                    </h4>
                                    <ImportPreviewTable
                                        preview={preview}
                                        mapping={mapping}
                                        schema={selectedAssetType?.schema || []}
                                    />
                                </div>
                            </div>
                        ) : (
                            // Template mode: just the preview
                            <div>
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                    {t('assets.wizard.dataPreview')} · {t('assets.wizard.rowCount', { count: preview.total_rows })}
                                </h4>
                                <ImportPreviewTable preview={preview} mapping={{}} schema={[]} />
                            </div>
                        )}
                    </div>
                )}

                {/* ── STEP 3: Result ───────────────────────────────────── */}
                {step === 3 && summary && (
                    <div className="space-y-4">
                        <div className={`p-4 rounded-md border bg-white dark:bg-slate-900 ${summary.error_count > 0 && summary.created_count + summary.updated_count === 0
                            ? 'border-red-300 dark:border-red-800'
                            : summary.error_count > 0
                                ? 'border-amber-300 dark:border-amber-800'
                                : 'border-slate-200 dark:border-slate-700'
                            }`}>
                            <div className="flex items-start gap-3">
                                {summary.error_count > 0
                                    ? <AlertCircle size={22} className="text-amber-600 shrink-0 mt-0.5" />
                                    : <CheckCircle size={22} className="text-emerald-600 shrink-0 mt-0.5" />}
                                <div className="flex-1">
                                    <p className="font-semibold text-slate-900 dark:text-white mb-3">{summary.message}</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="border-t border-slate-200 py-2 dark:border-slate-700">
                                            <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{summary.created_count}</p>
                                            <p className="text-xs text-slate-500">{t('assets.wizard.created')}</p>
                                        </div>
                                        <div className="border-t border-slate-200 py-2 dark:border-slate-700">
                                            <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{summary.updated_count}</p>
                                            <p className="text-xs text-slate-500">{t('assets.wizard.updated')}</p>
                                        </div>
                                        <div className="border-t border-slate-200 py-2 dark:border-slate-700">
                                            <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{summary.skipped_count}</p>
                                            <p className="text-xs text-slate-500">{t('assets.wizard.skipped')}</p>
                                        </div>
                                        <div className="border-t border-slate-200 py-2 dark:border-slate-700">
                                            <p className="text-xl font-semibold tabular-nums text-red-700 dark:text-red-300">{summary.error_count}</p>
                                            <p className="text-xs text-slate-500">{t('assets.wizard.errors')}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {summary.sharing_paused_count > 0 && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{t('sharingDetails.importPaused', { count: summary.sharing_paused_count })}</p>}

                        {(summary.errors ?? []).length > 0 && (
                            <div className="max-h-40 overflow-y-auto border border-red-100 dark:border-red-900 rounded-lg divide-y divide-red-100 dark:divide-red-900">
                                {(summary.errors ?? []).map((err, idx) => (
                                    <div key={idx} className="px-3 py-2 text-sm text-red-600 dark:text-red-400">
                                        <span className="font-medium">{t('assets.row')} {err.row}:</span> {(err.errors ?? []).join(', ')}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </fieldset>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Import preview table — uses shared DataTable with pagination & column badges
// ─────────────────────────────────────────────────────────────────────────────

type PreviewRow = { _idx: number; excelRow: number; cells: string[] }

function ImportPreviewTable({
    preview,
    mapping,
    schema,
}: {
    preview: ImportPreview
    mapping: ColumnMapping
    schema: SchemaField[]
}) {
    const { t } = useTranslation()

    const rows: PreviewRow[] = useMemo(
        () => (preview.preview_rows ?? []).map((cells, idx) => ({ _idx: idx, excelRow: preview.preview_row_numbers?.[idx] ?? idx + (preview.analysis?.data_start_row ?? 2), cells: cells ?? [] })),
        [preview.preview_rows, preview.preview_row_numbers, preview.analysis?.data_start_row],
    )

    const columns: ColumnDef<PreviewRow>[] = useMemo(() => {
        const dataColumns: ColumnDef<PreviewRow>[] = (preview.headers ?? []).map((header, colIndex) => {
            const mappedKey = mapping[header]
            const field = mappedKey ? schema.find((f) => f.key === mappedKey) : null
            return {
                key: `c${colIndex}`,
                header: (
                    <div className="space-y-0.5">
                        <div className="text-slate-700 dark:text-slate-200 normal-case font-semibold truncate max-w-[180px]" title={header}>
                            {header}
                        </div>
                        {field ? (
                            <span className="text-[10px] font-normal text-blue-600 dark:text-blue-400">
                                {t('assets.wizard.mapsTo', { field: field.label })}
                            </span>
                        ) : mappedKey === null && Object.keys(mapping).length > 0 ? (
                            <span className="text-[10px] font-normal text-slate-400">
                                {t('assets.wizard.ignored')}
                            </span>
                        ) : null}
                    </div>
                ),
                cell: (row) => (
                    <span
                        className={`text-xs block max-w-[220px] truncate ${field ? 'text-slate-700 dark:text-slate-200' : Object.keys(mapping).length > 0 && !field ? 'text-slate-400 italic' : 'text-slate-700 dark:text-slate-200'}`}
                        title={row.cells[colIndex] ?? ''}
                    >
                        {row.cells[colIndex] ?? ''}
                    </span>
                ),
            }
        })
        return preview.analysis ? [{ key: 'excelRow', header: t('assets.wizard.analysis.excelRowColumn'), cell: row => <span className="text-xs tabular-nums">{row.excelRow}</span> }, ...dataColumns] : dataColumns
    }, [preview.headers, preview.analysis, mapping, schema, t])

    return (
        <DataTable
            data={rows}
            columns={columns}
            getRowId={(r) => r._idx}
            pageSize={10}
            pageSizeOptions={[10, 25, 50]}
            maxBodyHeight="min(440px, 55vh)"
        />
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions menu
// ─────────────────────────────────────────────────────────────────────────────

function ActionsMenu({ onExport, onReport, disabledExport, disabledReport }: { onExport: () => void; onReport: () => void; disabledExport: boolean; disabledReport: boolean }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const btnRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!open) return
        const handler = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node) && !btnRef.current?.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])
    return <div className="relative">
        <Button ref={btnRef} variant="secondary" onClick={() => setOpen(value => !value)} aria-label={t('assets.moreActions')} title={t('assets.moreActions')} aria-expanded={open} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }} icon={<MoreHorizontal size={16} />}><span className="sr-only">{t('assets.moreActions')}</span></Button>
        {open && <div ref={menuRef} className="absolute right-0 top-full z-10 mt-2 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-md dark:border-slate-700 dark:bg-slate-900">
            <button type="button" disabled={disabledExport} onClick={() => { setOpen(false); onExport() }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"><Download size={15} />{t('assets.exportExcel')}</button>
            <button type="button" disabled={disabledReport} onClick={() => { setOpen(false); onReport() }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"><FileText size={15} />{t('common.exportReport')}</button>
        </div>}
    </div>
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function AssetsPage() {
    const { user } = useAuth()
    const { t, i18n } = useTranslation()
    const locale = i18n.language.startsWith('tr') ? 'tr-TR' : 'en-US'
    const isSuperuser = !!user?.is_superuser || user?.role === 'platform_admin'
    const hasTenant = isSuperuser || !!user?.tenant_slug
    const { data: assetTypes = [], isLoading: typesLoading, isError: typesError, refetch: refetchTypes } = useAssetTypes()
    const { data: tenants = [], isLoading: tenantsLoading, isError: tenantsError, refetch: refetchTenants } = useTenants()

    const [filterTenant, setFilterTenant] = useState<number | null>(null)
    const [filterType, setFilterType] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [inventoryMode, setInventoryMode] = useState<'types' | 'list'>('types')
    const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null)
    const [sharingAsset, setSharingAsset] = useState<Asset | null>(null)
    const canManageSharing = isSuperuser || user?.role === 'tenant_admin'

    const [formOpen, setFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
    const [formError, setFormError] = useState<string | null>(null)

    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)

    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    const [isImportOpen, setIsImportOpen] = useState(false)
    const [isExportOpen, setIsExportOpen] = useState(false)

    const { data: assets = [], isLoading, isError: assetsError, refetch: refetchAssets } = useAssets(undefined, hasTenant)
    const createMutation = useCreateAsset()
    const updateMutation = useUpdateAsset()
    const deleteMutation = useDeleteAsset()

    const isBusy = isLoading || typesLoading || (isSuperuser && tenantsLoading)
    const hasLoadError = typesError || (hasTenant && assetsError) || (isSuperuser && tenantsError)
    const canCreate = hasTenant && assetTypes.length > 0 && !isBusy && !hasLoadError && (!isSuperuser || tenants.length > 0)
    const hasFilters = !!(searchQuery.trim() || filterType || filterTenant || selectedModelKey)
    const resetFilters = () => { setSearchQuery(''); setFilterType(null); setFilterTenant(null); setSelectedModelKey(null); setInventoryMode('types') }

    const scopedAssets = useMemo(() => {
        let result = assets
        if (filterType) result = result.filter(a => a.asset_type === filterType)
        if (isSuperuser && filterTenant) result = result.filter(a => a.tenant === filterTenant)
        if (searchQuery.trim()) {
            const words = normalizeInventoryText(searchQuery).split(' ').filter(word => word !== '·')
            result = result.filter(asset => {
                const text = normalizeInventoryText([asset.asset_type_name, asset.tenant_name, ...Object.values(asset.custom_data)].map(String).join(' '))
                return words.every(word => text.includes(word))
            })
        }
        return result
    }, [assets, filterType, filterTenant, searchQuery, isSuperuser])

    const filteredAssets = useMemo(() => selectedModelKey
        ? scopedAssets.filter(asset => getEquipmentModelKey(asset, assetTypes.find(type => type.id === asset.asset_type)) === selectedModelKey)
        : scopedAssets, [scopedAssets, selectedModelKey, assetTypes])
    const selectedModel = useMemo(() => selectedModelKey
        ? getInventoryModelGroups(scopedAssets, assetTypes).find(group => group.key === selectedModelKey)
        : undefined, [scopedAssets, assetTypes, selectedModelKey])
    const totals = getInventoryTotals(scopedAssets, assetTypes)
    const visibleTotals = getInventoryTotals(filteredAssets, assetTypes)
    const summaryLabel = (value: ReturnType<typeof getInventoryTotals>) => {
        if (!value.stockLineCount) return t(searchQuery.trim() ? 'inventory.matchingQuantity' : 'inventory.summaryCount', { count: value.equipmentCount })
        const stock = t(value.hasInvalidStock ? 'inventory.stockSummaryUnknown' : 'inventory.stockSummary', { lines: value.stockLineCount.toLocaleString(locale), quantity: value.stockQuantity.toLocaleString(locale) })
        return value.equipmentCount ? `${t('inventory.summaryCount', { count: value.equipmentCount })} · ${stock}` : stock
    }

    const openCreate = () => {
        if (!canCreate) return
        setFormMode('create')
        setEditingAsset(null)
        setFormError(null)
        setFormOpen(true)
    }

    const openEdit = (asset: Asset) => {
        setFormMode('edit')
        setEditingAsset(asset)
        setFormError(null)
        setFormOpen(true)
    }

    const handleSave = async (data: AssetFormPayload) => {
        try {
            setFormError(null)
            if (formMode === 'edit' && editingAsset) {
                const updated = await updateMutation.mutateAsync({
                    id: editingAsset.id,
                    data: data as Parameters<typeof updateMutation.mutateAsync>[0]['data'],
                })
                if (selectedModelKey) {
                    setSelectedModelKey(getEquipmentModelKey(updated, assetTypes.find(type => type.id === updated.asset_type)))
                    setFilterType(updated.asset_type)
                    setSearchQuery('')
                }
            } else {
                await createMutation.mutateAsync(data as Parameters<typeof createMutation.mutateAsync>[0])
                setSelectedModelKey(null)
                setFilterType(null)
                setSearchQuery('')
                setInventoryMode('types')
            }
            setFormOpen(false)
        } catch (err) {
            setFormError(extractApiError(err, t('assets.saveFailed')))
        }
    }

    const handleDeleteConfirm = async () => {
        if (!assetToDelete) return
        setIsDeleting(true)
        setDeleteError(null)
        try {
            await deleteMutation.mutateAsync(assetToDelete.id)
            setIsDeleteOpen(false)
            setAssetToDelete(null)
        } catch (err) {
            setDeleteError(extractApiError(err, t('ux.inventoryDeleteFailed')))
        } finally {
            setIsDeleting(false)
        }
    }

    const handleReportExport = () => {
        const typeSchemas = new Map(assetTypes.map(at => [at.id, at.schema || []]))
        const allKeys = new Set<string>()
        filteredAssets.forEach(a => {
            const schema = typeSchemas.get(a.asset_type) || []
            schema.forEach(f => allKeys.add(f.key))
        })
        const keyLabel = new Map<string, string>()
        assetTypes.forEach(at => (at.schema || []).forEach(f => {
            if (!keyLabel.has(f.key)) keyLabel.set(f.key, f.label || f.key)
        }))

        const baseCols = [
            { header: t('assets.tableType'), value: (r: Asset) => r.asset_type_name ?? '' },
            ...(isSuperuser ? [{ header: t('assets.tableShipyard'), value: (r: Asset) => r.tenant_name ?? '' }] : []),
            { header: t('assets.createdDate'), value: (r: Asset) => new Date(r.created_at).toLocaleString(locale) },
        ]
        const schemaCols = Array.from(allKeys).map(key => ({
            header: keyLabel.get(key) || key,
            value: (r: Asset) => {
                const v = r.custom_data?.[key]
                if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no')
                return v === undefined || v === null ? '' : String(v)
            },
        }))
        exportReport(filteredAssets, [...baseCols, ...schemaCols], 'assets_report')
    }

    const selectedType = assetTypes.find(type => type.id === filterType)
    const viewType = (group: InventoryModelGroup) => {
        if (group.trackingMode === 'stock' && group.recordCount === 1) {
            const asset = scopedAssets.find(item => getEquipmentModelKey(item, assetTypes.find(type => type.id === item.asset_type)) === group.key)
            if (asset) { setSelectedAsset(asset); setIsDetailOpen(true); return }
        }
        setFilterType(group.assetTypeId); setSelectedModelKey(group.key); setInventoryMode('list')
    }

    return (
        <div className="w-full min-w-0">
            <PageHeader
                title={t(isSuperuser ? 'inventory.centralTitle' : 'inventory.myTitle')}
                subtitle={isSuperuser ? t('inventory.centralSubtitle') : t('inventory.mySubtitle', { name: user?.tenant_name || t('assets.shipyard') })}
                actions={<div className="flex max-w-full flex-wrap gap-2">
                    <Button variant="secondary" icon={<Upload size={16} />} disabled={!canCreate} onClick={() => setIsImportOpen(true)}>{t('assets.importExcel')}</Button>
                    <Button icon={<Plus size={16} />} onClick={openCreate} disabled={!canCreate}>{t('assets.addNew')}</Button>
                    <ActionsMenu onExport={() => setIsExportOpen(true)} onReport={handleReportExport} disabledExport={!assetTypes.length || isBusy || hasLoadError || !hasTenant} disabledReport={filteredAssets.length === 0 || isBusy || hasLoadError || !hasTenant} />
                </div>}
            />
            {hasLoadError && <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><p>{t('ux.inventoryLoadFailed')}</p><Button variant="ghost" size="sm" onClick={() => { void refetchAssets(); void refetchTypes(); if (isSuperuser) void refetchTenants() }}>{t('catalog.retry')}</Button></div>}
            {!isBusy && !hasLoadError && (!hasTenant || assetTypes.length === 0 || (isSuperuser && tenants.length === 0)) && <div role="status" className="mb-5 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">{t(!hasTenant ? 'ux.tenantNeededTitle' : assetTypes.length === 0 ? 'ux.catalogNeededTitle' : 'ux.shipyardNeededTitle')}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t(!hasTenant ? 'ux.tenantNeededHelp' : assetTypes.length === 0 ? isSuperuser ? 'ux.catalogNeededHelp' : 'ux.catalogNeededMemberHelp' : 'ux.shipyardNeededHelp')}</p>{hasTenant && assetTypes.length === 0 && <Link to="/assets/types" className="mt-3 inline-block text-sm font-medium text-blue-700 underline dark:text-blue-300">{t('catalog.goToTypes')}</Link>}</div>}

            {!isBusy && !hasLoadError && hasTenant && inventoryMode === 'types' && <div className="mb-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-slate-200 pb-4 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{summaryLabel(totals)}</p>
                <p className="max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">{t('inventory.scopeHelp')}</p>
                <Link to="/shared-equipment" className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">{t('inventory.discoverShared')} →</Link>
            </div>}

            <div className="mb-6 flex flex-wrap items-center gap-3">
                <div className="relative min-w-0 flex-1 basis-64">
                    <Search size={17} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder={t('assets.searchPlaceholder')} aria-label={t('assets.searchPlaceholder')} className={`${formControlClass} pl-10`} />
                </div>
                {isSuperuser && <select value={filterTenant || ''} aria-label={t('assets.shipyard')} onChange={event => setFilterTenant(event.target.value ? Number(event.target.value) : null)} className={`${formControlClass} w-full sm:w-56`}><option value="">{t('assets.allShipyards')}</option>{tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select>}
                {inventoryMode === 'list' && <select value={filterType || ''} aria-label={t('assets.assetType')} onChange={event => { setFilterType(event.target.value || null); setSelectedModelKey(null) }} className={`${formControlClass} w-full sm:w-52`}><option value="">{t('assets.allTypes')}</option>{assetTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select>}
                {hasFilters && <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={resetFilters}>{t('ux.clearFilters')}</Button>}
                {inventoryMode === 'types' && <Button variant="secondary" size="sm" onClick={() => setInventoryMode('list')}>{t(totals.stockLineCount ? 'inventory.allRecords' : 'inventory.allEquipment')}</Button>}
            </div>

            {!hasLoadError && hasTenant && (isBusy ? <div role="status" className="space-y-3">{[0, 1, 2].map(index => <div key={index} className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900"><span className="sr-only">{t('common.loading')}</span></div>)}</div> : filteredAssets.length === 0 ? <EmptyState icon={<Package size={28} />} title={t('assets.noAssets')} description={hasFilters ? t('assets.changeFilters') : t('inventory.noTypesHelp')} action={hasFilters ? <Button variant="secondary" onClick={resetFilters}>{t('ux.clearFilters')}</Button> : canCreate ? <Button onClick={openCreate} icon={<Plus size={16} />}>{t('assets.addNew')}</Button> : undefined} /> : inventoryMode === 'types' ? <InventoryTypeOverview key={JSON.stringify([filterType, filterTenant, searchQuery])} assets={filteredAssets} assetTypes={assetTypes} onSelect={viewType} filtered={hasFilters} showOwner={isSuperuser} /> : <>
                <div className="mb-5">
                    <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={() => { setFilterType(null); setSelectedModelKey(null); setInventoryMode('types') }}>{t('inventory.backToTypes')}</Button>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-2"><div className="min-w-0"><h2 className="text-xl font-semibold text-slate-900 dark:text-white [overflow-wrap:anywhere]">{selectedModel?.name || selectedType?.name || t(visibleTotals.stockLineCount ? 'inventory.allRecords' : 'inventory.allEquipment')}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t(visibleTotals.stockLineCount ? 'inventory.stockListHelp' : 'inventory.listHelp')}</p></div><span role="status" className="text-lg font-semibold tabular-nums text-slate-700 dark:text-slate-200">{visibleTotals.stockLineCount ? summaryLabel(visibleTotals) : t(searchQuery.trim() ? 'inventory.matchingQuantity' : 'inventory.modelQuantity', { count: filteredAssets.length })}</span></div>
                </div>
                <EquipmentRecordList key={`${selectedModelKey}:${filterType}:${filterTenant}:${searchQuery}`} assets={filteredAssets} assetTypes={assetTypes} showType={!filterType} showModel={!selectedModelKey} showOwner={isSuperuser} canManageSharing={canManageSharing} onDetail={asset => { setSelectedAsset(asset); setIsDetailOpen(true) }} onEdit={openEdit} onDelete={asset => { setDeleteError(null); setAssetToDelete(asset); setIsDeleteOpen(true) }} onSharing={setSharingAsset} />
            </>)}

            <AssetFormModal
                isOpen={formOpen}
                onClose={() => { setFormOpen(false); setFormError(null) }}
                mode={formMode}
                initialTypeId={filterType}
                asset={editingAsset}
                assetTypes={assetTypes}
                tenants={tenants}
                isSuperuser={isSuperuser}
                onSave={handleSave}
                isLoading={createMutation.isPending || updateMutation.isPending}
                error={formError}
            />

            <AssetSharingModal asset={sharingAsset} assetType={assetTypes.find(type => type.id === sharingAsset?.asset_type)} equipmentIdentifier={sharingAsset ? equipmentIdentifier(sharingAsset, assetTypes.find(type => type.id === sharingAsset.asset_type)) : undefined} onClose={() => setSharingAsset(null)} />

            <AssetDetailModal
                asset={selectedAsset}
                assetTypes={assetTypes}
                isOpen={isDetailOpen}
                onClose={() => { setIsDetailOpen(false); setSelectedAsset(null) }}
                onEdit={openEdit}
                onSharing={canManageSharing ? setSharingAsset : undefined}
            />

            <BulkImportWizard
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                assetTypes={assetTypes}
                tenants={tenants}
                isSuperuser={isSuperuser}
                onImported={refetchAssets}
            />

            <ExportDialog
                isOpen={isExportOpen}
                onClose={() => setIsExportOpen(false)}
                assetTypes={assetTypes}
                tenants={tenants}
                isSuperuser={isSuperuser}
            />

            <ConfirmationModal
                isOpen={isDeleteOpen && !!assetToDelete}
                onClose={() => { setIsDeleteOpen(false); setAssetToDelete(null) }}
                onConfirm={handleDeleteConfirm}
                title={t('assets.deleteAsset')}
                message={`${assetToDelete ? `${equipmentIdentifier(assetToDelete, assetTypes.find(type => type.id === assetToDelete.asset_type))} · ${assetToDelete.asset_type_name} · ${assetToDelete.tenant_name}. ` : ''}${t('assets.deleteConfirm')} ${t('assets.deleteWarning')}`}
                confirmText={t('common.delete')}
                type="danger"
                isLoading={isDeleting}
                error={deleteError}
            />
        </div>
    )
}
