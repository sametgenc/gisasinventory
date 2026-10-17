import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { inventoryCopy } from '@/modules/assets/inventory-copy'

interface Props {
    loaded: boolean
    equipmentCount: number
    stockQuantity: number
    invalidStock: boolean
    typeCount: number
}

export function InventoryWorkspaceIntro(props: Props) {
    const { t, i18n } = useTranslation()
    const c = inventoryCopy(i18n.language)
    const format = (value: number) => value.toLocaleString(i18n.language)
    return <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {props.loaded && <dl className="flex flex-wrap gap-x-5 gap-y-2 px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
            {[
                { label: c.equipment, value: format(props.equipmentCount) },
                { label: c.stock, value: props.invalidStock ? t('inventory.quantityUnknown') : format(props.stockQuantity) },
                { label: c.types, value: format(props.typeCount) },
            ].map(item => <div key={item.label} className="flex min-w-0 gap-2"><dt>{item.label}</dt><dd className="font-semibold tabular-nums text-slate-900 dark:text-white">{item.value}</dd></div>)}
        </dl>}
        <details className="group border-t border-slate-200 dark:border-slate-700">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-2 text-xs font-medium text-slate-600 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:text-slate-300"><span>{c.codeGuide}</span><ChevronDown size={15} className="shrink-0 transition-transform group-open:rotate-180" /></summary>
            <div className="space-y-2 border-t border-slate-200 p-4 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <p>{c.codeOwnership}</p>
                <p><Link to="/assets/types" className="font-medium text-blue-700 underline dark:text-blue-300">{c.catalog}</Link> · {c.catalogHelp} {c.ownHelp}</p>
            </div>
        </details>

    </div>
}
