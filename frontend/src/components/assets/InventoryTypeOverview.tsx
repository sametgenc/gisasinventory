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
            <div className="mb-2">
                <h2 id="inventory-type-heading" className="text-sm font-medium text-slate-700 dark:text-slate-200">{t(hasStock ? 'inventory.byTypeStock' : 'inventory.byType')}</h2>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                {groups.slice((effectivePage - 1) * pageSize, effectivePage * pageSize).map(group => {
                    const stock = group.trackingMode === 'stock'
                    const modelName = [group.brand, group.model].filter(Boolean).join(' ')
                    const stockDescription = [group.materialCode, group.typeName, showOwner ? group.ownerName : ''].filter(Boolean).join(' · ')
                    return (
                        <button key={group.key} type="button" aria-label={t(stock ? 'inventory.openStock' : 'inventory.openType', { name: stock && showOwner ? [group.name, group.ownerName].filter(Boolean).join(' · ') : group.name })} onClick={() => onSelect(group)} className="group grid min-h-12 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_14px] items-center gap-3 border-b border-slate-200 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-slate-50 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-4 dark:border-slate-700 dark:hover:bg-slate-800/60">
                            <div className="min-w-0">
                                <h3 className="text-sm font-medium leading-5 text-slate-900 dark:text-white [overflow-wrap:anywhere]">{stock ? group.name : group.typeName}</h3>
                                {((stock ? stockDescription : modelName) || group.shared > 0) && <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs leading-[18px] text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">
                                    {(stock ? stockDescription : modelName) && <span>{stock ? stockDescription : modelName}</span>}
                                    {group.shared > 0 && <span>{t(stock ? 'inventory.stockListed' : 'inventory.listedCount', { count: group.shared })}</span>}
                                </div>}
                            </div>
                            <span className="max-w-28 text-right text-sm font-medium leading-5 tabular-nums text-slate-700 dark:text-slate-200 [overflow-wrap:anywhere]">{stock ? group.hasInvalidQuantity ? t('inventory.quantityUnknown') : t('inventory.stockQuantity', { quantity: numberFormat.format(group.count) }) : t(filtered ? 'inventory.matchingQuantity' : 'inventory.modelQuantity', { count: group.count })}</span>
                            <ArrowRight size={14} aria-hidden="true" className="text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-300" />
                        </button>
                    )
                })}
            </div>
            {groups.length > 12 && <div className="mt-3"><Pagination page={effectivePage} totalItems={groups.length} pageSize={pageSize} pageSizeOptions={[12, 24, 48]} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} itemLabel={t(hasStock ? 'pagination.inventoryEntries' : 'pagination.models')} /></div>}
        </section>
    )
}
