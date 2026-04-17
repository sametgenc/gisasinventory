import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
    Package, Plus, Trash2, Eye, Pencil, Building2, Search,
    ChevronDown, Download, Upload, FileSpreadsheet, CheckCircle, AlertCircle,
    X, KeyRound, RefreshCw, MoreHorizontal, Check,
} from 'lucide-react'
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
    Badge,
    DataTable,
    EmptyState,
    formControlClass,
    type ColumnDef,
} from '@/components/ui'
import { AssetFormModal, type AssetFormPayload } from '@/components/assets/AssetFormModal'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_secured/assets/')({
    component: AssetsPage,
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type Tenant = { id: number; name: string }

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

function AssetDetailModal({ asset, assetTypes, isOpen, onClose }: {
    asset: Asset | null
    assetTypes: AssetType[]
    isOpen: boolean
    onClose: () => void
}) {
    const { t, i18n } = useTranslation()
    if (!asset) return null

    const assetType = assetTypes.find(at => at.id === asset.asset_type)
    const schema = assetType?.schema || []
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('assets.detailTitle', { type: assetType?.name || t('assets.title') })}>
            <div className="space-y-1">
                <div className="flex justify-between items-start py-3 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-sm text-slate-500">{t('assets.assetType')}</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{asset.asset_type_name}</span>
                </div>
                {asset.tenant_name && (
                    <div className="flex justify-between items-start py-3 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-sm text-slate-500">{t('assets.shipyard')}</span>
                        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">{asset.tenant_name}</span>
                    </div>
                )}
                {schema.map((field) => {
                    const value = asset.custom_data[field.key]
                    return (
                        <div key={field.key} className="flex justify-between items-start py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <span className="text-sm text-slate-500">{field.label}</span>
                            <span className="text-sm font-medium text-slate-900 dark:text-white text-right">
                                {field.type === 'checkbox'
                                    ? (value ? `✓ ${t('common.yes')}` : `✗ ${t('common.no')}`)
                                    : (value !== undefined && value !== '' ? String(value) : '-')}
                            </span>
                        </div>
                    )
                })}
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
        <Modal isOpen={isOpen} onClose={onClose} title={t('assets.exportDialog.title')} size="md">
            <div className="space-y-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('assets.exportDialog.description')}</p>
                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

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

                <FormFooter
                    primaryLabel={t('assets.exportDialog.downloadList')}
                    icon={<Download size={16} />}
                    loading={downloading === 'list'}
                    disabled={!typeId}
                    onPrimary={() => runDownload('list')}
                    onCancel={onClose}
                />
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
    const [skipRows, setSkipRows] = useState<string[]>(['TOPLAM', 'GENEL TOPLAM', 'TOTAL'])
    const [skipInput, setSkipInput] = useState('')
    const [previewing, setPreviewing] = useState(false)
    const [preview, setPreview] = useState<ImportPreview | null>(null)
    const [assetTypeId, setAssetTypeId] = useState('')
    const [mapping, setMapping] = useState<ColumnMapping>({})
    /** Keys of headers that were auto-matched so we can display a confidence mark. */
    const [autoMatched, setAutoMatched] = useState<Set<string>>(new Set())
    const [importing, setImporting] = useState(false)
    const [templateResult, setTemplateResult] = useState<BulkImportResult | null>(null)
    const [rawResult, setRawResult] = useState<RawImportResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const reset = useCallback(() => {
        setStep(1); setFile(null); setTenantId(null); setHeaderRow(1)
        setSkipRows(['TOPLAM', 'GENEL TOPLAM', 'TOTAL']); setSkipInput('')
        setPreview(null); setAssetTypeId(''); setMapping({}); setAutoMatched(new Set())
        setTemplateResult(null); setRawResult(null); setError(null)
        setPreviewing(false); setImporting(false); setDragOver(false)
    }, [])

    useEffect(() => { if (!isOpen) reset() }, [isOpen, reset])

    const selectedAssetType = assetTypes.find(at => at.id === assetTypeId)
    const uniqueKeyField = selectedAssetType?.schema?.find(f => f.is_unique_key)
    const isTemplate = !!preview?.detected_template
    const needsTenant = isSuperuser

    const pickFile = (f: File | null) => {
        setFile(f); setPreview(null); setError(null); setAssetTypeId('')
        setMapping({}); setAutoMatched(new Set())
    }

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) pickFile(f)
    }

    const runPreview = async () => {
        if (!file) return
        if (needsTenant && !tenantId) { setError(t('assets.shipyardRequired')); return }
        setPreviewing(true); setError(null)
        try {
            const res = await assetsApi.previewImport(file, headerRow)
            setPreview(res)
            if (res.detected_template) {
                setAssetTypeId(res.detected_template.asset_type_id)
            } else if (assetTypes.length === 1) {
                setAssetTypeId(assetTypes[0].id)
            }
            setStep(2)
        } catch (err) {
            setError(extractApiError(err, t('assets.wizard.uploadFailed')))
        } finally {
            setPreviewing(false)
        }
    }

    // Auto-map columns once preview + asset type are available
    useEffect(() => {
        if (!preview || !selectedAssetType || isTemplate) return
        const schema = selectedAssetType.schema || []
        const next: ColumnMapping = {}
        const matches = new Set<string>()
        for (const h of preview.headers) {
            const found = schema.find(f => f.label.toLowerCase() === h.toLowerCase())
            next[h] = found ? found.key : null
            if (found) matches.add(h)
        }
        setMapping(next)
        setAutoMatched(matches)
    }, [preview, selectedAssetType, isTemplate])

    const runImport = async () => {
        if (!file || !assetTypeId) return
        if (needsTenant && !tenantId) { setError(t('assets.shipyardRequired')); return }
        setImporting(true); setError(null)
        try {
            if (isTemplate) {
                const res = await assetsApi.bulkImport(file, assetTypeId, tenantId || undefined)
                setTemplateResult(res)
            } else {
                const res = await assetsApi.rawImport(
                    file, assetTypeId, mapping, tenantId || undefined, headerRow, skipRows,
                )
                setRawResult(res)
            }
            setStep(3)
            onImported()
        } catch (err) {
            setError(extractApiError(err, t('assets.importFailed')))
        } finally {
            setImporting(false)
        }
    }

    const addSkipRow = () => {
        const v = skipInput.trim()
        if (v && !skipRows.includes(v)) setSkipRows([...skipRows, v])
        setSkipInput('')
    }

    const summary = (() => {
        if (rawResult) return rawResult
        if (templateResult) return {
            created_count: templateResult.success_count,
            updated_count: 0,
            skipped_count: 0,
            error_count: templateResult.error_count,
            errors: templateResult.errors,
            message: templateResult.message,
        }
        return null
    })()

    const steps: { n: WizardStep; label: string }[] = [
        { n: 1, label: t('assets.wizard.stepFile') },
        { n: 2, label: t('assets.wizard.stepPreview') },
        { n: 3, label: t('assets.wizard.stepResult') },
    ]

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('assets.bulkImportTitle')} size="xl">
            <div className="space-y-5">
                {/* Stepper */}
                <div className="flex items-center gap-2">
                    {steps.map((s, i) => {
                        const active = step === s.n
                        const done = step > s.n
                        return (
                            <div key={s.n} className="flex items-center gap-2 flex-1 min-w-0">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors ${active
                                    ? 'bg-blue-600 text-white'
                                    : done
                                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                    }`}>
                                    {done ? <CheckCircle size={12} /> : <span>{s.n}</span>}
                                    <span>{s.label}</span>
                                </div>
                                {i < steps.length - 1 && <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />}
                            </div>
                        )
                    })}
                </div>

                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
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
                            <input type="file" ref={fileInputRef} accept=".xlsx,.xls" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} className="hidden" />
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={onDrop}
                                className={`w-full px-4 py-6 rounded-lg border-2 border-dashed cursor-pointer flex flex-col items-center gap-2 transition-colors ${file
                                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                                    : dragOver
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                                    }`}
                            >
                                <FileSpreadsheet size={28} className={file ? 'text-blue-500' : 'text-slate-400'} />
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

                        <FormSection layout="grid">
                            <FormField label={t('assets.wizard.headerRow')} help={t('assets.wizard.headerRowHelp')}>
                                <input
                                    type="number"
                                    min={1}
                                    value={headerRow}
                                    onChange={(e) => setHeaderRow(Number(e.target.value) || 1)}
                                    className={formControlClass}
                                />
                            </FormField>
                            <FormField label={t('assets.wizard.skipRows')} help={t('assets.wizard.skipRowsHelp')}>
                                <div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={skipInput}
                                            onChange={(e) => setSkipInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkipRow() } }}
                                            placeholder="TOPLAM"
                                            className={formControlClass}
                                        />
                                        <Button type="button" variant="secondary" size="md" onClick={addSkipRow}>
                                            +
                                        </Button>
                                    </div>
                                    {skipRows.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {skipRows.map(r => (
                                                <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs">
                                                    {r}
                                                    <button type="button" onClick={() => setSkipRows(skipRows.filter(x => x !== r))} className="hover:text-red-500"><X size={10} /></button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </FormField>
                        </FormSection>

                        <FormFooter
                            primaryLabel={t('assets.wizard.previewAction')}
                            icon={null}
                            onPrimary={runPreview}
                            loading={previewing}
                            disabled={!file || (needsTenant && !tenantId)}
                            onCancel={onClose}
                        />
                    </div>
                )}

                {/* ── STEP 2: Mapping + preview ─────────────────────────── */}
                {step === 2 && preview && (
                    <div className="space-y-4">
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
                                                count: preview.total_rows,
                                            })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <FormSection title={t('assets.fields.generalInfo')}>
                                <FormField label={t('assets.typeLabel')} required>
                                    <select value={assetTypeId} onChange={(e) => setAssetTypeId(e.target.value)} className={formControlClass} required>
                                        <option value="">{t('assets.typePlaceholder')}</option>
                                        {assetTypes.map((type) => (
                                            <option key={type.id} value={type.id}>{type.name}</option>
                                        ))}
                                    </select>
                                </FormField>
                            </FormSection>
                        )}

                        {uniqueKeyField && !isTemplate && (
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
                                            {preview.headers.map((header) => {
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
                                                            value={mapped}
                                                            onChange={(e) => {
                                                                setMapping({ ...mapping, [header]: e.target.value || null })
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
                                                                <option key={f.key} value={f.key}>
                                                                    {f.label} ({f.type})
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

                        <FormFooter
                            primaryLabel={isTemplate ? t('assets.wizard.runTemplateImport') : t('assets.wizard.importAction')}
                            icon={<Upload size={16} />}
                            loading={importing}
                            disabled={!assetTypeId}
                            onPrimary={runImport}
                            onCancel={() => setStep(1)}
                            cancelLabel={t('assets.wizard.back')}
                        />
                    </div>
                )}

                {/* ── STEP 3: Result ───────────────────────────────────── */}
                {step === 3 && summary && (
                    <div className="space-y-4">
                        <div className={`p-4 rounded-lg border ${summary.error_count > 0 && summary.created_count + summary.updated_count === 0
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            : summary.error_count > 0
                                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                                : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                            }`}>
                            <div className="flex items-start gap-3">
                                {summary.error_count > 0
                                    ? <AlertCircle size={22} className="text-amber-600 shrink-0 mt-0.5" />
                                    : <CheckCircle size={22} className="text-emerald-600 shrink-0 mt-0.5" />}
                                <div className="flex-1">
                                    <p className="font-semibold text-slate-900 dark:text-white mb-3">{summary.message}</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                                            <p className="text-xl font-bold text-emerald-600">{summary.created_count}</p>
                                            <p className="text-xs text-slate-500">{t('assets.wizard.created')}</p>
                                        </div>
                                        <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                                            <p className="text-xl font-bold text-blue-600">{summary.updated_count}</p>
                                            <p className="text-xs text-slate-500">{t('assets.wizard.updated')}</p>
                                        </div>
                                        <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                                            <p className="text-xl font-bold text-amber-500">{summary.skipped_count}</p>
                                            <p className="text-xs text-slate-500">{t('assets.wizard.skipped')}</p>
                                        </div>
                                        <div className="text-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                                            <p className="text-xl font-bold text-red-500">{summary.error_count}</p>
                                            <p className="text-xs text-slate-500">{t('assets.wizard.errors')}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {summary.errors.length > 0 && (
                            <div className="max-h-40 overflow-y-auto border border-red-100 dark:border-red-900 rounded-lg divide-y divide-red-100 dark:divide-red-900">
                                {summary.errors.map((err, idx) => (
                                    <div key={idx} className="px-3 py-2 text-sm text-red-600 dark:text-red-400">
                                        <span className="font-medium">{t('assets.row')} {err.row}:</span> {err.errors.join(', ')}
                                    </div>
                                ))}
                            </div>
                        )}

                        <FormFooter
                            primaryLabel={t('assets.wizard.newImport')}
                            icon={<RefreshCw size={16} />}
                            onPrimary={reset}
                            onCancel={onClose}
                            cancelLabel={t('assets.wizard.close')}
                        />
                    </div>
                )}
            </div>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Import preview table — uses shared DataTable with pagination & column badges
// ─────────────────────────────────────────────────────────────────────────────

type PreviewRow = { _idx: number; cells: string[] }

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
        () => preview.preview_rows.map((cells, idx) => ({ _idx: idx, cells })),
        [preview.preview_rows],
    )

    const columns: ColumnDef<PreviewRow>[] = useMemo(() => {
        return preview.headers.map((header, colIndex) => {
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
    }, [preview.headers, mapping, schema, t])

    return (
        <DataTable
            data={rows}
            columns={columns}
            getRowId={(r) => r._idx}
            pageSize={10}
            pageSizeOptions={[10, 25, 50]}
        />
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions menu
// ─────────────────────────────────────────────────────────────────────────────

function ActionsMenu({ onImport, onExport }: { onImport: () => void; onExport: () => void }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const btnRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (!menuRef.current || !btnRef.current) return
            if (!menuRef.current.contains(e.target as Node) && !btnRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    return (
        <div className="relative">
            <Button
                ref={btnRef}
                variant="secondary"
                onClick={() => setOpen(v => !v)}
                aria-label={t('assets.moreActions')}
                title={t('assets.moreActions')}
                icon={<MoreHorizontal size={16} />}
            >
                <span className="sr-only">{t('assets.moreActions')}</span>
            </Button>
            {open && (
                <div ref={menuRef} className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-1 z-10 animate-dropdown">
                    <button
                        onClick={() => { setOpen(false); onImport() }}
                        className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                    >
                        <Upload size={14} className="text-blue-500" />
                        {t('assets.importExcel')}
                    </button>
                    <button
                        onClick={() => { setOpen(false); onExport() }}
                        className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                    >
                        <Download size={14} className="text-emerald-500" />
                        {t('assets.exportExcel')}
                    </button>
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function AssetsPage() {
    const { user } = useAuth()
    const { t, i18n } = useTranslation()
    const { data: assetTypes = [] } = useAssetTypes()
    const { data: tenants = [] } = useTenants()

    const [filterTenant, setFilterTenant] = useState<number | null>(null)
    const [filterType, setFilterType] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    const [formOpen, setFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
    const [formError, setFormError] = useState<string | null>(null)

    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)

    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const [isImportOpen, setIsImportOpen] = useState(false)
    const [isExportOpen, setIsExportOpen] = useState(false)

    const { data: assets = [], isLoading, refetch: refetchAssets } = useAssets()
    const createMutation = useCreateAsset()
    const updateMutation = useUpdateAsset()
    const deleteMutation = useDeleteAsset()

    const isSuperuser = user?.is_superuser || false
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    const filteredAssets = useMemo(() => {
        let result = assets
        if (filterType) result = result.filter(a => a.asset_type === filterType)
        if (isSuperuser && filterTenant) result = result.filter(a => a.tenant === filterTenant)
        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            result = result.filter(a =>
                Object.values(a.custom_data).some(v => String(v).toLowerCase().includes(q))
                || a.asset_type_name?.toLowerCase().includes(q)
                || a.tenant_name?.toLowerCase().includes(q)
            )
        }
        return result
    }, [assets, filterType, filterTenant, searchQuery, isSuperuser])

    const openCreate = () => {
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
                await updateMutation.mutateAsync({
                    id: editingAsset.id,
                    data: data as Parameters<typeof updateMutation.mutateAsync>[0]['data'],
                })
            } else {
                await createMutation.mutateAsync(data as Parameters<typeof createMutation.mutateAsync>[0])
            }
            setFormOpen(false)
        } catch (err) {
            setFormError(extractApiError(err, t('assets.saveFailed')))
        }
    }

    const handleDeleteConfirm = async () => {
        if (!assetToDelete) return
        setIsDeleting(true)
        try {
            await deleteMutation.mutateAsync(assetToDelete.id)
            setIsDeleteOpen(false)
            setAssetToDelete(null)
        } finally {
            setIsDeleting(false)
        }
    }

    // DataTable columns
    const columns: ColumnDef<Asset>[] = useMemo(() => {
        const cols: ColumnDef<Asset>[] = [
            {
                key: 'type',
                header: t('assets.tableType'),
                sortable: true,
                sortAccessor: (r) => r.asset_type_name ?? '',
                cell: (asset) => (
                    <Badge variant="info" icon={<Package size={12} />}>
                        {asset.asset_type_name}
                    </Badge>
                ),
            },
        ]
        if (isSuperuser) {
            cols.push({
                key: 'shipyard',
                header: t('assets.tableShipyard'),
                sortable: true,
                sortAccessor: (r) => r.tenant_name ?? '',
                cell: (asset) => (
                    <Badge variant="purple" icon={<Building2 size={11} />}>
                        {asset.tenant_name}
                    </Badge>
                ),
            })
        }
        cols.push({
            key: 'details',
            header: t('assets.tableDetails'),
            cell: (asset) => {
                const assetType = assetTypes.find(at => at.id === asset.asset_type)
                const schema = assetType?.schema || []
                const summaryText = schema.slice(0, 2)
                    .map(f => asset.custom_data[f.key])
                    .filter(v => v !== undefined && v !== '')
                    .join(' • ')
                return (
                    <span className="text-sm text-slate-900 dark:text-white block max-w-md truncate">
                        {summaryText || <span className="text-slate-400">—</span>}
                    </span>
                )
            },
        })
        cols.push({
            key: 'date',
            header: t('assets.tableDate'),
            sortable: true,
            sortAccessor: (r) => new Date(r.created_at),
            cell: (asset) => (
                <span className="text-sm text-slate-500">
                    {new Date(asset.created_at).toLocaleDateString(locale)}
                </span>
            ),
        })
        cols.push({
            key: 'actions',
            header: '',
            align: 'right',
            cell: (asset) => (
                <div className="flex items-center justify-end gap-1">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedAsset(asset); setIsDetailOpen(true) }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        title={t('assets.detail')}
                    >
                        <Eye size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEdit(asset) }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        title={t('common.edit')}
                    >
                        <Pencil size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setAssetToDelete(asset); setIsDeleteOpen(true) }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                        title={t('common.delete')}
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            ),
        })
        return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetTypes, isSuperuser, locale, t])

    return (
        <div className="w-full min-w-0">
            <PageHeader
                icon={<Package size={22} />}
                title={t('assets.title')}
                subtitle={isSuperuser ? t('assets.subtitleSuperuser') : t('assets.subtitle')}
                actions={
                    <>
                        <ActionsMenu onImport={() => setIsImportOpen(true)} onExport={() => setIsExportOpen(true)} />
                        <Button icon={<Plus size={16} />} onClick={openCreate}>
                            {t('assets.addNew')}
                        </Button>
                    </>
                }
            />

            {/* Filters */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('assets.searchPlaceholder')}
                                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div className="min-w-[180px]">
                        <div className="relative">
                            <Package size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <select
                                value={filterType || ''}
                                onChange={(e) => setFilterType(e.target.value || null)}
                                className="w-full pl-10 pr-8 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm appearance-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">{t('assets.allTypes')}</option>
                                {assetTypes.map((type) => (
                                    <option key={type.id} value={type.id}>{type.name}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                    {isSuperuser && (
                        <div className="min-w-[180px]">
                            <div className="relative">
                                <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <select
                                    value={filterTenant || ''}
                                    onChange={(e) => setFilterTenant(e.target.value ? Number(e.target.value) : null)}
                                    className="w-full pl-10 pr-8 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm appearance-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">{t('assets.allShipyards')}</option>
                                    {tenants.map((tenant) => (
                                        <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <DataTable
                data={filteredAssets}
                columns={columns}
                isLoading={isLoading}
                getRowId={(r) => r.id}
                initialSort={{ key: 'date', direction: 'desc' }}
                pageSize={25}
                emptyState={
                    <EmptyState
                        icon={<Package size={40} />}
                        title={t('assets.noAssets')}
                        description={
                            searchQuery || filterType || filterTenant
                                ? t('assets.changeFilters')
                                : t('assets.addFirstAssetHint')
                        }
                        action={
                            !searchQuery && !filterType && !filterTenant && (
                                <Button icon={<Plus size={14} />} size="sm" onClick={openCreate}>
                                    {t('assets.addNew')}
                                </Button>
                            )
                        }
                    />
                }
            />

            <AssetFormModal
                isOpen={formOpen}
                onClose={() => { setFormOpen(false); setFormError(null) }}
                mode={formMode}
                asset={editingAsset}
                assetTypes={assetTypes}
                tenants={tenants}
                isSuperuser={isSuperuser}
                onSave={handleSave}
                isLoading={createMutation.isPending || updateMutation.isPending}
                error={formError}
            />

            <AssetDetailModal
                asset={selectedAsset}
                assetTypes={assetTypes}
                isOpen={isDetailOpen}
                onClose={() => { setIsDetailOpen(false); setSelectedAsset(null) }}
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
                message={`${t('assets.deleteConfirm')} ${t('assets.deleteWarning')}`}
                confirmText={t('common.delete')}
                type="danger"
                isLoading={isDeleting}
            />
        </div>
    )
}
