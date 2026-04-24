import { useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    Building2, Plus, Pencil, Trash2, Ship, Users,
    MapPin, Phone, Mail, Search, Eye,
    Upload, Download, CheckCircle, AlertCircle, FileText,
} from 'lucide-react'
import { exportReport } from '@/utils/report'
import {
    useTenants, useCreateTenant, useUpdateTenant, useDeleteTenant,
    tenantsApi,
} from '@/modules/tenants'
import type { Tenant, TenantUpdateInput } from '@/modules/tenants'
import type { BulkImportResult } from '@/modules/tenants/data'
import {
    PageHeader,
    Modal,
    Button,
    Badge,
    Card,
    DataTable,
    EmptyState,
    ConfirmationModal,
    type ColumnDef,
} from '@/components/ui'
import { useTranslation } from 'react-i18next'
import { TenantFormModal } from '@/components/tenants/TenantFormModal'

export const Route = createFileRoute('/_secured/platform/tenants/')({
    component: TenantsPage,
})

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

function TenantsPage() {
    const { t } = useTranslation()
    const { data: tenants, isLoading, error } = useTenants()
    const createMutation = useCreateTenant()
    const updateMutation = useUpdateTenant()
    const deleteMutation = useDeleteTenant()

    const [searchQuery, setSearchQuery] = useState('')
    const [isFormModalOpen, setIsFormModalOpen] = useState(false)
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null)

    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
    const [bulkImportType, setBulkImportType] = useState<'tenants' | 'users'>('tenants')
    const [bulkImportResult, setBulkImportResult] = useState<BulkImportResult | null>(null)
    const [isImporting, setIsImporting] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const filteredTenants = useMemo(
        () => (tenants ?? []).filter((tn) => {
            const q = searchQuery.toLowerCase()
            return tn.name.toLowerCase().includes(q) || tn.slug.toLowerCase().includes(q)
        }),
        [tenants, searchQuery],
    )

    const handleCreate = () => { setEditingTenant(null); setIsFormModalOpen(true) }
    const handleEdit = (tn: Tenant) => { setEditingTenant(tn); setIsFormModalOpen(true) }

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

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return
        await deleteMutation.mutateAsync(deleteTarget.slug)
        setDeleteTarget(null)
    }

    const handleDownloadTemplate = async (type: 'tenants' | 'users') => {
        setIsDownloading(true)
        try {
            const blob = type === 'tenants'
                ? await tenantsApi.downloadTenantsTemplate()
                : await tenantsApi.downloadUsersTemplate()
            downloadBlob(blob, type === 'tenants' ? 'shipyard_template.xlsx' : 'users_template.xlsx')
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

    const handleReportExport = () => {
        exportReport(
            filteredTenants,
            [
                { header: t('tenants.tableShipyard'), value: (r) => r.name },
                { header: t('tenants.tableShipyard') + ' (slug)', value: (r) => r.slug },
                { header: t('common.email'), value: (r) => r.email ?? '' },
                { header: t('common.phone'), value: (r) => r.phone ?? '' },
                { header: t('common.address'), value: (r) => r.address ?? '' },
                { header: t('tenants.tableUsers'), value: (r) => r.user_count },
                { header: t('common.status'), value: (r) => r.is_active ? t('common.active') : t('common.inactive') },
            ],
            'shipyards_report',
        )
    }

    const handleExport = async (type: 'tenants' | 'users') => {
        try {
            const blob = type === 'tenants'
                ? await tenantsApi.exportTenants()
                : await tenantsApi.exportUsers()
            downloadBlob(blob, type === 'tenants' ? 'shipyards_export.xlsx' : 'users_export.xlsx')
        } catch (err) {
            console.error('Export failed:', err)
        }
    }

    const columns: ColumnDef<Tenant>[] = [
        {
            key: 'name',
            header: t('tenants.tableShipyard'),
            sortable: true,
            sortAccessor: (tn) => tn.name,
            cell: (tn) => (
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
                        <Ship size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{tn.name}</p>
                        <p className="text-xs text-slate-500 truncate">{tn.slug}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'contact',
            header: t('tenants.tableContact'),
            cell: (tn) => (
                <div className="space-y-0.5 text-xs text-slate-500">
                    {tn.email && (
                        <p className="flex items-center gap-1.5"><Mail size={11} className="text-slate-400" />{tn.email}</p>
                    )}
                    {tn.phone && (
                        <p className="flex items-center gap-1.5"><Phone size={11} className="text-slate-400" />{tn.phone}</p>
                    )}
                    {tn.address && (
                        <p className="flex items-center gap-1.5 truncate max-w-[220px]">
                            <MapPin size={11} className="text-slate-400" />
                            <span className="truncate">{tn.address}</span>
                        </p>
                    )}
                    {!tn.email && !tn.phone && !tn.address && <span className="text-slate-300">—</span>}
                </div>
            ),
        },
        {
            key: 'users',
            header: t('tenants.tableUsers'),
            sortable: true,
            sortAccessor: (tn) => tn.user_count,
            cell: (tn) => (
                <Badge variant="info" icon={<Users size={11} />}>
                    {tn.user_count} {t('tenants.users')}
                </Badge>
            ),
        },
        {
            key: 'status',
            header: t('common.status'),
            cell: (tn) => (
                tn.is_active
                    ? <Badge variant="success">{t('common.active')}</Badge>
                    : <Badge variant="danger">{t('common.inactive')}</Badge>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (tn) => (
                <div className="flex items-center justify-end gap-1">
                    <Link
                        to="/platform/tenants/$slug"
                        params={{ slug: tn.slug }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        title={t('tenants.detailBtn')}
                    >
                        <Eye size={15} />
                    </Link>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleEdit(tn) }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        title={t('tenants.editBtn')}
                    >
                        <Pencil size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(tn) }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                        title={t('tenants.deleteBtn')}
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            ),
        },
    ]

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-xl text-red-700 dark:text-red-300">
                {t('tenants.loadError')}
            </div>
        )
    }

    return (
        <div className="w-full min-w-0">
            <PageHeader
                icon={<Building2 size={22} />}
                title={t('tenants.title')}
                subtitle={t('tenants.subtitle')}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={<FileText size={16} />}
                            onClick={handleReportExport}
                            disabled={filteredTenants.length === 0}
                            title={t('common.exportReportTitle')}
                        >
                            {t('common.exportReport')}
                        </Button>
                        <Button
                            variant="secondary"
                            icon={<Download size={16} />}
                            onClick={() => handleExport('tenants')}
                        >
                            {t('tenants.exportTenants')}
                        </Button>
                        <Button
                            variant="secondary"
                            icon={<Download size={16} />}
                            onClick={() => handleExport('users')}
                        >
                            {t('tenants.exportUsers')}
                        </Button>
                        <Button
                            variant="secondary"
                            icon={<Upload size={16} />}
                            onClick={() => { setBulkImportResult(null); setIsBulkModalOpen(true) }}
                        >
                            {t('common.bulkImport')}
                        </Button>
                        <Button icon={<Plus size={16} />} onClick={handleCreate}>
                            {t('tenants.addNew')}
                        </Button>
                    </>
                }
            />

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
                <div className="relative max-w-md">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('tenants.searchPlaceholder')}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
            </div>

            <DataTable
                data={filteredTenants}
                columns={columns}
                isLoading={isLoading}
                getRowId={(tn) => tn.id}
                pageSize={25}
                emptyState={
                    <EmptyState
                        icon={<Building2 size={40} />}
                        title={searchQuery ? t('tenants.noTenants') : t('tenants.noTenantsYet')}
                        action={
                            !searchQuery && (
                                <Button icon={<Plus size={14} />} size="sm" onClick={handleCreate}>
                                    {t('tenants.addFirstTenant')}
                                </Button>
                            )
                        }
                    />
                }
            />

            <TenantFormModal
                isOpen={isFormModalOpen}
                onClose={() => { setIsFormModalOpen(false); setEditingTenant(null) }}
                tenant={editingTenant}
                onSave={handleSave}
                isLoading={createMutation.isPending || updateMutation.isPending}
            />

            <ConfirmationModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDeleteConfirm}
                title={t('tenants.deleteBtn')}
                message={t('tenants.deleteConfirm', { name: deleteTarget?.name ?? '' })}
                confirmText={t('common.delete')}
                type="danger"
                isLoading={deleteMutation.isPending}
            />

            {/* Bulk Import Modal (tenants + users) */}
            <Modal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} title={t('tenants.bulkTitle')} size="lg">
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => { setBulkImportType('tenants'); setBulkImportResult(null) }}
                            className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-1.5 ${bulkImportType === 'tenants'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                }`}
                        >
                            <Building2 size={24} className={bulkImportType === 'tenants' ? 'text-blue-600' : 'text-slate-400'} />
                            <span className={`text-sm font-medium ${bulkImportType === 'tenants' ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`}>
                                {t('tenants.bulkTenants')}
                            </span>
                        </button>
                        <button
                            onClick={() => { setBulkImportType('users'); setBulkImportResult(null) }}
                            className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-1.5 ${bulkImportType === 'users'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                }`}
                        >
                            <Users size={24} className={bulkImportType === 'users' ? 'text-blue-600' : 'text-slate-400'} />
                            <span className={`text-sm font-medium ${bulkImportType === 'users' ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`}>
                                {t('tenants.bulkUsers')}
                            </span>
                        </button>
                    </div>

                    <Card padded className="flex items-center justify-between gap-3">
                        <div>
                            <h4 className="font-medium text-slate-900 dark:text-white text-sm">1. {t('tenants.downloadTemplate')}</h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {t('tenants.downloadTemplateDesc', { type: bulkImportType === 'tenants' ? t('tenants.bulkTenants') : t('tenants.bulkUsers') })}
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            icon={<Download size={14} />}
                            onClick={() => handleDownloadTemplate(bulkImportType)}
                            loading={isDownloading}
                        >
                            {isDownloading ? t('tenants.downloading') : t('tenants.downloadTemplate')}
                        </Button>
                    </Card>

                    <Card padded>
                        <h4 className="font-medium text-slate-900 dark:text-white mb-3 text-sm">2. {t('tenants.uploadFile')}</h4>
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isImporting}
                            className={`w-full p-6 border-2 border-dashed rounded-lg transition-colors ${isImporting
                                ? 'border-slate-300 bg-slate-100 dark:bg-slate-800'
                                : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10'
                                }`}
                        >
                            {isImporting ? (
                                <div className="flex flex-col items-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2" />
                                    <span className="text-slate-600 dark:text-slate-300 text-sm">{t('tenants.uploading')}</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <Upload size={28} className="text-slate-400 mb-2" />
                                    <span className="text-slate-600 dark:text-slate-300 text-sm">{t('tenants.clickToUpload')}</span>
                                    <span className="text-xs text-slate-400 mt-1">{t('tenants.fileFormats')}</span>
                                </div>
                            )}
                        </button>
                    </Card>

                    {bulkImportResult && (
                        <div className={`p-4 rounded-lg border ${bulkImportResult.error_count > 0
                            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                            : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                            }`}>
                            <div className="flex items-center gap-2 mb-2">
                                {bulkImportResult.error_count > 0
                                    ? <AlertCircle className="text-amber-600" size={20} />
                                    : <CheckCircle className="text-emerald-600" size={20} />}
                                <span className="font-medium text-sm">{bulkImportResult.message}</span>
                            </div>
                            <div className="text-xs space-y-0.5">
                                <div className="text-emerald-700 dark:text-emerald-400">
                                    {bulkImportResult.success_count} {t('tenants.successful')}
                                </div>
                                {bulkImportResult.error_count > 0 && (
                                    <div className="text-red-700 dark:text-red-400">
                                        {bulkImportResult.error_count} {t('tenants.failed')}
                                    </div>
                                )}
                            </div>
                            {(bulkImportResult.errors ?? []).length > 0 && (
                                <div className="mt-3 max-h-32 overflow-y-auto text-xs">
                                    {(bulkImportResult.errors ?? []).map((err, idx) => (
                                        <div key={idx} className="text-red-600 dark:text-red-400">
                                            {t('tenants.row')} {err.row}: {(err.errors ?? []).join(', ')}
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
