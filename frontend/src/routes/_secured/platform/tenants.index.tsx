import { useState, useRef } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    Building2, Plus, Pencil, Trash2, Ship, Users,
    MapPin, Phone, Mail, FileText, Search, Eye,
    Upload, Download, CheckCircle, AlertCircle, ArrowRight
} from 'lucide-react'
import {
    useTenants, useCreateTenant, useUpdateTenant, useDeleteTenant,
    tenantsApi
} from '@/modules/tenants'
import type { Tenant, TenantUpdateInput } from '@/modules/tenants'
import type { BulkImportResult } from '@/modules/tenants/data'
import { Modal } from '@/components/ui/Modal'
import { useTranslation } from 'react-i18next'
import { TenantFormModal } from '@/components/tenants/TenantFormModal'

export const Route = createFileRoute('/_secured/platform/tenants/')({
    component: TenantsPage,
})

function TenantsPage() {
    const { t } = useTranslation()
    const { data: tenants, isLoading, error } = useTenants()
    const createMutation = useCreateTenant()
    const updateMutation = useUpdateTenant()
    const deleteMutation = useDeleteTenant()

    const [searchQuery, setSearchQuery] = useState('')
    const [isFormModalOpen, setIsFormModalOpen] = useState(false)
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)

    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
    const [bulkImportType, setBulkImportType] = useState<'tenants' | 'users'>('tenants')
    const [bulkImportResult, setBulkImportResult] = useState<BulkImportResult | null>(null)
    const [isImporting, setIsImporting] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const filteredTenants = tenants?.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchQuery.toLowerCase())
    ) || []

    const handleCreate = () => {
        setEditingTenant(null)
        setIsFormModalOpen(true)
    }

    const handleEdit = (tenant: Tenant) => {
        setEditingTenant(tenant)
        setIsFormModalOpen(true)
    }

    const handleSave = async (data: TenantUpdateInput) => {
        try {
            if (editingTenant) {
                await updateMutation.mutateAsync({ slug: editingTenant.slug, data })
            } else {
                await createMutation.mutateAsync({ name: data.name! })
            }
            setIsFormModalOpen(false)
            setEditingTenant(null)
        } catch (err) {
            console.error('Failed to save tenant:', err)
        }
    }

    const handleDelete = async (tenant: Tenant) => {
        if (!confirm(t('tenants.deleteConfirm', { name: tenant.name }))) return
        try {
            await deleteMutation.mutateAsync(tenant.slug)
        } catch (err) {
            console.error('Failed to delete tenant:', err)
        }
    }

    const handleDownloadTemplate = async (type: 'tenants' | 'users') => {
        setIsDownloading(true)
        try {
            const blob = type === 'tenants'
                ? await tenantsApi.downloadTenantsTemplate()
                : await tenantsApi.downloadUsersTemplate()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = type === 'tenants' ? 'shipyard_template.xlsx' : 'users_template.xlsx'
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (err) {
            console.error('Template download failed:', err)
        } finally {
            setIsDownloading(false)
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsImporting(true)
        setBulkImportResult(null)
        try {
            const result = bulkImportType === 'tenants'
                ? await tenantsApi.bulkImportTenants(file)
                : await tenantsApi.bulkImportUsers(file)
            setBulkImportResult(result)
        } catch (err) {
            console.error('Import failed:', err)
            setBulkImportResult({ message: t('tenants.importFailed'), success_count: 0, error_count: 1, errors: [] })
        } finally {
            setIsImporting(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleExport = async (type: 'tenants' | 'users') => {
        try {
            const blob = type === 'tenants'
                ? await tenantsApi.exportTenants()
                : await tenantsApi.exportUsers()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = type === 'tenants' ? 'shipyards_export.xlsx' : 'users_export.xlsx'
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (err) {
            console.error('Export failed:', err)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-2xl text-red-700 dark:text-red-300">
                {t('tenants.loadError')}
            </div>
        )
    }

    return (
        <div className="w-full min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Building2 size={24} className="text-sky-500" />
                        {t('tenants.title')}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                        {t('tenants.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleExport('tenants')}
                        className="px-3 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-medium flex items-center gap-2 text-sm"
                    >
                        <Download size={16} />
                        {t('tenants.exportTenants')}
                    </button>
                    <button
                        onClick={() => handleExport('users')}
                        className="px-3 py-2.5 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-xl hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors font-medium flex items-center gap-2 text-sm"
                    >
                        <Download size={16} />
                        {t('tenants.exportUsers')}
                    </button>
                    <button
                        onClick={() => { setIsBulkModalOpen(true); setBulkImportResult(null); }}
                        className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors font-medium flex items-center gap-2 text-sm"
                    >
                        <Upload size={16} />
                        {t('common.bulkImport')}
                    </button>
                    <button
                        onClick={handleCreate}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 text-sm shadow-sm shadow-blue-500/20"
                    >
                        <Plus size={16} />
                        {t('tenants.addNew')}
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
                <div className="relative max-w-md">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('tenants.searchPlaceholder')}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Tenants Grid */}
            {filteredTenants.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTenants.map((tenant) => (
                        <div key={tenant.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800/50 transition-all group">
                            <div className="p-5">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                                            <Ship size={22} className="text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-slate-900 dark:text-white">{tenant.name}</h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{tenant.slug}</p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${tenant.is_active
                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                    }`}>
                                        {tenant.is_active ? t('common.active') : t('common.inactive')}
                                    </span>
                                </div>

                                {tenant.description && (
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
                                        <FileText size={12} className="inline mr-1 text-slate-400" />
                                        {tenant.description}
                                    </p>
                                )}

                                <div className="space-y-1.5 mb-4">
                                    {tenant.phone && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                            <Phone size={12} className="text-slate-400" />
                                            {tenant.phone}
                                        </p>
                                    )}
                                    {tenant.email && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                            <Mail size={12} className="text-slate-400" />
                                            {tenant.email}
                                        </p>
                                    )}
                                    {tenant.address && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                            <MapPin size={12} className="text-slate-400" />
                                            <span className="line-clamp-1">{tenant.address}</span>
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-lg">
                                        <Users size={14} />
                                        {tenant.user_count} {t('tenants.users')}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleEdit(tenant)}
                                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                                            title={t('tenants.editBtn')}
                                        >
                                            <Pencil size={15} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(tenant)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            title={t('tenants.deleteBtn')}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <Link
                                to="/platform/tenants/$slug"
                                params={{ slug: tenant.slug }}
                                className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors rounded-b-xl border-t border-slate-100 dark:border-slate-800"
                            >
                                <Eye size={15} />
                                {t('tenants.detailBtn')}
                                <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Link>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-6 py-16 text-center">
                    <Building2 size={48} className="mx-auto mb-4 text-slate-200 dark:text-slate-700" />
                    <p className="text-slate-400 font-medium">
                        {searchQuery ? t('tenants.noTenants') : t('tenants.noTenantsYet')}
                    </p>
                    {!searchQuery && (
                        <button
                            onClick={handleCreate}
                            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                        >
                            {t('tenants.addFirstTenant')}
                        </button>
                    )}
                </div>
            )}

            {/* Modals */}
            <TenantFormModal
                isOpen={isFormModalOpen}
                onClose={() => { setIsFormModalOpen(false); setEditingTenant(null); }}
                tenant={editingTenant}
                onSave={handleSave}
                isLoading={createMutation.isPending || updateMutation.isPending}
            />

            {/* Bulk Import Modal */}
            <Modal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} title={t('tenants.bulkTitle')} size="lg">
                <div className="space-y-6">
                    <div className="flex gap-3">
                        <button
                            onClick={() => { setBulkImportType('tenants'); setBulkImportResult(null); }}
                            className={`flex-1 p-4 rounded-xl border-2 transition-all ${bulkImportType === 'tenants'
                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                }`}
                        >
                            <Building2 size={24} className={bulkImportType === 'tenants' ? 'text-purple-600 mx-auto mb-2' : 'text-slate-400 mx-auto mb-2'} />
                            <div className={`font-medium ${bulkImportType === 'tenants' ? 'text-purple-700 dark:text-purple-300' : 'text-slate-600 dark:text-slate-400'}`}>
                                {t('tenants.bulkTenants')}
                            </div>
                        </button>
                        <button
                            onClick={() => { setBulkImportType('users'); setBulkImportResult(null); }}
                            className={`flex-1 p-4 rounded-xl border-2 transition-all ${bulkImportType === 'users'
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                }`}
                        >
                            <Users size={24} className={bulkImportType === 'users' ? 'text-green-600 mx-auto mb-2' : 'text-slate-400 mx-auto mb-2'} />
                            <div className={`font-medium ${bulkImportType === 'users' ? 'text-green-700 dark:text-green-300' : 'text-slate-600 dark:text-slate-400'}`}>
                                {t('tenants.bulkUsers')}
                            </div>
                        </button>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-medium text-slate-900 dark:text-white">1. {t('tenants.downloadTemplate')}</h4>
                                <p className="text-sm text-slate-500 mt-1">
                                    {t('tenants.downloadTemplateDesc', { type: bulkImportType === 'tenants' ? t('tenants.bulkTenants') : t('tenants.bulkUsers') })}
                                </p>
                            </div>
                            <button
                                onClick={() => handleDownloadTemplate(bulkImportType)}
                                disabled={isDownloading}
                                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                <Download size={16} />
                                {isDownloading ? t('tenants.downloading') : t('tenants.downloadTemplate')}
                            </button>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl">
                        <h4 className="font-medium text-slate-900 dark:text-white mb-3">2. {t('tenants.uploadFile')}</h4>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isImporting}
                            className={`w-full p-6 border-2 border-dashed rounded-xl transition-colors ${isImporting
                                    ? 'border-slate-300 bg-slate-100'
                                    : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10'
                                }`}
                        >
                            {isImporting ? (
                                <div className="flex flex-col items-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2" />
                                    <span className="text-slate-600">{t('tenants.uploading')}</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <Upload size={32} className="text-slate-400 mb-2" />
                                    <span className="text-slate-600">{t('tenants.clickToUpload')}</span>
                                    <span className="text-sm text-slate-400 mt-1">{t('tenants.fileFormats')}</span>
                                </div>
                            )}
                        </button>
                    </div>

                    {bulkImportResult && (
                        <div className={`p-4 rounded-xl ${bulkImportResult.error_count > 0
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                                : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                            }`}>
                            <div className="flex items-center gap-2 mb-2">
                                {bulkImportResult.error_count > 0 ? (
                                    <AlertCircle className="text-yellow-600" size={20} />
                                ) : (
                                    <CheckCircle className="text-green-600" size={20} />
                                )}
                                <span className="font-medium">{bulkImportResult.message}</span>
                            </div>
                            <div className="text-sm space-y-1">
                                <div className="text-green-700 dark:text-green-400">
                                    {bulkImportResult.success_count} {t('tenants.successful')}
                                </div>
                                {bulkImportResult.error_count > 0 && (
                                    <div className="text-red-700 dark:text-red-400">
                                        {bulkImportResult.error_count} {t('tenants.failed')}
                                    </div>
                                )}
                            </div>
                            {bulkImportResult.errors.length > 0 && (
                                <div className="mt-3 max-h-32 overflow-y-auto">
                                    {bulkImportResult.errors.map((err: { row: number; errors: string[] }, idx: number) => (
                                        <div key={idx} className="text-sm text-red-600 dark:text-red-400">
                                            {t('tenants.row')} {err.row}: {err.errors.join(', ')}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    )
}
