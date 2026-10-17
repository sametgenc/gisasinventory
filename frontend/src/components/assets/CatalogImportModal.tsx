import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { Badge, Button, DataTable, FormField, Modal, formControlClass, type ColumnDef } from '@/components/ui'
import { getApiErrorMessage } from '@/api/errors'
import { assetKeys } from '@/modules/assets/hooks'
import { catalogApi, type CatalogMode, type CatalogPreview, type CatalogRow, type CatalogSummary } from '@/modules/assets/catalog'
import { useDraftGuard } from '@/hooks/useDraftGuard'

export function CatalogImportModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [file, setFile] = useState<File | null>(null)
    const [mode, setMode] = useState<CatalogMode>('create')
    const [preview, setPreview] = useState<CatalogPreview | null>(null)
    const [result, setResult] = useState<CatalogSummary | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [onlyErrors, setOnlyErrors] = useState(false)
    const { requestClose: close, confirmation } = useDraftGuard({ dirty: !result && (!!file || mode !== 'create'), busy, onClose })
    const displayedValues = (row: CatalogRow) => row.operation === 'skip' && row.current_values ? row.current_values : row.values
    const changeLabels: Record<string, string> = {
        name: 'assetTypes.typeName', description: 'common.description', catalog_code: 'catalog.code',
        category_code: 'catalog.category', sharing_class: 'catalog.grade', exclusion_reason: 'catalog.exclusion',
    }

    async function download() {
        setBusy(true); setError('')
        try {
            const url = URL.createObjectURL(await catalogApi.template())
            const link = document.createElement('a')
            link.href = url; link.download = 'varlik-tipi-katalog-sablonu.xlsx'
            document.body.appendChild(link); link.click(); link.remove()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch (err) { setError(getApiErrorMessage(err, t('catalog.failed'))) }
        finally { setBusy(false) }
    }

    async function inspect() {
        if (!file) return
        setBusy(true); setError(''); setPreview(null); setOnlyErrors(false)
        try { setPreview(await catalogApi.preview(file, mode)) }
        catch (err) { setError(getApiErrorMessage(err, t('catalog.failed'))) }
        finally { setBusy(false) }
    }

    async function commit() {
        if (!file || !preview?.preview_token) return
        setBusy(true); setError('')
        try {
            const response = await catalogApi.import(file, mode, preview.preview_token)
            setResult(response.summary)
            await queryClient.invalidateQueries({ queryKey: assetKeys.all })
        } catch (err) {
            setError(getApiErrorMessage(err, t('catalog.failed')))
            // After a timeout the result is unknown. Re-preview before any retry.
            setPreview(null)
        } finally { setBusy(false) }
    }

    const columns: ColumnDef<CatalogRow>[] = [
        { key: 'row', header: t('catalog.row'), cell: row => row.row },
        { key: 'name', header: t('catalog.type'), cell: row => <div className="min-w-40"><span className="font-medium">{displayedValues(row).name || '—'}</span><div className="text-xs text-slate-500 dark:text-slate-400">{displayedValues(row).catalog_code || '—'}</div></div> },
        { key: 'category', header: t('catalog.category'), cell: row => <span>{displayedValues(row).category_code || '—'}</span> },
        { key: 'grade', header: t('catalog.grade'), cell: row => <div className="space-y-1"><span>{displayedValues(row).sharing_class || '—'}</span>{row.sharing_excluded && <div><Badge variant="warning">{t('catalog.excluded')}</Badge></div>}</div> },
        { key: 'result', header: t('catalog.result'), cell: row => <div className="min-w-48 max-w-md whitespace-normal"><Badge variant={row.operation === 'error' ? 'danger' : row.operation === 'create' ? 'success' : 'neutral'}>{t(`catalog.operations.${row.operation}`)}</Badge>{row.skip_reason && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{t(`ux.skipReasons.${row.skip_reason}`)}</p>}{row.errors.map((message, i) => <p className="mt-1 text-xs text-red-700 dark:text-red-300" key={i}>{message}</p>)}{row.operation === 'update' && Object.entries(row.changes ?? {}).map(([key, change]) => <div key={key} className="mt-2 border-l-2 border-blue-200 pl-2 text-xs dark:border-blue-800"><p className="font-medium">{t(changeLabels[key] ?? key)}</p><p className="mt-0.5 text-slate-500 dark:text-slate-400">{t('ux.before')}: {change.before || t('ux.blank')}</p><p className="mt-0.5 text-slate-800 dark:text-slate-200">{t('ux.after')}: {change.after || t('ux.cleared')}</p></div>)}{row.operation !== 'update' && displayedValues(row).exclusion_reason && <p className="mt-1 text-xs">{displayedValues(row).exclusion_reason}</p>}{row.operation !== 'update' && displayedValues(row).description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{displayedValues(row).description}</p>}</div> },
    ]

    return <Modal isOpen onClose={close} closeDisabled={busy} title={t('catalog.importTitle')} size="xl" footer={
        <div className="flex flex-wrap items-center justify-end gap-2 p-4">
            <Button variant="secondary" disabled={busy} onClick={close}>{t(result ? 'common.close' : 'common.cancel')}</Button>
            {!result && <Button loading={busy} disabled={!file} onClick={inspect} variant={preview ? 'secondary' : 'primary'}>{t(preview ? 'catalog.repreview' : 'catalog.preview')}</Button>}
            {!result && preview && <Button disabled={busy || !preview.preview_token || preview.summary.error > 0 || preview.summary.create + preview.summary.update === 0} onClick={commit} icon={<Upload size={16} />}>{t('catalog.confirm', { count: preview.summary.create + preview.summary.update })}</Button>}
        </div>
    }>
        {confirmation}
        <div className="space-y-5" aria-busy={busy}>
            <ol className="flex flex-wrap gap-5 border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400" aria-label={t('catalog.steps')}>
                {['file', 'review', 'done'].map((step, index) => <li key={step} aria-current={(result ? 2 : preview ? 1 : 0) === index ? 'step' : undefined} className="border-b-2 border-transparent pb-3 aria-[current=step]:border-blue-700 aria-[current=step]:font-semibold aria-[current=step]:text-slate-900 dark:aria-[current=step]:border-blue-400 dark:aria-[current=step]:text-white">{index + 1}. {t(`catalog.stepsLabel.${step}`)}</li>)}
            </ol>
            {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}
            {result ? <div className="py-6 text-center" role="status">
                <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={28} />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t('catalog.success')}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t('catalog.successCounts', result)}</p>
                <p className="mx-auto mt-4 max-w-lg text-sm text-slate-600 dark:text-slate-300">{t('catalog.nextStep')}</p>
                <Link to="/assets" className="mt-5 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" onClick={onClose}>{t('catalog.inventoryLink')}</Link>
            </div> : <>
                <p className="text-sm text-slate-600 dark:text-slate-300">{t('catalog.importHelp')}</p>
                {!preview && <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <div className="flex items-start gap-3"><FileSpreadsheet size={20} className="shrink-0 text-slate-500 dark:text-slate-400" /><div><p className="text-sm font-medium text-slate-900 dark:text-white">{t('catalog.templateTitle')}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{t('catalog.templateHelp')}</p></div></div>
                    <Button variant="secondary" disabled={busy} icon={<Download size={16} />} onClick={download}>{t('catalog.download')}</Button>
                </div>}
                <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <FormField label={t('catalog.file')} help={t('catalog.fileHelp')}>
                        <input type="file" accept=".xlsx" className={`${formControlClass} file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-slate-700 dark:file:bg-slate-800 dark:file:text-slate-200`} onChange={event => {
                            const selected = event.target.files?.[0] || null
                            setPreview(null); setError(''); setFile(null)
                            if (selected && (!selected.name.toLowerCase().endsWith('.xlsx') || selected.size > 5 * 1024 * 1024)) {
                                setError(t('catalog.invalidFile')); event.target.value = ''; return
                            }
                            setFile(selected)
                        }} />
                    </FormField>
                    <FormField label={t('catalog.mode')} help={t(mode === 'create' ? 'catalog.createHelp' : 'catalog.updateHelp')}>
                        <select value={mode} className={formControlClass} onChange={e => { setMode(e.target.value as CatalogMode); setPreview(null); setError('') }}>
                            <option value="create">{t('catalog.createOnly')}</option>
                            <option value="update">{t('catalog.updateExisting')}</option>
                        </select>
                    </FormField>
                </fieldset>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('catalog.schemaHelp')} {t('catalog.preliminaryHelp')}</p>
                {mode === 'update' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{t('ux.updateClearsBlanks')}</p>}
                {preview && <section aria-label={t('catalog.reviewTitle')} className="space-y-3">
                    <div className="flex flex-wrap gap-2" role="status">{(['create', 'update', 'skip', 'error'] as const).map(operation => <Badge key={operation} variant={operation === 'error' && preview.summary.error ? 'danger' : 'neutral'}>{t(`catalog.operations.${operation}`)}: {preview.summary[operation]}</Badge>)}</div>
                    {preview.summary.error > 0 && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t('catalog.errorsHelp')}</p>}
                    {preview.summary.create + preview.summary.update === 0 && !preview.summary.error && <p className="text-sm text-slate-600 dark:text-slate-300">{t('catalog.noChanges')}</p>}
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={onlyErrors} onChange={e => setOnlyErrors(e.target.checked)} />{t('catalog.onlyErrors')}</label>
                    <DataTable data={preview.rows.filter(row => !onlyErrors || row.errors.length > 0)} columns={columns} getRowId={row => row.row} pageSize={10} maxBodyHeight="40vh" />
                </section>}
            </>}
        </div>
    </Modal>
}
