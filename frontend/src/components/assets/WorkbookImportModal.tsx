import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Download, FileSpreadsheet } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { workbookApi, type WorkbookDecisions, type WorkbookPreview, type WorkbookSummary } from '@/modules/assets/workbook'
import { extractApiError } from '@/utils/errors'
import { Button, FormField, FormFooter, Modal, Pagination, formControlClass } from '@/components/ui'

interface Props {
    isOpen: boolean; onClose: () => void; isGlobalAdmin: boolean
    tenants?: { id: number; name: string; is_active?: boolean }[]
    onImported?: () => void | Promise<unknown>
    onSingleTypeImport?: () => void
}

export function WorkbookImportModal(props: Props) {
    return props.isOpen ? <WorkbookImportContent {...props} /> : null
}

function WorkbookImportContent({ isOpen, onClose, isGlobalAdmin, tenants = [], onImported, onSingleTypeImport }: Props) {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [file, setFile] = useState<File | null>(null)
    const [tenant, setTenant] = useState<number | undefined>()
    const [decisions, setDecisions] = useState<WorkbookDecisions>({ classifications: {} })
    const [preview, setPreview] = useState<WorkbookPreview | null>(null)
    const [stale, setStale] = useState(false)
    const [result, setResult] = useState<WorkbookSummary | null>(null)
    const [busy, setBusy] = useState<'preview' | 'commit' | 'template' | null>(null)
    const [error, setError] = useState('')
    const [page, setPage] = useState(1)
    const ready = !stale && !!preview?.can_commit && !!preview.preview_token

    const changeSource = () => { setPreview(null); setResult(null); setDecisions({ classifications: {} }); setError(''); setPage(1); setStale(false) }
    const review = async () => {
        if (!file || busy) return
        setBusy('preview'); setError('')
        try { setPreview(await workbookApi.preview(file, tenant, decisions)); setStale(false); setPage(1) }
        catch (err) { setError(extractApiError(err, t('workbook.previewError'))); setPreview(null) }
        finally { setBusy(null) }
    }
    const commit = async () => {
        if (!file || !preview?.preview_token || !ready || busy) return
        setBusy('commit'); setError('')
        try {
            const response = await workbookApi.commit(file, tenant, decisions, preview.preview_token)
            setResult(response.summary)
            await queryClient.invalidateQueries({ queryKey: ['assets'] })
            await onImported?.()
        } catch (err) { setError(extractApiError(err, t('workbook.commitError'))); setStale(true) }
        finally { setBusy(null) }
    }
    const download = async () => {
        if (busy) return
        setBusy('template'); setError('')
        try {
            const url = URL.createObjectURL(await workbookApi.template())
            const link = document.createElement('a'); link.href = url; link.download = 'birlesik-envanter-sablonu.xlsx'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
        } catch (err) { setError(extractApiError(err, t('workbook.templateError'))) }
        finally { setBusy(null) }
    }
    const summary = result ?? preview?.summary
    return <Modal isOpen={isOpen} onClose={onClose} closeDisabled={!!busy} title={t('workbook.title')} size="xl" footer={result
        ? <Button onClick={onClose}>{t('common.close')}</Button>
        : <FormFooter onCancel={onClose} onPrimary={ready ? commit : review} loading={busy === 'preview' || busy === 'commit'} disabled={!file || !!busy} cancelDisabled={!!busy} primaryLabel={t(ready ? 'workbook.apply' : 'workbook.review')} icon={<FileSpreadsheet size={16} />} />}>
        {error && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
        {result ? <div role="status" className="mb-5 flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-4 text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200"><CheckCircle2 size={22} /><div><p className="font-semibold">{t('workbook.success')}</p><p className="mt-1 text-sm">{t('workbook.private')}</p></div></div> : <fieldset disabled={!!busy} className="min-w-0 space-y-5">
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('workbook.description')}</p>
            <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/40 sm:grid-cols-3">{['types', 'fields', 'inventory'].map(key => <div key={key}><p className="font-semibold text-slate-900 dark:text-white">{t(`workbook.sheets.${key}`)}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{t(`workbook.sheetHelp.${key}`)}</p></div>)}</div>
            <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" size="sm" onClick={download} icon={<Download size={15} />}>{t('workbook.template')}</Button>{onSingleTypeImport && <Button size="sm" variant="ghost" onClick={onSingleTypeImport}>{t('workbook.singleType')}</Button>}</div>
            {isGlobalAdmin && <FormField label={t('workbook.target')} help={t('workbook.targetHelp')}><select className={formControlClass} value={tenant ?? ''} onChange={event => { setTenant(event.target.value ? Number(event.target.value) : undefined); changeSource() }}><option value="">{t('workbook.typesOnly')}</option>{tenants.filter(item => item.is_active !== false).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>}
            {!isGlobalAdmin && <p className="text-xs text-slate-500 dark:text-slate-400">{t('workbook.ownTenant')}</p>}
            <FormField label={t('workbook.file')} help={t('workbook.fileHelp')}><input type="file" accept=".xlsx" className={formControlClass} onChange={event => { const selected = event.target.files?.[0] ?? null; changeSource(); setFile(selected); if (selected && selected.size > 5 * 1024 * 1024) { setFile(null); setError(t('workbook.sizeError')) } }} /></FormField>
        </fieldset>}
        {summary && <dl className="my-5 grid grid-cols-2 gap-4 border-y border-slate-200 py-4 dark:border-slate-700 sm:grid-cols-4">{(['types_created', 'types_updated', 'assets_created', 'assets_updated'] as const).map(key => <div key={key}><dt className="text-xs text-slate-500 dark:text-slate-400">{t(`workbook.summary.${key}`)}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{summary[key]}</dd></div>)}</dl>}
        {preview && !result && <div className="space-y-4">
            {preview.notices?.map((notice, index) => <p key={index} className="text-sm leading-6 text-slate-600 dark:text-slate-300">{notice}</p>)}
            {preview.types?.filter(item => item.impact?.affected_asset_count).map(item => <div key={item.catalog_code} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><p className="font-medium">{item.name}</p><p>{t('dynamicSchema.impact', { count: item.impact?.affected_asset_count, tenants: item.impact?.affected_tenant_count })}</p><p className="mt-1 text-xs">{t('dynamicSchema.impactHelp')}</p></div>)}
            {!!summary?.skipped_rows_count && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{t('workbook.skipped', { count: summary.skipped_rows_count })}</p>}
            {!!preview.action_required?.length && <fieldset disabled={!!busy} className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"><legend className="px-1 text-sm font-semibold text-amber-900 dark:text-amber-200">{t('workbook.decisions')}</legend>{preview.action_required.map((item, index) => <div key={index}><p className="mb-2 text-sm text-amber-900 dark:text-amber-200">{item.sheet} · {t('workbook.row', { count: item.row })}: {item.message}</p>{item.choices?.length && <FormField label={t('workbook.classification')}><select className={formControlClass} value={decisions.classifications[`${item.sheet}:${item.row}`] ?? ''} onChange={event => { setDecisions(previous => ({ ...previous, classifications: { ...previous.classifications, [`${item.sheet}:${item.row}`]: event.target.value } })); setStale(true) }}><option value="">{t('workbook.choose')}</option>{item.choices.map(choice => <option key={choice} value={choice}>{t(`catalog.grades.${choice}`)}</option>)}</select></FormField>}</div>)}</fieldset>}
            {!!preview.errors?.length && <div role="alert" className="rounded-md border border-red-200 p-4 text-sm text-red-800 dark:border-red-900 dark:text-red-200"><p className="mb-2 font-semibold">{t('workbook.fixFile')}</p><ul className="list-disc space-y-1 pl-5">{preview.errors.slice(0, 30).map((item, index) => <li key={index}>{[item.sheet, item.row ? t('workbook.row', { count: item.row }) : '', item.message ?? item.errors?.join('; ')].filter(Boolean).join(' · ')}</li>)}</ul></div>}
            {!!preview.rows?.length && <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>{['record', 'code', 'operation'].map(key => <th key={key} className="px-4 py-3 font-medium">{t(`workbook.table.${key}`)}</th>)}</tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{preview.rows.slice((page - 1) * 24, page * 24).map((row, index) => <tr key={index}><td className="px-4 py-3 text-slate-900 dark:text-white"><p className="font-medium [overflow-wrap:anywhere]">{row.name || row.sheet}</p><p className="mt-1 text-xs text-slate-500">{row.sheet} · {t('workbook.row', { count: row.row })}</p>{row.changes && Object.entries(row.changes).map(([key, change]) => <div key={key} className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800"><p className="font-medium text-slate-700 dark:text-slate-200">{t(`workbook.changeLabels.${key}`, { defaultValue: key })}</p><p className="mt-1 text-slate-500 dark:text-slate-400">{t('workbook.before', { value: change.before || '—' })}</p><p className="mt-1 text-slate-900 dark:text-white">{t('workbook.after', { value: change.after || t('workbook.cleared') })}</p></div>)}{row.errors?.map((message, i) => <p key={i} className="mt-1 text-xs text-red-700 dark:text-red-300">{message}</p>)}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">{row.catalog_code || '—'}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{t(`workbook.operations.${row.operation}`, { defaultValue: t('workbook.operations.review') })}</td></tr>)}</tbody></table></div><Pagination page={page} pageSize={24} totalItems={preview.rows.length} onPageChange={setPage} disabled={!!busy} /></div>}
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t(stale ? 'workbook.reviewAgain' : ready ? 'workbook.ready' : 'workbook.blocked')}</p>
        </div>}
    </Modal>
}
