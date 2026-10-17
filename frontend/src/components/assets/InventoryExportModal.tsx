import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import type { AssetType } from '@/modules/assets'
import { assetsApi } from '@/modules/assets/data'
import { exportCopy } from '@/modules/assets/export-copy'
import { getApiErrorMessage } from '@/api/errors'
import { Button, FormField, FormFooter, FormSection, Modal, formControlClass } from '@/components/ui'

export type ExportScope = 'visible' | 'type'

export function InventoryExportModal({ onClose, assetTypes, tenants, isSuperuser, initialScope, initialTypeId, initialTenantId, visibleCount, onVisibleExport }: {
    onClose: () => void
    assetTypes: AssetType[]
    tenants: { id: number; name: string }[]
    isSuperuser: boolean
    initialScope: ExportScope
    initialTypeId: string | null
    initialTenantId: number | null
    visibleCount: number
    onVisibleExport: () => void
}) {
    const { t, i18n } = useTranslation()
    const c = exportCopy(i18n.language)
    const [scope, setScope] = useState<ExportScope>(initialScope)
    const [typeId, setTypeId] = useState(initialTypeId ?? '')
    const [tenantId, setTenantId] = useState<number | null>(isSuperuser ? initialTenantId : null)
    const [downloading, setDownloading] = useState<'list' | 'template' | null>(null)
    const [error, setError] = useState<string | null>(null)
    const busy = useRef(false)
    const selectedType = assetTypes.find(type => type.id === typeId)

    const download = async (kind: 'list' | 'template') => {
        if (busy.current || (kind === 'template' || scope === 'type' ? !selectedType : visibleCount === 0)) return
        busy.current = true
        setDownloading(kind)
        setError(null)
        try {
            if (kind === 'list' && scope === 'visible') {
                onVisibleExport()
            } else {
                const blob = kind === 'template' ? await assetsApi.downloadTemplate(typeId) : await assetsApi.exportAssets(typeId, isSuperuser ? tenantId ?? undefined : undefined)
                const url = URL.createObjectURL(blob)
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = `${(selectedType?.name || 'equipment').replace(/\s/g, '_')}_${kind === 'template' ? 'template' : 'export'}.xlsx`
                document.body.appendChild(anchor)
                anchor.click()
                anchor.remove()
                URL.revokeObjectURL(url)
            }
            if (kind === 'list') onClose()
        } catch (err) {
            setError(getApiErrorMessage(err, kind === 'template' ? t('assets.templateFailed') : t('assets.exportFailed')))
        } finally {
            busy.current = false
            setDownloading(null)
        }
    }

    return <Modal isOpen onClose={onClose} closeDisabled={downloading !== null} title={c.title} size="md" footer={<FormFooter
        primaryLabel={scope === 'visible' ? c.csv : c.excel} icon={<Download size={16} />} onPrimary={() => void download('list')}
        loading={downloading === 'list'} disabled={downloading !== null || (scope === 'visible' ? visibleCount === 0 : !selectedType)} cancelDisabled={downloading !== null} onCancel={onClose}
    />}>
        <div className="space-y-5">
            {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
            <fieldset disabled={downloading !== null} className="min-w-0 space-y-5">
                <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{c.scope}</legend>
                <div className="space-y-2">
                    {(['visible', 'type'] as const).map(value => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${scope === value ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
                        <input type="radio" name="inventory-export-scope" value={value} checked={scope === value} onChange={() => { setScope(value); setError(null) }} className="mt-1 accent-blue-600" />
                        <span className="min-w-0 font-medium text-slate-900 dark:text-white">{value === 'visible' ? c.visible : c.allType}</span>
                    </label>)}
                </div>
                {scope === 'visible' ? <div role="status" className="space-y-2 text-sm text-slate-600 dark:text-slate-300"><p className="font-semibold text-slate-900 dark:text-white">{c.count(visibleCount)}</p><p>{c.visibleHelp}</p></div> : <>
                    <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300"><p>{c.typeHelp}</p><p>{c.ignoredFilters}</p>{!isSuperuser && <p>{c.ownShipyard}</p>}</div>
                    <FormSection layout="stack">
                        <FormField label={t('assets.typeLabel')} required><select value={typeId} onChange={event => { setTypeId(event.target.value); setError(null) }} className={formControlClass}><option value="">{t('assets.typePlaceholder')}</option>{assetTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></FormField>
                        {isSuperuser && <FormField label={c.target}><select value={tenantId ?? ''} onChange={event => { setTenantId(event.target.value ? Number(event.target.value) : null); setError(null) }} className={formControlClass}><option value="">{t('assets.allShipyards')}</option>{tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></FormField>}
                    </FormSection>
                    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"><p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{c.templateHelp}</p><Button size="sm" variant="secondary" icon={<Download size={14} />} disabled={!selectedType || downloading !== null} loading={downloading === 'template'} onClick={() => void download('template')}>{t('assets.exportDialog.downloadTemplate')}</Button></div>
                </>}
            </fieldset>
        </div>
    </Modal>
}
