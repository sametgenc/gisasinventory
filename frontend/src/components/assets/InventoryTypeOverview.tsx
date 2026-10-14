import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Pagination } from '@/components/ui'
import type { Asset, AssetType } from '@/modules/assets'
import { getInventoryModelGroups, type InventoryModelGroup } from '@/modules/assets/inventory-groups'

export function InventoryTypeOverview({ assets, assetTypes, onSelect, filtered = false, showOwner = false }: {
    assets: Asset[]
    assetTypes: AssetType[]
    onSelect: (group: InventoryModelGroup) => void
    filtered?: boolean
    showOwner?: boolean
}) {
    const { t, i18n } = useTranslation()
    const groups = getInventoryModelGroups(assets, assetTypes)
        .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(24)
    const effectivePage = Math.min(page, Math.max(1, Math.ceil(groups.length / pageSize)))
    if (page !== effectivePage) setPage(effectivePage)
    const hasStock = groups.some(group => group.trackingMode === 'stock')
    const numberFormat = new Intl.NumberFormat(i18n.language.startsWith('tr') ? 'tr-TR' : 'en-US')

    return (
        <section aria-labelledby="inventory-type-heading">
            <div className="mb-4">
                <h2 id="inventory-type-heading" className="text-lg font-semibold text-slate-900 dark:text-white">{t(hasStock ? 'inventory.byTypeStock' : 'inventory.byType')}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t(hasStock ? 'inventory.byTypeStockHelp' : 'inventory.byTypeHelp')}</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                {groups.slice((effectivePage - 1) * pageSize, effectivePage * pageSize).map(group => {
                    const stock = group.trackingMode === 'stock'
                    const modelName = group.model ? [group.brand, group.model].filter(Boolean).join(' ')
                        : [group.brand, t('inventory.modelMissing')].filter(Boolean).join(' · ')
                    const stockDescription = [group.materialCode, group.typeName, showOwner ? group.ownerName : ''].filter(Boolean).join(' · ')
                    return (
                        <button key={group.key} type="button" aria-label={t(stock ? 'inventory.openStock' : 'inventory.openType', { name: stock && showOwner ? [group.name, group.ownerName].filter(Boolean).join(' · ') : group.name })} onClick={() => onSelect(group)} className="group flex w-full min-w-0 flex-wrap items-center gap-x-5 gap-y-3 border-b border-slate-200 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-slate-50 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:flex-nowrap sm:px-5 dark:border-slate-700 dark:hover:bg-slate-800/60">
                            <div className="min-w-0 flex-1 basis-[60%]">
                                <h3 className="text-base font-semibold leading-snug text-slate-900 dark:text-white [overflow-wrap:anywhere]">{stock ? group.name : group.typeName}</h3>
                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">{stock ? stockDescription : modelName || t('inventory.modelMissing')}</p>
                                {group.shared > 0 && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t(stock ? 'inventory.stockListed' : 'inventory.listedCount', { count: group.shared })}</p>}
                            </div>
                            <span className="shrink-0 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{stock ? group.hasInvalidQuantity ? t('inventory.quantityUnknown') : t('inventory.stockQuantity', { quantity: numberFormat.format(group.count) }) : t(filtered ? 'inventory.matchingQuantity' : 'inventory.modelQuantity', { count: group.count })}</span>
                            <span className="inline-flex w-full shrink-0 items-center gap-2 text-sm font-medium text-blue-700 sm:w-auto dark:text-blue-300">{t(stock ? 'inventory.openStockDetail' : 'inventory.openModelList')}<ArrowRight size={16} aria-hidden="true" /></span>
                        </button>
                    )
                })}
            </div>
            {groups.length > 12 && <div className="mt-4"><Pagination page={effectivePage} totalItems={groups.length} pageSize={pageSize} pageSizeOptions={[12, 24, 48]} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} itemLabel={t(hasStock ? 'pagination.inventoryEntries' : 'pagination.models')} /></div>}
        </section>
    )
}
