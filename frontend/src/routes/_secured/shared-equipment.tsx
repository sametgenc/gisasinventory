import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Building2, Package, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/context'
import { categoryCodes, useSharedEquipment, type SharedEquipment } from '@/modules/assets'
import { Button, EmptyState, FormField, PageHeader, Pagination, formControlClass } from '@/components/ui'

export const Route = createFileRoute('/_secured/shared-equipment')({
    component: SharedEquipmentPage,
})

const PAGE_SIZE = 24

function SharedEquipmentPage() {
    const { t } = useTranslation()
    const { user } = useAuth()
    const [draftSearch, setDraftSearch] = useState('')
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('')
    const [page, setPage] = useState(1)
    const canBrowse = !!user && (!!user.is_superuser || user.role === 'platform_admin' || !!user.tenant_slug)
    const query = useSharedEquipment({
        search: search || undefined,
        category_code: category || undefined,
        page,
    }, canBrowse)
    const hasFilters = !!search || !!category

    function submitSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setSearch(draftSearch.trim())
        setPage(1)
    }

    function clearFilters() {
        setDraftSearch('')
        setSearch('')
        setCategory('')
        setPage(1)
    }

    return (
        <div className="mx-auto max-w-6xl">
            <PageHeader title={t('sharedEquipment.title')} subtitle={t('sharedEquipment.subtitle')} />

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
                                    onChange={event => { setCategory(event.target.value); setPage(1) }}>
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
                                            {query.data.results.map(equipment => <EquipmentCard key={equipment.id} equipment={equipment} />)}
                                        </div>
                                        <Pagination className="mt-5 rounded-md border border-slate-200 dark:border-slate-700"
                                            page={page} pageSize={PAGE_SIZE} totalItems={query.data.count} onPageChange={setPage}
                                            itemLabel={t('pagination.equipment')} disabled={query.isFetching} />
                                    </>
                                )}
                            </>
                        )}
                    </section>
                </>
            )}
        </div>
    )
}

function EquipmentCard({ equipment }: { equipment: SharedEquipment }) {
    const { t, i18n } = useTranslation()
    const publishedAt = equipment.shared_at ? new Date(equipment.shared_at) : null

    return (
        <article className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-start gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <Building2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" />
                <span className="[overflow-wrap:anywhere]">{equipment.tenant_name}</span>
            </div>
            <h2 className="text-lg font-semibold leading-7 text-slate-900 dark:text-slate-100 [overflow-wrap:anywhere]">{equipment.asset_type_name}</h2>
            {(equipment.category_code || equipment.catalog_code) && (
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">
                    {equipment.category_code && t(`catalog.categories.${equipment.category_code}`)}
                    {equipment.category_code && equipment.catalog_code && ' · '}
                    {equipment.catalog_code}
                </p>
            )}
            <p className="mt-4 flex-1 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">
                {equipment.sharing_note || t('sharedEquipment.noNote')}
            </p>
            <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('sharedEquipment.published')}</p>
                {publishedAt && !Number.isNaN(publishedAt.getTime()) && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t('sharedEquipment.publishedAt')}: <time dateTime={equipment.shared_at ?? undefined}>{publishedAt.toLocaleDateString(i18n.language.startsWith('tr') ? 'tr-TR' : 'en-US')}</time>
                    </p>
                )}
            </div>
        </article>
    )
}
