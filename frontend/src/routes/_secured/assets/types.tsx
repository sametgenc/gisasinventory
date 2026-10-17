import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    Layers, Plus, Pencil, KeyRound, Upload, ArrowRight, Building2, ShieldCheck,
} from 'lucide-react'
import {
    useAssetTypes,
    useCreateAssetType,
    useUpdateAssetType,
    useDeleteAssetType,
} from '@/modules/assets'
import type { AssetType, AssetTypeCreateInput } from '@/modules/assets'
import { useAuth } from '@/auth/context'
import {
    PageHeader,
    Button,
    Badge,
    ConfirmationModal,
    Modal,
} from '@/components/ui'
import { AssetTypeFormModal } from '@/components/assets/AssetTypeFormModal'
import { WorkbookImportModal } from '@/components/assets/WorkbookImportModal'
import { useTenants } from '@/modules/tenants'
import { CatalogWorkspace } from '@/components/assets/CatalogWorkspace'
import { getCatalogCopy } from '@/modules/assets/catalog-copy'
import { getApiErrorMessage } from '@/api/errors'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_secured/assets/types')({
    component: AssetTypesPage,
})

function AssetTypesPage() {
    const { user } = useAuth()
    const { t, i18n } = useTranslation()
    const copy = getCatalogCopy(i18n.language)
    const { data: assetTypes = [], isLoading, isFetching, isError, refetch } = useAssetTypes()
    const { data: tenants = [] } = useTenants()
    const createMutation = useCreateAssetType()
    const updateMutation = useUpdateAssetType()
    const deleteMutation = useDeleteAssetType()

    const canManage = !!user?.is_superuser && !user.tenant_slug
    const canAddToInventory = !!user?.tenant_slug

    const [importOpen, setImportOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('')
    const [grade, setGrade] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(24)
    const [deleteError, setDeleteError] = useState('')
    const [formOpen, setFormOpen] = useState(false)
    const [editingType, setEditingType] = useState<AssetType | null>(null)
    const [viewingType, setViewingType] = useState<AssetType | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<AssetType | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const openCreate = () => {
        setEditingType(null)
        setSaveError(null)
        setFormOpen(true)
    }

    const openEdit = (at: AssetType) => {
        setEditingType(at)
        setSaveError(null)
        setFormOpen(true)
    }

    const handleSave = async (payload: AssetTypeCreateInput) => {
        try {
            setSaveError(null)
            if (editingType) {
                await updateMutation.mutateAsync({ id: editingType.id, data: payload })
            } else {
                await createMutation.mutateAsync(payload)
            }
            setFormOpen(false)
        } catch (err: unknown) {
            const errObj = err as { response?: { data?: Record<string, unknown> } }
            const data = errObj.response?.data
            if (data && typeof data === 'object') {
                const messages = Object.entries(data).map(([k, v]) => {
                    if (Array.isArray(v)) return v.join(', ')
                    return `${k}: ${v}`
                }).join('; ')
                setSaveError(messages || t('assetTypes.saveFailed'))
            } else {
                setSaveError(t('assetTypes.saveFailed'))
            }
        }
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        try {
            setDeleteError('')
            await deleteMutation.mutateAsync(deleteTarget.id)
            setDeleteTarget(null)
        } catch (err) {
            setDeleteError(getApiErrorMessage(err, t('catalog.deleteFailed')))
        }
    }

    return (
        <div className="w-full min-w-0">
            <nav aria-label={copy.workspaceNav} className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
                <Link to="/assets" className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-300">{t(canManage ? 'inventory.centralTitle' : 'inventory.myTitle')}</Link>
                <Link to="/assets/types" aria-current="page" className="border-b-2 border-blue-600 px-3 py-2 text-sm font-medium text-blue-700 dark:border-blue-400 dark:text-blue-300">{copy.title}</Link>
            </nav>
            <PageHeader
                density="compact"
                icon={<Layers size={22} />}
                title={copy.title}
                actions={
                    canManage && (
                        <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" icon={<Upload size={16} />} onClick={() => setImportOpen(true)}>{t('catalog.importButton')}</Button>
                            <Button icon={<Plus size={16} />} onClick={openCreate}>{t('assetTypes.addNew')}</Button>
                        </div>
                    )
                }
            />

            <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div className="grid md:grid-cols-2">
                    <div className="border-b border-slate-200 px-3 py-2.5 dark:border-slate-700 md:border-b-0 md:border-r">
                        <p className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300"><ShieldCheck size={14} aria-hidden />{copy.platform}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.platformHelp}</p>
                    </div>
                    <div className="bg-slate-50/70 px-3 py-2.5 dark:bg-slate-800/40">
                        <p className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200"><Building2 size={14} aria-hidden />{copy.yard}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.yardHelp}</p>
                    </div>
                </div>
            </div>
            {isError ? <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{t('catalog.loadFailed')}<Button variant="ghost" size="sm" onClick={() => refetch()}>{t('catalog.retry')}</Button></div> : <CatalogWorkspace
                types={assetTypes} canManage={canManage} canAddToInventory={canAddToInventory} loading={isLoading} fetching={isFetching}
                onView={setViewingType} onEdit={openEdit} onDelete={type => { setDeleteError(''); setDeleteTarget(type) }} onCreate={openCreate}
                search={search} onSearchChange={setSearch} category={category} onCategoryChange={setCategory}
                grade={grade} onGradeChange={setGrade} page={page} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={setPageSize}
            />}

            <WorkbookImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} isGlobalAdmin={canManage} tenants={tenants} />

            <AssetTypeFormModal
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                assetType={editingType}
                onSave={handleSave}
                isLoading={createMutation.isPending || updateMutation.isPending}
                error={saveError}
            />

            <AssetTypeDetailModal
                assetType={viewingType}
                isOpen={!!viewingType}
                onClose={() => setViewingType(null)}
                onEdit={canManage ? (at) => { setViewingType(null); openEdit(at) } : undefined}
                canManage={canManage}
                canAddToInventory={canAddToInventory}
            />

            <ConfirmationModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title={t('common.delete')}
                message={t('catalog.deleteConfirm', { name: deleteTarget?.name })}
                confirmText={t('common.delete')}
                type="danger"
                isLoading={deleteMutation.isPending}
                error={deleteError}
            />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail modal
// ─────────────────────────────────────────────────────────────────────────────

function AssetTypeDetailModal({
    assetType,
    isOpen,
    onClose,
    onEdit,
    canManage,
    canAddToInventory,
}: {
    assetType: AssetType | null
    isOpen: boolean
    onClose: () => void
    onEdit?: (at: AssetType) => void
    canManage: boolean
    canAddToInventory: boolean
}) {
    const { t, i18n } = useTranslation()
    const copy = getCatalogCopy(i18n.language)
    if (!assetType) return null

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={assetType.name} size="lg" density="compact" footer={
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
                {onEdit ? <Button icon={<Pencil size={14} />} onClick={() => onEdit(assetType)}>{t('common.edit')}</Button> : <Link to="/assets" search={{ asset_type: assetType.id, ...(canAddToInventory ? { add: true } : {}) }} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">{canAddToInventory ? copy.inventoryForType : copy.inventory}<ArrowRight size={15} aria-hidden /></Link>}
            </div>
        }>
            <div className="space-y-3">
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-900 dark:bg-blue-950/30">
                    <p className="flex items-center gap-2 text-xs font-medium text-blue-800 dark:text-blue-200"><ShieldCheck size={14} aria-hidden />{copy.definition}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{copy.detailHelp}</p>
                </div>
                <dl className="grid gap-3 border-y border-slate-200 py-3 text-sm [&_dt]:text-xs dark:border-slate-700 sm:grid-cols-2">
                    <div><dt className="text-slate-500 dark:text-slate-400">{t('assetTypes.trackingTitle')}</dt><dd className="mt-1 text-slate-900 dark:text-white">{t(`assetTypes.tracking.${assetType.tracking_mode || 'individual'}`)}</dd></div>
                    <div><dt className="text-slate-500 dark:text-slate-400">{copy.catalogCode}</dt><dd className="mt-1 break-all font-mono text-slate-900 dark:text-white">{assetType.catalog_code || copy.missingCode}</dd></div>
                    <div><dt className="text-slate-500 dark:text-slate-400">{t('catalog.category')}</dt><dd className="mt-1 text-slate-900 dark:text-white">{assetType.category_code ? `${assetType.category_code} · ${t(`catalog.categories.${assetType.category_code}`)}` : t('catalog.unclassified')}</dd></div>
                </dl>
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.catalogCodeHelp}</p>
                {assetType.description && (
                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {assetType.description}
                    </p>
                )}

                <div>
                    <h3 className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                        {copy.technical}
                    </h3>
                    <p className="mb-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.technicalHelp}</p>
                    {(assetType.schema?.length || 0) === 0 ? (
                        <p className="py-3 text-center text-xs text-slate-400">{t('assetTypes.noFieldsDefined')}</p>
                    ) : (
                        <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                            {assetType.schema?.map((field, index) => (
                                <div
                                    key={index}
                                    className="flex min-h-10 flex-wrap items-center gap-2 py-2"
                                >
                                    <span className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                        {field.label}
                                    </span>
                                    <Badge variant="neutral" size="sm">
                                        {t(`assetTypes.fieldTypes.${field.type}`)}
                                    </Badge>
                                    {field.required && (
                                        <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">{copy.required}</span>
                                    )}
                                    {!field.required && <span className="text-xs text-slate-500 dark:text-slate-400">{copy.optional}</span>}
                                    {field.is_unique_key && (
                                        <Badge variant="warning" size="sm" icon={<KeyRound size={10} />}>
                                            {t('assetTypes.uniqueIndexField')}
                                        </Badge>
                                    )}
                                    {field.type === 'select' && field.options && (
                                        <span className="text-xs text-slate-400">
                                            {t('assetTypes.optionsCount', { count: field.options.length })}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <details className="rounded-md border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                    <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">{copy.assessment}</summary>
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.assessmentHelp}</p>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{assetType.sharing_class ? t(`catalog.grades.${assetType.sharing_class}`) : t('catalog.unclassified')}</p>
                    {assetType.sharing_excluded && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{t('catalog.excluded')} · {assetType.exclusion_reason || t('catalog.autoExcluded')}</p>}
                </details>
                <div className="border-l-2 border-slate-300 pl-3 dark:border-slate-600">
                    <h3 className="text-xs font-medium text-slate-800 dark:text-slate-200">{copy.yard}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.yardFields}</p>
                    {!canManage && <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.example}</p>}
                </div>
            </div>
        </Modal>
    )
}
