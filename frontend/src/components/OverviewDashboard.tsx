import { Link } from '@tanstack/react-router'
import { ArrowRight, Bell, BookOpen, Package, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/context'
import { useTenants, useAllUsers } from '@/modules/tenants'
import { useAssetTypes, useAssets } from '@/modules/assets'
import { useRecentNotificationsQuery } from '@/modules/notification/hooks'
import { dashboardCopy } from '@/modules/dashboard-copy'
import { Button, Card, EmptyState, PageHeader } from '@/components/ui'

export function OverviewDashboard() {
    const { user, loading } = useAuth()
    const { t, i18n } = useTranslation()
    const copy = dashboardCopy[i18n.language.startsWith('tr') ? 'tr' : 'en']
    const tenants = useTenants()
    const types = useAssetTypes()
    const assets = useAssets()
    const users = useAllUsers(!!user?.is_superuser)
    const notifications = useRecentNotificationsQuery(3)
    const locale = i18n.language.startsWith('tr') ? 'tr-TR' : 'en-US'
    const canManageCatalog = user?.is_superuser || user?.role === 'platform_admin'
    const queries = [types, assets, ...(user?.is_superuser ? [tenants, users] : [])]
    const failed = queries.some(query => query.isError)

    if (loading) return <p role="status" className="p-8 text-center text-slate-500">{t('common.loading')}</p>
    if (!user) return null

    const metrics = [
        ...(user.is_superuser ? [{ to: '/platform/tenants' as const, label: t('dashboard.activeTenants'), value: tenants.data?.filter(tenant => tenant.is_active).length, loading: tenants.isPending, error: tenants.isError }] : []),
        { to: '/assets/types' as const, label: t('dashboard.assetTypes'), value: types.data?.length, loading: types.isPending, error: types.isError },
        { to: '/assets' as const, label: t('dashboard.totalAssets'), value: assets.data?.length, loading: assets.isPending, error: assets.isError },
        ...(user.is_superuser ? [{ to: '/platform/users' as const, label: t('dashboard.totalUsers'), value: users.data?.length, loading: users.isPending, error: users.isError }] : []),
    ]

    return <div className="min-w-0 space-y-6">
        <PageHeader title={t('dashboard.overview')} subtitle={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">{new Date().toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}{canManageCatalog && <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><Shield size={12} />{t('dashboard.platformAdmin')}</span>}</span>
        } actions={<Link to="/assets" className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950">{copy.inventory}<ArrowRight size={16} /></Link>} />
        {failed && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{copy.queryError}<Button size="sm" variant="ghost" onClick={() => queries.forEach(query => { if (query.isError) void query.refetch() })}>{copy.retry}</Button></div>}
        <div className={`grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${user.is_superuser ? 'lg:grid-cols-4' : ''}`}>
            {metrics.map(({ to, label, value, loading: pending, error }, index) => <Link key={to} to={to} className={`group flex min-w-0 flex-col justify-between gap-3 px-5 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 dark:hover:bg-slate-800 ${index % 2 === 0 ? '' : 'border-l border-slate-200 dark:border-slate-700'} ${index > 1 ? 'border-t border-slate-200 dark:border-slate-700 lg:border-t-0' : ''} ${user.is_superuser && index === 2 ? 'lg:border-l' : ''}`}>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
                <div className="flex items-end justify-between gap-2"><p className="text-3xl font-semibold tabular-nums leading-none tracking-tight text-slate-900 dark:text-white" aria-busy={pending}>{pending || error ? '—' : (value ?? 0).toLocaleString(locale)}</p><ArrowRight size={15} className="text-slate-400 group-hover:text-blue-700 dark:group-hover:text-blue-300" /></div>
            </Link>)}
        </div>
        {!user.is_superuser && <div className="border-l-2 border-slate-300 pl-4 dark:border-slate-600"><p className="text-sm font-medium text-slate-900 dark:text-white">{user.tenant_name || (canManageCatalog ? t('dashboard.platformAdmin') : copy.noYard)}</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{user.tenant_name ? copy.workingYard : canManageCatalog ? t('catalog.workflowHelp') : copy.noYardHelp}</p></div>}
        <div className="grid gap-6 lg:grid-cols-3">
            <Card className="overflow-hidden lg:col-span-2">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700"><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{copy.recent}</h2><Link to="/assets" className="shrink-0 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">{t('dashboard.viewAll')}</Link></div>
                {assets.isPending ? <p role="status" className="p-5 text-sm text-slate-500">{t('common.loading')}</p> : assets.isError ? <p role="status" className="p-5 text-sm text-slate-500">{copy.queryError}</p> : assets.data?.length ? <>
                    <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 sm:grid"><span>{t('assets.assetType')}</span><span>{copy.code}</span><span>{t('assets.shipyard')}</span></div>
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">{assets.data.slice(0, 5).map(asset => {
                    const schema = types.data?.find(type => type.id === asset.asset_type)?.schema
                    const key = schema?.find(field => field.is_unique_key)?.key
                    const code = key ? asset.custom_data[key] : asset.custom_data.asset_code
                    return <div key={asset.id} className="grid min-w-0 gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4"><div className="min-w-0"><p className="break-words text-sm font-medium leading-5 text-slate-900 dark:text-white">{asset.asset_type_name}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{new Date(asset.created_at).toLocaleDateString(locale)}</p></div><p className="min-w-0 break-words text-sm leading-5 text-slate-600 dark:text-slate-300"><span className="mr-1 text-xs text-slate-500 sm:hidden">{copy.code}:</span>{code === undefined || code === null ? copy.unknownCode : String(code)}</p><p className="min-w-0 break-words text-sm leading-5 text-slate-600 dark:text-slate-300">{asset.tenant_name}</p></div>
                })}</div></> : <EmptyState compact icon={<Package size={24} />} title={t('dashboard.noAssets')} action={<Link to="/assets" className="text-sm font-medium text-blue-700 dark:text-blue-300">{copy.inventory}</Link>} />}
            </Card>
            <div className="space-y-5">
                <Card className="overflow-hidden"><div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700"><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Bell size={16} className="text-slate-400" />{t('dashboard.notifications')}</h2><p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.notificationsHelp}</p></div>
                    <div className="px-5 py-4">{notifications.isPending ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : notifications.isError ? <p role="status" className="text-sm text-red-600">{copy.notificationsError}</p> : notifications.data?.length ? <ul className="divide-y divide-slate-200 dark:divide-slate-700">{notifications.data.map(notification => <li key={notification.id} className="py-3 first:pt-0 last:pb-0"><p className="break-words text-sm leading-5 text-slate-700 dark:text-slate-200">{notification.content.title || notification.content.message || t('dashboard.notifications')}</p><p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{new Date(notification.created_at).toLocaleDateString(locale)}</p></li>)}</ul> : <p className="text-sm text-slate-500">{copy.noNotifications}</p>}</div>
                    <Link to="/notifications" className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 text-xs font-medium text-blue-700 hover:bg-slate-50 dark:border-slate-700 dark:text-blue-300 dark:hover:bg-slate-800">{t('dashboard.viewAll')}<ArrowRight size={14} /></Link>
                </Card>
                <div className="px-1"><h2 className="text-xs font-medium text-slate-500 dark:text-slate-400">{copy.quickHelp}</h2><div className="mt-3 flex flex-wrap gap-x-5 gap-y-3"><Link to="/assets/types" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">{t('nav.assetTypes')}<ArrowRight size={13} /></Link><Link to="/help" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">{copy.openGuide}<ArrowRight size={13} /></Link></div></div>
            </div>
        </div>
        <section className="flex flex-wrap items-start justify-between gap-4 border-t border-slate-200 pt-5 dark:border-slate-800">
            <div className="max-w-3xl"><h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">{copy.introTitle}</h2><p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.introBody}</p></div>
            <Link to="/help" className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"><BookOpen size={15} />{copy.openGuide}</Link>
        </section>
    </div>
}
