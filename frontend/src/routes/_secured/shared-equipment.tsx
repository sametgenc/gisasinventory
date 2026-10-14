import { useState, type FormEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Building2, Package, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/context'
import { categoryCodes, useSharedEquipment, type SharedEquipment } from '@/modules/assets'
import { Button, EmptyState, FormField, Modal, PageHeader, Pagination, formControlClass } from '@/components/ui'
import { SharedEquipmentSummary } from '@/components/assets/SharedEquipmentSummary'
import { UsageRequestModal } from '@/components/assets/UsageRequestModal'
import { canRequestEquipment, canUseSharedUsage, usageCopy } from '@/modules/assets/usage'

export const Route = createFileRoute('/_secured/shared-equipment')({
    component: SharedEquipmentPage,
})

const PAGE_SIZE = 24

function SharedEquipmentPage() {
    const { t, i18n } = useTranslation()
    const { user } = useAuth()
    const usage = usageCopy[i18n.language.startsWith('tr') ? 'tr' : 'en']
    const [draftSearch, setDraftSearch] = useState('')
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('')
    const [page, setPage] = useState(1)
    const [selection, setSelection] = useState<{ id: string; dataUpdatedAt: number } | null>(null)
    const [requestId, setRequestId] = useState<string | null>(null)
    const canBrowse = !!user && (!!user.is_superuser || user.role === 'platform_admin' || !!user.tenant_slug)
    const query = useSharedEquipment({
        search: search || undefined,
        category_code: category || undefined,
        page,
    }, canBrowse)
    const hasFilters = !!search || !!category
    // Read the current public response; never retain withdrawn details in modal state.
    const selectedEquipment = canBrowse && !query.isError && !query.isPending && !query.isFetching && selection?.dataUpdatedAt === query.dataUpdatedAt
        ? query.data?.results.find(equipment => equipment.id === selection?.id) : undefined
    const requestEquipment = canUseSharedUsage(user) && !query.isError && !query.isPending
        ? query.data?.results.find(equipment => equipment.id === requestId && canRequestEquipment(user, equipment)) : undefined

    function submitSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setSelection(null)
        setSearch(draftSearch.trim())
        setPage(1)
    }

    function clearFilters() {
        setSelection(null)
        setDraftSearch('')
        setSearch('')
        setCategory('')
        setPage(1)
    }

    return (
        <div className="mx-auto max-w-6xl">
            <PageHeader title={t('sharedEquipment.title')} subtitle={t('sharedEquipment.subtitle')}
                actions={canUseSharedUsage(user) && <Link to="/shared-usage" search={{ request: undefined }} className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">{usage.title}</Link>} />

            {!canBrowse ? (
                <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <EmptyState icon={<Building2 />} title={t('sharedEquipment.setupTitle')} description={t('sharedEquipment.setupDescription')} />
                </div>
            ) : (
                <>
                    <form onSubmit={submitSearch} className="mb-4 flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                            <FormField label={t('sharedEquipment.search')} htmlFor="shared-equipment-search">
                                <input id="shared-equipment-search" type="search" className={formControlClass}
                                    value={draftSearch} onChange={event => setDraftSearch(event.target.value)}
                                    placeholder={t('sharedEquipment.searchPlaceholder')} />
                            </FormField>
                        </div>
                        <div className="min-w-0 sm:w-64">
                            <FormField label={t('sharedEquipment.category')} htmlFor="shared-equipment-category">
                                <select id="shared-equipment-category" className={formControlClass} value={category}
                                    onChange={event => { setSelection(null); setCategory(event.target.value); setPage(1) }}>
                                    <option value="">{t('sharedEquipment.allCategories')}</option>
                                    {categoryCodes.map(code => <option key={code} value={code}>{t(`catalog.categories.${code}`)}</option>)}
                                </select>
                            </FormField>
                        </div>
                        <Button type="submit" icon={<Search size={16} />}>{t('sharedEquipment.searchAction')}</Button>
                    </form>

                    <p className="mb-6 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{t('sharedEquipment.privacy')} {t('inventory.publicationIsNotAvailability')}</p>

                    <section aria-busy={query.isFetching} aria-label={t('sharedEquipment.title')}>
                        {query.isPending ? (
                            <p role="status" className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">{t('sharedEquipment.loading')}</p>
                        ) : query.isError ? (
                            <div role="alert" className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                <EmptyState title={t('sharedEquipment.errorTitle')} description={t('sharedEquipment.errorDescription')}
                                    action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { if (page > 1) setPage(1); else void query.refetch() }}>{page > 1 ? t('pagination.first') : t('sharedEquipment.retry')}</Button>{hasFilters && <Button variant="ghost" onClick={clearFilters}>{t('sharedEquipment.clearFilters')}</Button>}</div>} />
                            </div>
                        ) : (
                            <>
                                <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-3">
                                    <p aria-live="polite" className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('sharedEquipment.resultCount', { count: query.data?.count ?? 0 })}</p>
                                    {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>{t('sharedEquipment.clearFilters')}</Button>}
                                    {query.isFetching && <p role="status" className="text-xs text-slate-500 dark:text-slate-400">{t('sharedEquipment.refreshing')}</p>}
                                </div>

                                {!query.data?.results.length ? (
                                    <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                        <EmptyState icon={<Package />} title={t(hasFilters ? 'sharedEquipment.noResultsTitle' : 'sharedEquipment.emptyTitle')}
                                            description={t(hasFilters ? 'sharedEquipment.noResultsDescription' : 'sharedEquipment.emptyDescription')} />
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                            {query.data.results.map(equipment => <EquipmentCard key={equipment.id} equipment={equipment} onDetails={() => setSelection({ id: equipment.id, dataUpdatedAt: query.dataUpdatedAt })} />)}
                                        </div>
                                        <Pagination className="mt-5 rounded-md border border-slate-200 dark:border-slate-700"
                                            page={page} pageSize={PAGE_SIZE} totalItems={query.data.count} onPageChange={nextPage => { setSelection(null); setPage(nextPage) }}
                                            itemLabel={t('pagination.equipment')} disabled={query.isFetching} />
                                    </>
                                )}
                            </>
                        )}
                    </section>
                </>
            )}
            {selectedEquipment && <Modal isOpen onClose={() => setSelection(null)} title={t('sharingDetails.detailsTitle')} size="md" footer={<div className="flex flex-wrap justify-end gap-2 px-5 py-4"><Button variant="secondary" onClick={() => setSelection(null)}>{t('common.close')}</Button>{canRequestEquipment(user, selectedEquipment) && <Button onClick={() => { setRequestId(selectedEquipment.id); setSelection(null) }}>{usage.request}</Button>}</div>}>
                <SharedEquipmentSummary equipment={selectedEquipment} detailed />
                <p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('inventory.publicationIsNotAvailability')}</p>
            </Modal>}
            {requestEquipment && <UsageRequestModal key={requestEquipment.id} equipment={requestEquipment} onClose={() => setRequestId(null)} />}
        </div>
    )
}

function EquipmentCard({ equipment, onDetails }: { equipment: SharedEquipment; onDetails: () => void }) {
    const { t } = useTranslation()
    return <article className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex-1"><SharedEquipmentSummary equipment={equipment} /></div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('sharedEquipment.published')}</p>
            <Button size="sm" variant="secondary" onClick={onDetails} aria-label={t('sharingDetails.openDetails', { name: equipment.sharing_title?.trim() || equipment.asset_type_name })}>{t('sharingDetails.details')}</Button>
        </div>
    </article>
}
