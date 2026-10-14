import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Eye, Pencil, Share2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Asset, AssetType } from '@/modules/assets'
import { getEquipmentModelKey, getInventoryModelGroups, getStockRecord, isStockType } from '@/modules/assets/inventory-groups'
import { Pagination } from '@/components/ui'
import { useClickOutside } from '@/hooks/useClickOutside'

interface EquipmentRecordListProps {
    assets: Asset[]
    assetTypes: AssetType[]
    showType: boolean
    showModel?: boolean
    showOwner: boolean
    canManageSharing: boolean
    onDetail: (asset: Asset) => void
    onEdit: (asset: Asset) => void
    onDelete: (asset: Asset) => void
    onSharing: (asset: Asset) => void
}

function RecordActions({ asset, code, canManageSharing, onEdit, onDelete, onSharing }: Pick<EquipmentRecordListProps, 'canManageSharing' | 'onEdit' | 'onDelete' | 'onSharing'> & { asset: Asset; code: string }) {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelId = useId()
    const close = useCallback(() => setIsOpen(false), [])
    const ref = useClickOutside<HTMLDivElement>(close)

    useEffect(() => {
        if (!isOpen) return
        const onEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            close()
            triggerRef.current?.focus()
        }
        document.addEventListener('keydown', onEscape)
        return () => document.removeEventListener('keydown', onEscape)
    }, [isOpen, close])

    const runAction = (callback: (asset: Asset) => void) => {
        // Keep a mounted return target for the dialog that the action opens.
        triggerRef.current?.focus()
        close()
        callback(asset)
    }
    const actionClass = 'flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800'

    return <div ref={ref} className="relative shrink-0" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) close()
    }}>
        <button ref={triggerRef} type="button" aria-label={t('inventory.recordActions', { code })} aria-expanded={isOpen} aria-controls={panelId} onClick={() => setIsOpen(open => !open)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
            {t('inventory.actions')}<ChevronDown size={15} aria-hidden="true" className={isOpen ? 'rotate-180' : ''} />
        </button>
        {isOpen && <div id={panelId} role="group" aria-label={t('inventory.recordActions', { code })} className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900">
            {canManageSharing && <button type="button" onClick={() => runAction(onSharing)} aria-label={`${t('inventory.sharingAction')}: ${code}`} className={`${actionClass} text-blue-700 dark:text-blue-300`}><Share2 size={16} aria-hidden="true" />{t('inventory.sharingAction')}</button>}
            <button type="button" onClick={() => runAction(onEdit)} aria-label={`${t('common.edit')}: ${code}`} className={`${actionClass} text-slate-700 dark:text-slate-200`}><Pencil size={16} aria-hidden="true" />{t('common.edit')}</button>
            <button type="button" onClick={() => runAction(onDelete)} aria-label={`${t('common.delete')}: ${code}`} className={`${actionClass} text-red-700 dark:text-red-300`}><Trash2 size={16} aria-hidden="true" />{t('common.delete')}</button>
        </div>}
    </div>
}

export function EquipmentRecordList({ assets, assetTypes, showType, showModel = true, showOwner, canManageSharing, onDetail, onEdit, onDelete, onSharing }: EquipmentRecordListProps) {
    const { t, i18n } = useTranslation()
    const numberFormat = new Intl.NumberFormat(i18n.language.startsWith('tr') ? 'tr-TR' : 'en-US')
    const [page, setPage] = useState(1)
    const pageSize = 24
    const effectivePage = Math.min(page, Math.max(1, Math.ceil(assets.length / pageSize)))
    const typeMap = new Map(assetTypes.map(type => [type.id, type]))
    const groupMap = new Map(getInventoryModelGroups(assets, assetTypes).map(group => [group.key, group]))

    return <>
        <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            {assets.slice((effectivePage - 1) * pageSize, effectivePage * pageSize).map(asset => {
                const type = typeMap.get(asset.asset_type)
                const stock = isStockType(type) ? getStockRecord(asset, type) : null
                const identifierKey = type?.schema.find(field => field.is_unique_key)?.key
                const identifier = identifierKey ? asset.custom_data[identifierKey] : undefined
                const code = typeof identifier === 'string' && identifier.trim() !== '' ? identifier.trim()
                    : typeof identifier === 'number' && Number.isFinite(identifier) ? String(identifier) : asset.id
                const group = groupMap.get(getEquipmentModelKey(asset, type))
                const modelName = [group?.brand, group?.model].filter(Boolean).join(' ')
                const secondaryName = stock ? [code, showType ? asset.asset_type_name : ''].filter(Boolean).join(' · ')
                    : showType ? group?.name || asset.asset_type_name : showModel ? modelName : ''
                const stateLabel = t(asset.is_listed_for_sharing ? 'inventory.published' : asset.is_shared ? 'inventory.blockedPublication' : 'inventory.private')
                return <article key={asset.id} className="flex min-w-0 flex-col gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-5 sm:px-5 dark:border-slate-700" aria-label={`${asset.asset_type_name} · ${code}`}>
                    <div className="min-w-0 flex-1">
                        <h3><button type="button" onClick={() => onDetail(asset)} className="inline-flex max-w-full items-center gap-2 rounded-sm text-left text-base font-semibold text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-200"><span className="min-w-0 [overflow-wrap:anywhere]">{stock?.materialName || code}</span><Eye size={15} aria-hidden="true" className="shrink-0 text-slate-400" /></button></h3>
                        {(secondaryName || (showOwner && asset.tenant_name)) && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">{[secondaryName, showOwner ? asset.tenant_name : ''].filter(Boolean).join(' · ')}</p>}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                        {stock && <span className="text-base font-semibold tabular-nums text-slate-900 dark:text-white">{stock.quantity === null ? t('inventory.quantityUnknown') : t('inventory.stockQuantity', { quantity: numberFormat.format(stock.quantity) })}</span>}
                        <span className={`text-xs ${asset.is_listed_for_sharing ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>{stateLabel}</span>
                        <RecordActions asset={asset} code={code} canManageSharing={canManageSharing} onEdit={onEdit} onDelete={onDelete} onSharing={onSharing} />
                    </div>
                </article>
            })}
        </div>
        {assets.length > pageSize && <div className="mt-4"><Pagination page={effectivePage} totalItems={assets.length} pageSize={pageSize} onPageChange={setPage} /></div>}
    </>
}
