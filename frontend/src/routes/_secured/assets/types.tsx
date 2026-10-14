import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    Layers, Plus, Pencil, Trash2, KeyRound, Eye, Upload, ChevronDown,
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
    Pagination,
    EmptyState,
    ConfirmationModal,
    Modal,
    FormField, formControlClass,
} from '@/components/ui'
import { AssetTypeFormModal } from '@/components/assets/AssetTypeFormModal'
import { WorkbookImportModal } from '@/components/assets/WorkbookImportModal'
import { useTenants } from '@/modules/tenants'
import { categoryCodes } from '@/modules/assets/catalog'
import { getApiErrorMessage } from '@/api/errors'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_secured/assets/types')({
    component: AssetTypesPage,
})

function AssetTypesPage() {
    const { user } = useAuth()
    const { t, i18n } = useTranslation()
    const { data: assetTypes = [], isLoading, isFetching, isError, refetch } = useAssetTypes()
    const { data: tenants = [] } = useTenants()
    const createMutation = useCreateAssetType()
    const updateMutation = useUpdateAssetType()
    const deleteMutation = useDeleteAssetType()

    const canManage = !!user?.is_superuser && !user.tenant_slug

    const [importOpen, setImportOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('')
    const [grade, setGrade] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(24)
    const [deleteError, setDeleteError] = useState('')
    const filteredTypes = assetTypes.filter(item => {
        const matchesSearch = `${item.name} ${item.catalog_code || ''} ${item.description || ''}`.toLocaleLowerCase(i18n.language).includes(search.trim().toLocaleLowerCase(i18n.language))
        const matchesCategory = !category || (category === 'uncategorized' ? !item.category_code : item.category_code === category)
        return matchesSearch && matchesCategory &&
            (!grade || (grade === 'excluded' ? item.sharing_excluded : grade === 'unknown' ? !item.sharing_class : item.sharing_class === grade))
    }).sort((a, b) => {
        const aCategory = categoryCodes.indexOf(a.category_code || '')
        const bCategory = categoryCodes.indexOf(b.category_code || '')
        const categoryOrder = (aCategory < 0 ? categoryCodes.length : aCategory) -
            (bCategory < 0 ? categoryCodes.length : bCategory)
        return categoryOrder || a.name.localeCompare(b.name, i18n.language)
    })
    const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredTypes.length / pageSize)))
    const visibleTypes = filteredTypes.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    const typeGroups = [...categoryCodes, ''].map(code => ({
        code,
        types: visibleTypes.filter(item => (item.category_code || '') === code),
        total: filteredTypes.filter(item => (item.category_code || '') === code).length,
    })).filter(group => group.types.length > 0)

    const [formOpen, setFormOpen] = useState(false)
    const [editingType, setEditingType] = useState<AssetType | null>(null)
    const [viewingType, setViewingType] = useState<AssetType | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<AssetType | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const hasFilters = !!(search.trim() || category || grade)
    const clearFilters = () => { setSearch(''); setCategory(''); setGrade(''); setPage(1) }

    if (!isLoading && !isError && page !== currentPage) setPage(currentPage)

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
            <PageHeader
                icon={<Layers size={22} />}
                title={t('assetTypes.title')}
                subtitle={t('assetTypes.subtitle') + (canManage ? t('assetTypes.subtitleManage') : '')}
                actions={
                    canManage && (
                        <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" icon={<Upload size={16} />} onClick={() => setImportOpen(true)}>{t('catalog.importButton')}</Button>
                            <Button icon={<Plus size={16} />} onClick={openCreate}>{t('assetTypes.addNew')}</Button>
                        </div>
                    )
                }
            />

            <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5 dark:border-slate-700">
                <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{t('catalog.directoryHelp')}</p>
                <Link to="/assets" className="shrink-0 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">{t('catalog.inventoryLink')} →</Link>
            </div>
            {isError && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{t('catalog.loadFailed')}<Button variant="ghost" size="sm" onClick={() => refetch()}>{t('catalog.retry')}</Button></div>}
            <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <FormField label={t('catalog.search')}><input type="search" className={formControlClass} placeholder={t('catalog.searchPlaceholder')} value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /></FormField>
                <FormField label={t('catalog.category')}><select className={formControlClass} value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}><option value="">{t('catalog.allCategories')}</option>{categoryCodes.map(code => <option value={code} key={code}>{t(`catalog.categories.${code}`)}</option>)}<option value="uncategorized">{t('catalog.uncategorized')}</option></select></FormField>
            </div>
            <details className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded py-1 font-medium text-slate-600 marker:content-none dark:text-slate-300">
                    <ChevronDown size={14} aria-hidden />{t('catalog.assessmentFilters')}
                    {grade && <span className="ml-1 text-xs">· {grade === 'excluded' ? t('catalog.excluded') : grade === 'unknown' ? t('catalog.unclassified') : t(`catalog.grades.${grade}`)}</span>}
                </summary>
                <div className="mt-3 max-w-2xl border-l-2 border-slate-300 pl-4 dark:border-slate-600">
                    <p className="mb-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('catalog.preliminaryHelp')}</p>
                    <div className="max-w-sm"><FormField label={t('catalog.grade')}><select className={formControlClass} value={grade} onChange={e => { setGrade(e.target.value); setPage(1) }}><option value="">{t('catalog.allGrades')}</option>{['A', 'B', 'C'].map(code => <option key={code} value={code}>{t(`catalog.grades.${code}`)}</option>)}<option value="excluded">{t('catalog.excluded')}</option><option value="unknown">{t('catalog.unclassified')}</option></select></FormField></div>
                </div>
            </details>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">{!isLoading && !isError && <p className="text-xs text-slate-500 dark:text-slate-400" role="status">{t('catalog.filteredCount', { count: filteredTypes.length, total: assetTypes.length })}</p>}{hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>{t('ux.clearFilters')}</Button>}</div>
            {!isError && (isLoading ? (
                <div aria-busy="true" className="space-y-3">
                    {[1, 2, 3].map(index => <div key={index} className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />)}
                </div>
            ) : filteredTypes.length === 0 ? (
                <EmptyState
                    icon={<Layers size={40} />}
                    title={t(assetTypes.length ? 'catalog.noMatches' : 'assetTypes.noTypesYet')}
                    description={assetTypes.length ? t('catalog.clearFiltersHelp') : canManage ? t('assetTypes.orCreateNew') : undefined}
                    action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>{t('ux.clearFilters')}</Button> : canManage ? <Button icon={<Plus size={14} />} size="sm" onClick={openCreate}>{t('assetTypes.addNew')}</Button> : undefined}
                />
            ) : (
                <div className="space-y-7">
                    {typeGroups.map(group => (
                        <section key={group.code || 'uncategorized'} aria-labelledby={`type-category-${group.code || 'uncategorized'}`}>
                            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <h2 id={`type-category-${group.code || 'uncategorized'}`} className="text-sm font-semibold text-slate-800 dark:text-slate-100">{group.code ? t(`catalog.categories.${group.code}`) : t('catalog.uncategorized')}</h2>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{t('catalog.categoryTypeCount', { count: group.total })}</span>
                            </div>
                            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {group.types.map(item => (
                                    <li key={item.id} className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
                                        <div className="flex items-start justify-between gap-2">
                                            <button type="button" onClick={() => setViewingType(item)} className="min-w-0 flex-1 break-words text-left text-base font-semibold leading-6 text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-300">{item.name}</button>
                                            {item.sharing_excluded && <Badge variant="neutral" size="sm" className="shrink-0">{t('catalog.excluded')}</Badge>}
                                        </div>
                                        {item.description && <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600 dark:text-slate-400">{item.description}</p>}
                                        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-slate-500 dark:text-slate-400">
                                            <span>{t(`assetTypes.tracking.${item.tracking_mode || 'individual'}`)}</span>
                                            {item.catalog_code && <span className="break-all">{t('catalog.code')}: {item.catalog_code}</span>}
                                            <span>{t('assetTypes.fieldsCount', { count: item.schema?.length || 0 })}</span>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                                            <button type="button" onClick={() => setViewingType(item)} aria-label={`${t('catalog.viewType')}: ${item.name}`} className="inline-flex min-h-9 items-center gap-1.5 rounded px-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"><Eye size={14} aria-hidden />{t('assetTypes.list.view')}</button>
                                            {canManage && <div className="flex items-center gap-1">
                                                <button type="button" onClick={() => openEdit(item)} title={t('common.edit')} aria-label={`${t('common.edit')}: ${item.name}`} className="rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-300"><Pencil size={15} aria-hidden /></button>
                                                <button type="button" onClick={() => { setDeleteError(''); setDeleteTarget(item) }} title={t('common.delete')} aria-label={`${t('common.delete')}: ${item.name}`} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950 dark:hover:text-red-300"><Trash2 size={15} aria-hidden /></button>
                                            </div>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                    {filteredTypes.length > 12 && <Pagination page={currentPage} pageSize={pageSize} totalItems={filteredTypes.length}
                        pageSizeOptions={[12, 24, 48]} onPageSizeChange={setPageSize} onPageChange={setPage}
                        itemLabel={t('pagination.types')} disabled={isFetching} className="col-span-full rounded-lg" />}
                </div>
            ))}

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
}: {
    assetType: AssetType | null
    isOpen: boolean
    onClose: () => void
    onEdit?: (at: AssetType) => void
}) {
    const { t } = useTranslation()
    if (!assetType) return null

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={assetType.name} size="lg">
            <div className="space-y-5">
                <dl className="grid gap-x-6 gap-y-4 border-y border-slate-200 py-4 text-sm dark:border-slate-700 sm:grid-cols-2">
                    <div><dt className="text-slate-500 dark:text-slate-400">{t('assetTypes.trackingTitle')}</dt><dd className="mt-1 text-slate-900 dark:text-white">{t(`assetTypes.tracking.${assetType.tracking_mode || 'individual'}`)}</dd></div>
                    <div><dt className="text-slate-500 dark:text-slate-400">{t('catalog.code')}</dt><dd className="mt-1 text-slate-900 dark:text-white">{assetType.catalog_code || '—'}</dd></div>
                    <div><dt className="text-slate-500 dark:text-slate-400">{t('catalog.category')}</dt><dd className="mt-1 text-slate-900 dark:text-white">{assetType.category_code ? `${assetType.category_code} · ${t(`catalog.categories.${assetType.category_code}`)}` : t('catalog.unclassified')}</dd></div>
                    <div><dt className="text-slate-500 dark:text-slate-400">{t('catalog.grade')}</dt><dd className="mt-1 text-slate-900 dark:text-white">{assetType.sharing_class ? t(`catalog.grades.${assetType.sharing_class}`) : t('catalog.unclassified')}</dd></div>
                    {assetType.sharing_excluded && <div><dt><Badge variant="danger">{t('catalog.excluded')}</Badge></dt><dd className="mt-1 text-slate-900 dark:text-white">{assetType.exclusion_reason || t('catalog.autoExcluded')}</dd></div>}
                </dl>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('catalog.preliminaryHelp')}</p>
                {assetType.description && (
                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {assetType.description}
                    </p>
                )}

                <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        {t('assetTypes.definedFields', { count: assetType.schema?.length || 0 })}
                    </h3>
                    {(assetType.schema?.length || 0) === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">{t('assetTypes.noFieldsDefined')}</p>
                    ) : (
                        <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                            {assetType.schema?.map((field, index) => (
                                <div
                                    key={index}
                                    className="flex flex-wrap items-center gap-3 py-3"
                                >
                                    <span className="font-medium text-slate-900 dark:text-white truncate">
                                        {field.label}
                                    </span>
                                    <Badge variant="neutral" size="sm">
                                        {t(`assetTypes.fieldTypes.${field.type}`)}
                                    </Badge>
                                    {field.required && (
                                        <span className="text-xs text-red-500 font-medium">{t('common.required')}</span>
                                    )}
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

                {onEdit && (
                    <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
                        <Button icon={<Pencil size={14} />} variant="secondary" onClick={() => onEdit(assetType)}>
                            {t('common.edit')}
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    )
}
