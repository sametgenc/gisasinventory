import { useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, formControlClass } from '@/components/ui'
import { assetsApi } from '@/modules/assets/data'
import { workbookApi } from '@/modules/assets/workbook'
import { importCopy } from '@/modules/assets/p2-import-copy'
import type { AssetType } from '@/modules/assets'

interface Props { assetTypes: AssetType[]; canUseWorkbook: boolean; disabled?: boolean; onBusyChange: (busy: boolean) => void }
export function ImportTemplates({ assetTypes, canUseWorkbook, disabled, onBusyChange }: Props) {
    const { i18n } = useTranslation()
    const c = importCopy(i18n.language)
    const [typeId, setTypeId] = useState('')
    const [busy, setBusy] = useState<'single' | 'combined' | null>(null)
    const [error, setError] = useState('')
    async function download(kind: 'single' | 'combined') {
        if (busy || disabled || (kind === 'single' && !typeId) || (kind === 'combined' && !canUseWorkbook)) return
        setBusy(kind); onBusyChange(true); setError('')
        try {
            const blob = kind === 'single' ? await assetsApi.downloadTemplate(typeId) : await workbookApi.template()
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url; link.download = kind === 'single' ? 'inventory-template.xlsx' : 'combined-inventory-template.xlsx'
            document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
        } catch { setError(c.downloadError) }
        finally { setBusy(null); onBusyChange(false) }
    }
    return <section aria-label={c.templates} className="min-w-0 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
        <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{c.templates}</h3><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{c.templatesHelp}</p></div>
        <FormField label={c.templateType}><select className={formControlClass} value={typeId} disabled={disabled || !!busy} onChange={event => setTypeId(event.target.value)}><option value="">{c.chooseType}</option>{assetTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></FormField>
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" icon={<Download size={15} />} disabled={!typeId || disabled || !!busy} loading={busy === 'single'} onClick={() => void download('single')}>{c.oneTemplate}</Button>{canUseWorkbook && <Button type="button" size="sm" variant="secondary" icon={<Download size={15} />} disabled={disabled || !!busy} loading={busy === 'combined'} onClick={() => void download('combined')}>{c.combinedTemplate}</Button>}</div>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    </section>
}
