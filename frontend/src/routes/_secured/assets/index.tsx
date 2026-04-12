import { useState, useMemo, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
    Package, Plus, Trash2, Save, Eye, Building2, Search,
    ChevronDown, ArrowUpDown, Download, Upload, FileSpreadsheet, CheckCircle, AlertCircle
} from 'lucide-react'
import { useAssetTypes, useAssets, useCreateAsset, useDeleteAsset } from '@/modules/assets'
import { assetsApi, type BulkImportResult } from '@/modules/assets/data'
import { useTenants } from '@/modules/tenants'
import { useAuth } from '@/auth/context'
import type { AssetType, SchemaField, Asset } from '@/modules/assets'
import { Modal } from '@/components/ui/Modal'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_secured/assets/')({
    component: AssetsPage,
})

function AssetDetailModal({
    asset,
    assetTypes,
    isOpen,
    onClose
}: {
    asset: Asset | null;
    assetTypes: AssetType[];
    isOpen: boolean;
    onClose: () => void;
}) {
    const { t, i18n } = useTranslation()
    if (!asset) return null

    const assetType = assetTypes.find(t => t.id === asset.asset_type)
    const schema = assetType?.schema || []
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('assets.detailTitle', { type: assetType?.name || t('assets.title') })}>
            <div className="space-y-4">
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
                                    : (value !== undefined && value !== '' ? String(value) : '-')
                                }
                            </span>
                        </div>
                    )
                })}
                <div className="flex justify-between items-start py-3">
                    <span className="text-sm text-slate-500">{t('assets.createdDate')}</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                        {new Date(asset.created_at).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </span>
                </div>
            </div>
        </Modal>
    )
}

