import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Card } from '@/components/ui'
import { settingsApi, type StorageDiskUsage, type StorageUsageData } from './data'

function formatBytes(bytes: number, language: string) {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
    const index = bytes > 0 ? Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)) : 0
    return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / 1024 ** index)} ${units[index]}`
}

const statusStyle = {
    ok: 'text-slate-700 dark:text-slate-300',
    warning: 'text-amber-800 dark:text-amber-300',
    critical: 'text-red-700 dark:text-red-300',
    unavailable: 'text-slate-600 dark:text-slate-400',
}
const barStyle = { ok: 'bg-blue-600', warning: 'bg-amber-600', critical: 'bg-red-600', unavailable: 'bg-slate-400' }

function DiskUsageCard({ disk, kind }: { disk: StorageDiskUsage; kind: 'application' | 'media' }) {
    const { t, i18n } = useTranslation()
    const headingId = useId()
    const available = disk.status !== 'unavailable' && [disk.total_bytes, disk.used_bytes, disk.free_bytes, disk.used_percent].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    const percent = available ? Math.min(disk.used_percent!, 100) : null
    const status = available ? disk.status : 'unavailable'
    return <Card role="article" aria-labelledby={headingId} className="min-w-0 p-4">
        <h3 id={headingId} className="text-sm font-semibold text-slate-900 dark:text-white">{t(`settings.storage.${kind}Title`)}</h3>
        <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">{t(`settings.storage.${kind}Description`)}</p>
        <p className={`mt-3 text-sm font-medium ${statusStyle[status]}`}>{t(`settings.storage.status.${status}`)}</p>
        {percent !== null && <>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 1 }).format(percent / 100)}</p>
            <div role="progressbar" aria-label={t(`settings.storage.${kind}Progress`)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className={`h-full ${barStyle[status]}`} style={{ width: `${percent}%` }} /></div>
            <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                <li>{t('settings.storage.used', { size: formatBytes(disk.used_bytes!, i18n.language) })}</li>
                <li>{t('settings.storage.free', { size: formatBytes(disk.free_bytes!, i18n.language) })}</li>
                <li>{t('settings.storage.total', { size: formatBytes(disk.total_bytes!, i18n.language) })}</li>
            </ul>
        </>}
    </Card>
}

export function StorageUsagePanel() {
    const { t, i18n } = useTranslation()
    const headingId = useId()
    const [data, setData] = useState<StorageUsageData | null>(null)
    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)
    const busy = useRef(false)
    const load = useCallback(async () => {
        if (busy.current) return
        busy.current = true
        setLoading(true)
        setFailed(false)
        setData(null)
        try {
            const result = await settingsApi.getStorageUsage()
            if (!result?.application_disk || !result.media_disk || !result.database || !Number.isFinite(Date.parse(result.checked_at))) throw new Error('Invalid storage response')
            setData(result)
        } catch { setFailed(true) }
        finally { busy.current = false; setLoading(false) }
    }, [])
    useEffect(() => { void load() }, [load])
    const databaseAvailable = data?.database.status === 'ok' && typeof data.database.size_bytes === 'number' && Number.isFinite(data.database.size_bytes) && data.database.size_bytes >= 0
    return <section aria-labelledby={headingId} aria-busy={loading} className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 id={headingId} className="text-base font-semibold text-slate-900 dark:text-white">{t('settings.storage.title')}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">{t('settings.storage.description')}</p></div>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={15} aria-hidden />} onClick={() => void load()} disabled={loading}>{t(failed ? 'settings.storage.retry' : 'settings.storage.refresh')}</Button>
        </div>
        {loading && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{t('settings.storage.loading')}</p>}
        {failed && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">{t('settings.storage.loadFailed')}</p>}
        {data && <>
            <div className="grid gap-3 md:grid-cols-3">
                <DiskUsageCard disk={data.application_disk} kind="application" />
                <DiskUsageCard disk={data.media_disk} kind="media" />
                <Card role="article" aria-label={t('settings.storage.databaseTitle')} className="min-w-0 p-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('settings.storage.databaseTitle')}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">{t(`settings.storage.databaseDescription.${data.database.engine}`)}</p>
                    <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">{t(databaseAvailable ? 'settings.storage.capacityUnknown' : 'settings.storage.status.unavailable')}</p>
                    {databaseAvailable && <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{formatBytes(data.database.size_bytes!, i18n.language)}</p>}
                    <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{t('settings.storage.databaseCapacityHelp')}</p>
                </Card>
            </div>
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-400">{t('settings.storage.sharedDiskHelp')}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.storage.updated')} <time dateTime={data.checked_at}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.checked_at))}</time></p>
        </>}
    </section>
}
