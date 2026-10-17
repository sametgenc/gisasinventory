import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronRight, Eye, Hash, Layers, Pencil, Search, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, EmptyState, FormField, Pagination, cn, formControlClass } from '@/components/ui'
import { categoryCodes } from '@/modules/assets/catalog'
import { getCatalogCopy } from '@/modules/assets/catalog-copy'
import type { AssetType } from '@/modules/assets'

interface CatalogWorkspaceProps {
    types: AssetType[]
    canManage: boolean
    canAddToInventory: boolean
    loading: boolean
    fetching: boolean
    onView: (type: AssetType) => void
    onEdit: (type: AssetType) => void
    onDelete: (type: AssetType) => void
    onCreate: () => void
    search: string
    onSearchChange: (value: string) => void
    category: string
    onCategoryChange: (value: string) => void
    grade: string
    onGradeChange: (value: string) => void
    page: number
    onPageChange: (value: number) => void
    pageSize: number
    onPageSizeChange: (value: number) => void
}

export function CatalogWorkspace({
    types, canManage, canAddToInventory, loading, fetching, onView, onEdit, onDelete, onCreate,
    search, onSearchChange, category, onCategoryChange, grade, onGradeChange,
    page, onPageChange, pageSize, onPageSizeChange,
}: CatalogWorkspaceProps) {
    const { t, i18n } = useTranslation()
    const copy = getCatalogCopy(i18n.language)
    const normalizedSearch = search.trim().toLocaleLowerCase(i18n.language)
    const filtered = types.filter(type => {
        const text = [type.name, type.description, type.catalog_code, type.category_code ? t(`catalog.categories.${type.category_code}`) : ''].join(' ').toLocaleLowerCase(i18n.language)
        return text.includes(normalizedSearch)
            && (!category || (category === 'uncategorized' ? !type.category_code : type.category_code === category))
            && (!grade || (grade === 'excluded' ? type.sharing_excluded : grade === 'unknown' ? !type.sharing_class : type.sharing_class === grade))
    }).sort((left, right) => left.name.localeCompare(right.name, i18n.language))
    const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
    const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    const hasFilters = !!(search.trim() || category || grade)
    const reset = () => { onSearchChange(''); onCategoryChange(''); onGradeChange(''); onPageChange(1) }
    const categories = [...categoryCodes, 'uncategorized'].map(code => ({
        code,
        name: code === 'uncategorized' ? t('catalog.uncategorized') : t(`catalog.categories.${code}`),
        count: types.filter(type => code === 'uncategorized' ? !type.category_code : type.category_code === code).length,
    })).filter(item => item.count > 0 || item.code === category)
    const selectCategory = (value: string) => { onCategoryChange(value); onPageChange(1) }

    return (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
            <aside className="hidden min-w-0 lg:block">
                <nav aria-label={copy.categories} className="sticky top-5 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <h2 className="border-b border-slate-100 px-3 py-2.5 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">{copy.categories}</h2>
                    <div className="p-1.5">
                        {[{ code: '', name: copy.allTypes, count: types.length }, ...categories].map(item => (
                            <button key={item.code} type="button" aria-pressed={category === item.code} onClick={() => selectCategory(item.code)} className={cn('flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500', category === item.code ? 'bg-blue-50 font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-200' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800')}>
                                {item.code ? <span className="w-4 shrink-0 text-center font-mono text-[11px]">{item.code === 'uncategorized' ? '—' : item.code}</span> : <Layers size={14} className="mx-px shrink-0" aria-hidden />}
                                <span className="min-w-0 flex-1 break-words leading-4">{item.name}</span>
                                <span className="text-xs tabular-nums opacity-70">{item.count}</span>
                            </button>
                        ))}
                    </div>
                </nav>
            </aside>

            <section aria-label={copy.allTypes} className="min-w-0">
                <div className="mb-2 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <FormField label={t('catalog.search')}>
                        <div className="relative">
                            <Search size={17} className="pointer-events-none absolute left-3 top-3 text-slate-400" aria-hidden />
                            <input aria-label={t('catalog.search')} type="search" className={cn(formControlClass, 'pl-10')} placeholder={t('catalog.searchPlaceholder')} value={search} onChange={event => { onSearchChange(event.target.value); onPageChange(1) }} />
                        </div>
                    </FormField>
                    <div className="lg:hidden"><FormField label={t('catalog.category')}>
                        <select className={formControlClass} value={category} onChange={event => selectCategory(event.target.value)}>
                            <option value="">{copy.allTypes}</option>
                            {categories.map(item => <option key={item.code} value={item.code}>{item.name} ({item.count})</option>)}
                        </select>
                    </FormField></div>
                    <details className="relative self-end">
                        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 marker:content-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                            {copy.assessment}{grade && <span className="h-2 w-2 rounded-full bg-blue-600" />}<ChevronRight size={14} aria-hidden />
                        </summary>
                        <div className="mt-2 w-full rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:right-0 sm:z-10 sm:w-72 sm:shadow-lg">
                            <FormField label={t('catalog.grade')} help={copy.assessmentHelp}>
                                <select className={formControlClass} value={grade} onChange={event => { onGradeChange(event.target.value); onPageChange(1) }}>
                                    <option value="">{t('catalog.allGrades')}</option>
                                    {['A', 'B', 'C'].map(code => <option key={code} value={code}>{t(`catalog.grades.${code}`)}</option>)}
                                    <option value="excluded">{t('catalog.excluded')}</option>
                                    <option value="unknown">{t('catalog.unclassified')}</option>
                                </select>
                            </FormField>
                        </div>
                    </details>
                </div>
                <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2">
                    <p role="status" className="text-xs text-slate-500 dark:text-slate-400">{loading ? t('common.loading') : copy.resultCount(filtered.length, types.length)}</p>
                    {hasFilters && <Button variant="ghost" size="sm" onClick={reset}>{t('ux.clearFilters')}</Button>}
                </div>

                {loading ? <div aria-busy="true" className="space-y-2">{[1, 2, 3, 4].map(index => <div key={index} className="h-20 animate-pulse rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />)}</div>
                    : filtered.length === 0 ? <EmptyState icon={<Layers size={36} />} title={t(types.length ? 'catalog.noMatches' : 'assetTypes.noTypesYet')} description={types.length ? t('catalog.clearFiltersHelp') : copy.detailHelp} action={hasFilters ? <Button variant="secondary" onClick={reset}>{t('ux.clearFilters')}</Button> : canManage ? <Button onClick={onCreate}>{t('assetTypes.addNew')}</Button> : undefined} />
                        : <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                            <div aria-hidden className="hidden gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 xl:grid xl:grid-cols-[minmax(0,1fr)_120px_110px_100px]">
                                <span>{copy.typeColumn}</span><span>{copy.trackingColumn}</span><span>{copy.fieldsColumn}</span><span className="text-right">{copy.actionColumn}</span>
                            </div>
                            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                {visible.map(type => {
                                    const requiredCount = type.schema.filter(field => field.required).length
                                    const optionalCount = type.schema.length - requiredCount
                                    return <li key={type.id} className="grid min-h-12 min-w-0 grid-cols-2 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 xl:grid-cols-[minmax(0,1fr)_120px_110px_100px]">
                                        <div className="col-span-2 min-w-0 xl:col-span-1">
                                            <button type="button" onClick={() => onView(type)} className="break-words text-left text-sm font-medium leading-5 text-slate-900 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-white dark:hover:text-blue-300">{type.name}</button>
                                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                                <span className="inline-flex min-w-0 items-center gap-1 font-mono"><Hash size={12} className="shrink-0" aria-hidden /><span className="break-all">{type.catalog_code || copy.missingCode}</span></span>
                                                <span>{type.category_code ? t(`catalog.categories.${type.category_code}`) : t('catalog.uncategorized')}</span>
                                                {type.sharing_excluded && <Badge variant="neutral" size="sm">{t('catalog.excluded')}</Badge>}
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-600 dark:text-slate-300">{type.tracking_mode === 'stock' ? copy.countTracking : copy.individualTracking}</div>
                                        <div className="flex flex-wrap justify-end gap-x-2 text-xs text-slate-500 dark:text-slate-400 xl:block">{type.schema.length === 0 ? copy.noTechnicalFields : <>{optionalCount > 0 && <span className="block">{copy.optionalCount(optionalCount)}</span>}{requiredCount > 0 && <span className="block text-amber-700 dark:text-amber-300">{copy.requiredCount(requiredCount)}</span>}</>}</div>
                                        <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 xl:col-span-1 xl:justify-end">
                                            <Button variant="ghost" size="sm" icon={<Eye size={15} aria-hidden />} aria-label={`${t('catalog.viewType')}: ${type.name}`} onClick={() => onView(type)}>{t('assetTypes.list.view')}</Button>
                                            {canManage && <div className="flex items-center gap-1">
                                                <button type="button" aria-label={`${t('common.edit')}: ${type.name}`} onClick={() => onEdit(type)} className="rounded-md p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-blue-950"><Pencil size={15} aria-hidden /></button>
                                                <button type="button" aria-label={`${t('common.delete')}: ${type.name}`} onClick={() => onDelete(type)} className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-950"><Trash2 size={15} aria-hidden /></button>
                                            </div>}
                                            {!canManage && <Link to="/assets" search={{ asset_type: type.id, ...(canAddToInventory ? { add: true } : {}) }} aria-label={`${canAddToInventory ? copy.inventoryForType : copy.inventory}: ${type.name}`} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300">{canAddToInventory ? copy.inventoryForType : copy.inventory}<ArrowRight size={14} aria-hidden /></Link>}
                                        </div>
                                    </li>
                                })}
                            </ul>
                        </div>}
                {!loading && filtered.length > 12 && <Pagination page={currentPage} pageSize={pageSize} totalItems={filtered.length} pageSizeOptions={[12, 24, 48]} onPageSizeChange={value => { onPageSizeChange(value); onPageChange(1) }} onPageChange={onPageChange} itemLabel={t('pagination.types')} disabled={fetching} className="mt-4 rounded-lg" />}
            </section>
        </div>
    )
}