function CreateAssetModal({
    isOpen,
    onClose,
    assetTypes,
    tenants,
    isSuperuser,
    onSave,
    isLoading,
    error
}: {
    isOpen: boolean;
    onClose: () => void;
    assetTypes: AssetType[];
    tenants: { id: number; name: string }[];
    isSuperuser: boolean;
    onSave: (data: { asset_type: string; tenant?: number; custom_data: Record<string, unknown> }) => void;
    isLoading: boolean;
    error: string | null;
}) {
    const { t } = useTranslation()
    const [selectedTypeId, setSelectedTypeId] = useState<string>('')
    const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null)
    const [formData, setFormData] = useState<Record<string, unknown>>({})

    const selectedType = assetTypes.find(t => t.id === selectedTypeId)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedTypeId) return

        const payload: { asset_type: string; tenant?: number; custom_data: Record<string, unknown> } = {
            asset_type: selectedTypeId,
            custom_data: formData
        }

        if (isSuperuser && selectedTenantId) {
            payload.tenant = selectedTenantId
        }

        onSave(payload)
    }

    const handleClose = () => {
        setSelectedTypeId('')
        setSelectedTenantId(null)
        setFormData({})
        onClose()
    }

    const renderField = (field: SchemaField) => {
        const value = formData[field.key] ?? ''
        const baseInputClass = "w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"

        return (
            <div key={field.key}>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>

                {(field.type === 'text' || field.type === 'email' || field.type === 'phone') && (
                    <input
                        type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                        value={value as string}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        className={baseInputClass}
                        placeholder={t('assets.enterField', { field: field.label })}
                    />
                )}

                {field.type === 'number' && (
                    <input
                        type="number"
                        value={value as string}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        className={baseInputClass}
                        placeholder="0"
                    />
                )}

                {field.type === 'date' && (
                    <input
                        type="date"
                        value={value as string}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        className={baseInputClass}
                    />
                )}

                {field.type === 'select' && (
                    <select
                        value={value as string}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        className={baseInputClass}
                    >
                        <option value="">{t('assets.selectPlaceholder')}</option>
                        {field.options?.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                )}

                {field.type === 'checkbox' && (
                    <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!value}
                            onChange={(e) => setFormData({ ...formData, [field.key]: e.target.checked })}
                            className="w-5 h-5 text-green-600 rounded"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">{t('common.yes')}</span>
                    </label>
                )}
            </div>
        )
    }

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={t('assets.createAsset')}>
            <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className={`grid grid-cols-1 ${isSuperuser ? 'md:grid-cols-2' : ''} gap-4 p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl`}>
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                            {t('assets.typeLabel')} <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={selectedTypeId}
                            onChange={(e) => { setSelectedTypeId(e.target.value); setFormData({}); }}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-green-500"
                            required
                        >
                            <option value="">{t('assets.typePlaceholder')}</option>
                            {assetTypes.map((type) => (
                                <option key={type.id} value={type.id}>{type.name}</option>
                            ))}
                        </select>
                    </div>

                    {isSuperuser && (
                        <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                                {t('assets.shipyardLabel')} <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={selectedTenantId || ''}
                                onChange={(e) => setSelectedTenantId(e.target.value ? Number(e.target.value) : null)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-green-500"
                                required
                            >
                                <option value="">{t('assets.shipyardPlaceholder')}</option>
                                {tenants.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {selectedType && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-4 uppercase tracking-wider">
                            {t('assets.fieldInfo', { name: selectedType.name })}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(selectedType.schema || []).map(renderField)}
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                        type="submit"
                        disabled={isLoading || !selectedTypeId || (isSuperuser && !selectedTenantId)}
                        className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        ) : (
                            <>
                                <Save size={18} />
                                {t('common.save')}
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium"
                    >
                        {t('common.cancel')}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

function AssetsPage() {
    const { user } = useAuth()
    const { t, i18n } = useTranslation()
    const { data: assetTypes = [] } = useAssetTypes()
    const { data: tenants = [] } = useTenants()

    const [filterTenant, setFilterTenant] = useState<number | null>(null)
    const [filterType, setFilterType] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
    const [bulkSelectedType, setBulkSelectedType] = useState<string>('')
    const [bulkSelectedTenant, setBulkSelectedTenant] = useState<number | null>(null)
    const [bulkImportResult, setBulkImportResult] = useState<BulkImportResult | null>(null)
    const [isImporting, setIsImporting] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [error, setError] = useState<string | null>(null)

    const { data: assets = [], isLoading, refetch: refetchAssets } = useAssets()
    const createMutation = useCreateAsset()
    const deleteMutation = useDeleteAsset()

    const isSuperuser = user?.is_superuser || false
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    const handleDownloadTemplate = async () => {
        if (!bulkSelectedType) return
        setIsDownloading(true)
        try {
            const blob = await assetsApi.downloadTemplate(bulkSelectedType)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const typeName = assetTypes.find(t => t.id === bulkSelectedType)?.name || 'template'
            a.download = `${typeName.replace(/\s/g, '_')}_template.xlsx`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (err) {
            console.error('Download failed:', err)
            setError(t('assets.templateFailed'))
        } finally {
            setIsDownloading(false)
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !bulkSelectedType) return

        if (isSuperuser && !bulkSelectedTenant) {
            setError(t('assets.shipyardRequired'))
            return
        }

        setIsImporting(true)
        setBulkImportResult(null)
        try {
            const result = await assetsApi.bulkImport(
                file,
                bulkSelectedType,
                isSuperuser ? bulkSelectedTenant! : undefined
            )
            setBulkImportResult(result)
            if (result.success_count > 0) {
                refetchAssets()
            }
        } catch (err: unknown) {
            const errorObj = err as { response?: { data?: { detail?: string } } }
            setError(errorObj.response?.data?.detail || t('assets.importFailed'))
        } finally {
            setIsImporting(false)
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    const handleExportAssets = async () => {
        if (!filterType) {
            setError(t('assets.exportSelectType'))
            return
        }
        try {
            const blob = await assetsApi.exportAssets(filterType, filterTenant || undefined)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const typeName = assetTypes.find((t: AssetType) => t.id === filterType)?.name || 'assets'
            a.download = `${typeName.replace(/\s/g, '_')}_export.xlsx`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (err) {
            console.error('Export failed:', err)
            setError(t('assets.exportFailed'))
        }
    }

    const filteredAssets = useMemo(() => {
        let result = assets

        if (filterType) {
            result = result.filter(a => a.asset_type === filterType)
        }

        if (isSuperuser && filterTenant) {
            result = result.filter(a => a.tenant === filterTenant)
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            result = result.filter(a => {
                const inCustomData = Object.values(a.custom_data).some(val =>
                    String(val).toLowerCase().includes(query)
                )
                const inTypeName = a.asset_type_name?.toLowerCase().includes(query)
                const inTenantName = a.tenant_name?.toLowerCase().includes(query)
                return inCustomData || inTypeName || inTenantName
            })
        }

        return result
    }, [assets, filterType, filterTenant, searchQuery, isSuperuser])

    const handleCreate = async (data: { asset_type: string; tenant?: number; custom_data: Record<string, unknown> }) => {
        try {
            setError(null)
            await createMutation.mutateAsync(data as Parameters<typeof createMutation.mutateAsync>[0])
            setIsCreateModalOpen(false)
        } catch (err: unknown) {
            const errorObj = err as { response?: { data?: Record<string, unknown> } }
            if (errorObj.response?.data) {
                const errData = errorObj.response.data
                if (typeof errData === 'object') {
                    const messages = Object.entries(errData).map(([key, val]) => {
                        if (typeof val === 'object' && val !== null) {
                            return Object.entries(val as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(', ')
                        }
                        return Array.isArray(val) ? val.join(', ') : `${key}: ${val}`
                    }).join('; ')
                    setError(messages)
                }
            } else {
                setError(t('assets.saveFailed'))
            }
        }
    }

    const handleDeleteClick = (asset: Asset) => {
        setAssetToDelete(asset)
        setIsDeleteModalOpen(true)
    }

    const handleDeleteConfirm = async () => {
        if (!assetToDelete) return
        setIsDeleting(true)
        try {
            await deleteMutation.mutateAsync(assetToDelete.id)
            setIsDeleteModalOpen(false)
            setAssetToDelete(null)
        } catch (err) {
            console.error('Failed to delete:', err)
        } finally {
            setIsDeleting(false)
        }
    }

    const handleDeleteCancel = () => {
        setIsDeleteModalOpen(false)
        setAssetToDelete(null)
    }

    return (
        <div className="w-full min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Package size={24} className="text-emerald-500" />
                        {t('assets.title')}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                        {isSuperuser ? t('assets.subtitleSuperuser') : t('assets.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportAssets}
                        disabled={!filterType}
                        className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-medium flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        title={filterType ? t('assets.exportTooltip') : t('assets.exportSelectType')}
                    >
                        <Download size={16} />
                        {t('assets.exportBtn')}
                    </button>
                    <button
                        onClick={() => setIsBulkModalOpen(true)}
                        className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-medium flex items-center gap-2 text-sm"
                    >
                        <Upload size={16} />
                        {t('common.bulkImport')}
                    </button>
                    {assets.length > 0 && (
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-medium flex items-center gap-2 text-sm"
                        >
                            <Plus size={16} />
                            {t('assets.addNew')}
                        </button>
                    )}
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('assets.searchPlaceholder')}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="min-w-[180px]">
                        <div className="relative">
                            <Package size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <select
                                value={filterType || ''}
                                onChange={(e) => setFilterType(e.target.value || null)}
                                className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm appearance-none focus:ring-2 focus:ring-green-500"
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
                                    className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm appearance-none focus:ring-2 focus:ring-green-500"
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
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        <button className="flex items-center gap-1 hover:text-slate-700">
                                            {t('assets.tableType')}
                                            <ArrowUpDown size={12} />
                                        </button>
                                    </th>
                                    {isSuperuser && (
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                            {t('assets.tableShipyard')}
                                        </th>
                                    )}
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        {t('assets.tableDetails')}
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        {t('assets.tableDate')}
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        {t('assets.tableActions')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredAssets.length > 0 ? (
                                    filteredAssets.map((asset) => {
                                        const assetType = assetTypes.find(t => t.id === asset.asset_type)
                                        const schema = assetType?.schema || []
                                        const summaryFields = schema.slice(0, 2)
                                        const summaryText = summaryFields
                                            .map(f => asset.custom_data[f.key])
                                            .filter(v => v !== undefined && v !== '')
                                            .join(' • ')

                                        return (
                                            <tr key={asset.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 rounded-lg">
                                                        <Package size={14} />
                                                        {asset.asset_type_name}
                                                    </span>
                                                </td>
                                                {isSuperuser && (
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded-lg">
                                                            <Building2 size={12} />
                                                            {asset.tenant_name}
                                                        </span>
                                                    </td>
                                                )}
                                                <td className="px-4 py-3 text-sm text-slate-900 dark:text-white max-w-md truncate">
                                                    {summaryText || <span className="text-slate-400">-</span>}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-500">
                                                    {new Date(asset.created_at).toLocaleDateString(locale)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => { setSelectedAsset(asset); setIsDetailModalOpen(true); }}
                                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                            title={t('assets.detail')}
                                                        >
                                                            <Eye size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteClick(asset)}
                                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                            title={t('common.delete')}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={isSuperuser ? 5 : 4} className="px-4 py-16 text-center">
                                            <Package size={48} className="mx-auto mb-4 text-slate-200" />
                                            <p className="text-slate-400 font-medium">{t('assets.noAssets')}</p>
                                            <p className="text-slate-400 text-sm mt-1">
                                                {searchQuery || filterType || filterTenant
                                                    ? t('assets.changeFilters')
                                                    : t('assets.addFirstAssetHint')
                                                }
                                            </p>
                                            {!searchQuery && !filterType && !filterTenant && (
                                                <button
                                                    onClick={() => setIsCreateModalOpen(true)}
                                                    className="mt-4 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-medium inline-flex items-center gap-2 text-sm"
                                                >
                                                    <Plus size={16} />
                                                    {t('assets.addNew')}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            <CreateAssetModal
                isOpen={isCreateModalOpen}
                onClose={() => { setIsCreateModalOpen(false); setError(null); }}
                assetTypes={assetTypes}
                tenants={tenants}
                isSuperuser={isSuperuser}
                onSave={handleCreate}
                isLoading={createMutation.isPending}
                error={error}
            />

            {/* Detail Modal */}
            <AssetDetailModal
                asset={selectedAsset}
                assetTypes={assetTypes}
                isOpen={isDetailModalOpen}
                onClose={() => { setIsDetailModalOpen(false); setSelectedAsset(null); }}
            />

            {/* Bulk Import Modal */}
            <Modal
                isOpen={isBulkModalOpen}
                onClose={() => {
                    setIsBulkModalOpen(false);
                    setBulkSelectedType('');
                    setBulkSelectedTenant(null);
                    setBulkImportResult(null);
                    setError(null);
                }}
                title={t('assets.bulkImportTitle')}
            >
                <div className="space-y-6">
                    <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                        <div className="flex items-center gap-2 mb-3">
                            <FileSpreadsheet size={20} className="text-blue-600" />
                            <h3 className="font-semibold text-slate-900 dark:text-white">1. {t('assets.bulkStep1')}</h3>
                        </div>
                        <div className={`grid grid-cols-1 ${isSuperuser ? 'md:grid-cols-2' : ''} gap-4`}>
                            <select
                                value={bulkSelectedType}
                                onChange={(e) => { setBulkSelectedType(e.target.value); setBulkImportResult(null); }}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">{t('assets.selectAssetType')}</option>
                                {assetTypes.map((type) => (
                                    <option key={type.id} value={type.id}>{type.name}</option>
                                ))}
                            </select>
                            {isSuperuser && (
                                <select
                                    value={bulkSelectedTenant || ''}
                                    onChange={(e) => setBulkSelectedTenant(e.target.value ? Number(e.target.value) : null)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">{t('assets.selectShipyardPlaceholder')}</option>
                                    {tenants.map((tenant) => (
                                        <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    {bulkSelectedType && (
                        <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-100 dark:border-green-800">
                            <div className="flex items-center gap-2 mb-3">
                                <Download size={20} className="text-green-600" />
                                <h3 className="font-semibold text-slate-900 dark:text-white">2. {t('assets.bulkStep2')}</h3>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                                {t('assets.templateDesc')}
                            </p>
                            <button
                                onClick={handleDownloadTemplate}
                                disabled={isDownloading}
                                className="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                            >
                                {isDownloading ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <Download size={18} />
                                )}
                                {t('assets.downloadTemplate')}
                            </button>
                        </div>
                    )}

                    {bulkSelectedType && (!isSuperuser || bulkSelectedTenant) && (
                        <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl border border-purple-100 dark:border-purple-800">
                            <div className="flex items-center gap-2 mb-3">
                                <Upload size={20} className="text-purple-600" />
                                <h3 className="font-semibold text-slate-900 dark:text-white">3. {t('assets.bulkStep3')}</h3>
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept=".xlsx,.xls"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isImporting}
                                className="w-full px-4 py-4 border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-xl hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors flex flex-col items-center gap-2"
                            >
                                {isImporting ? (
                                    <>
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                                        <span className="text-sm text-purple-600 font-medium">{t('assets.importing')}</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={32} className="text-purple-400" />
                                        <span className="text-sm text-slate-600 dark:text-slate-400">{t('assets.selectFile')}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {bulkImportResult && (
                        <div className={`p-4 rounded-xl border ${bulkImportResult.error_count > 0 ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                            <div className="flex items-start gap-3">
                                {bulkImportResult.error_count > 0 ? (
                                    <AlertCircle size={24} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                                ) : (
                                    <CheckCircle size={24} className="text-green-600 flex-shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1">
                                    <h4 className="font-semibold text-slate-900 dark:text-white mb-1">{bulkImportResult.message}</h4>
                                    <div className="flex gap-4 text-sm">
                                        <span className="text-green-600 font-medium">✓ {bulkImportResult.success_count} {t('bulkImport.successCount')}</span>
                                        {bulkImportResult.error_count > 0 && (
                                            <span className="text-red-600 font-medium">✗ {bulkImportResult.error_count} {t('bulkImport.errorCount')}</span>
                                        )}
                                    </div>
                                    {bulkImportResult.errors.length > 0 && (
                                        <div className="mt-3 max-h-32 overflow-y-auto">
                                            {bulkImportResult.errors.map((err, idx) => (
                                                <div key={idx} className="text-sm text-red-600 py-1 border-t border-red-100 dark:border-red-900 first:border-0">
                                                    {t('bulkImport.row')} {err.row}: {err.errors.join(', ')}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={isDeleteModalOpen && !!assetToDelete}
                onClose={handleDeleteCancel}
                onConfirm={handleDeleteConfirm}
                title={t('assets.deleteAsset')}
                message={`${t('assets.deleteConfirm')} ${t('assets.deleteWarning')}`}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                type="danger"
                isLoading={isDeleting}
            />
        </div>
    )
}
