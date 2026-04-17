import { useAuth } from '@/auth/context'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    Building2, Package, Layers, TrendingUp,
    Users, Clock, ArrowRight, Shield, Bell,
    ChevronRight, Calendar, Plus,
} from 'lucide-react'
import { useTenants, useAllUsers } from '@/modules/tenants'
import { useAssetTypes, useAssets } from '@/modules/assets'
import { useTranslation } from 'react-i18next'
import {
    PageHeader,
    Card,
    Button,
    EmptyState,
    cn,
} from '@/components/ui'

export const Route = createFileRoute('/_secured/dashboard')({
    component: DashboardComponent,
})

function NavStatCard({
    to,
    icon: Icon,
    iconColor,
    value,
    label,
    linkText,
}: {
    to: string
    icon: React.ComponentType<{ size: number; className?: string }>
    iconColor: string
    value: number | string
    label: string
    linkText?: string
}) {
    return (
        <Link
            to={to}
            className="group bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800/50 transition-all"
        >
            <div className="flex items-start justify-between">
                <div className={cn('p-2.5 rounded-lg', iconColor)}>
                    <Icon size={20} />
                </div>
                <TrendingUp size={16} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="mt-3">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{label}</p>
            </div>
            {linkText && (
                <div className="mt-3 flex items-center text-blue-600 dark:text-blue-400 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    {linkText} <ChevronRight size={14} />
                </div>
            )}
        </Link>
    )
}

type AuthUserWithTenant = { username: string; is_superuser: boolean; tenant_name?: string }

function DashboardComponent() {
    const { user, loading } = useAuth()
    const { t, i18n } = useTranslation()
    const { data: tenants = [] } = useTenants()
    const { data: assetTypes = [] } = useAssetTypes()
    const { data: assets = [] } = useAssets()
    const { data: allUsers = [] } = useAllUsers()

    const isSuperuser = user?.is_superuser || false
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    const activeTenants = tenants.filter((tn: { is_active: boolean }) => tn.is_active).length
    const totalAssetTypes = assetTypes.length
    const totalAssets = assets.length
    const recentAssets = assets.slice(0, 5)

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!user) return null
    const u = user as unknown as AuthUserWithTenant

    return (
        <div className="w-full min-w-0 space-y-6">
            <PageHeader
                title={t('dashboard.welcome', { name: u.username })}
                subtitle={
                    <span>
                        {new Date().toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        {isSuperuser && (
                            <span className="inline-flex items-center gap-1 ml-3 text-blue-600 dark:text-blue-400 font-medium">
                                <Shield size={12} />
                                {t('dashboard.platformAdmin')}
                            </span>
                        )}
                    </span>
                }
                actions={
                    <Link to="/assets">
                        <Button icon={<Plus size={16} />} as="span">
                            {t('dashboard.addNewAsset')}
                        </Button>
                    </Link>
                }
            />

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {isSuperuser && (
                    <NavStatCard
                        to="/platform/tenants"
                        icon={Building2}
                        iconColor="bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400"
                        value={activeTenants}
                        label={t('dashboard.activeTenants')}
                        linkText={t('dashboard.viewTenants')}
                    />
                )}
                <NavStatCard
                    to="/assets/types"
                    icon={Layers}
                    iconColor="bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                    value={totalAssetTypes}
                    label={t('dashboard.assetTypes')}
                    linkText={t('dashboard.manageTypes')}
                />
                <NavStatCard
                    to="/assets"
                    icon={Package}
                    iconColor="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                    value={totalAssets}
                    label={t('dashboard.totalAssets')}
                    linkText={t('dashboard.viewAssets')}
                />
                {isSuperuser ? (
                    <NavStatCard
                        to="/platform/users"
                        icon={Users}
                        iconColor="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                        value={allUsers.length}
                        label={t('dashboard.totalUsers')}
                        linkText={t('users.title')}
                    />
                ) : (
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white">
                        <div className="flex items-start">
                            <div className="bg-white/20 p-2.5 rounded-lg">
                                <Shield size={20} />
                            </div>
                        </div>
                        <div className="mt-3">
                            <p className="text-lg font-bold">{u.tenant_name || t('dashboard.yourTenant')}</p>
                            <p className="text-blue-100 text-sm mt-0.5">{t('dashboard.activeMembership')}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Clock size={16} className="text-slate-400" />
                            {t('dashboard.recentAssets')}
                        </h2>
                        <Link to="/assets" className="text-blue-600 dark:text-blue-400 text-xs font-medium flex items-center gap-1 hover:underline">
                            {t('dashboard.viewAll')} <ArrowRight size={12} />
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {recentAssets.length > 0 ? (
                            recentAssets.map((asset: { id: string; asset_type_name: string; tenant_name?: string; created_at: string; custom_data: Record<string, unknown> }) => (
                                <div key={asset.id} className="px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
                                                <Package size={16} className="text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm text-slate-900 dark:text-white">
                                                    {asset.asset_type_name}
                                                </p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    {asset.tenant_name && `${asset.tenant_name} · `}
                                                    {new Date(asset.created_at).toLocaleDateString(locale)}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <EmptyState
                                compact
                                icon={<Package size={32} />}
                                title={t('dashboard.noAssets')}
                                action={
                                    <Link to="/assets">
                                        <Button as="span" size="sm" icon={<Plus size={14} />}>
                                            {t('dashboard.addFirstAsset')}
                                        </Button>
                                    </Link>
                                }
                            />
                        )}
                    </div>
                </Card>

                {/* Sidebar */}
                <div className="space-y-4">
                    <Card className="overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                                {t('dashboard.quickActions')}
                            </h2>
                        </div>
                        <div className="p-2 space-y-0.5">
                            <Link
                                to="/assets"
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
                            >
                                <Package size={16} className="text-blue-500" />
                                <span className="font-medium">{t('dashboard.newAsset')}</span>
                            </Link>
                            <Link
                                to="/assets/types"
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
                            >
                                <Layers size={16} className="text-violet-500" />
                                <span className="font-medium">{t('dashboard.createAssetType')}</span>
                            </Link>
                            {isSuperuser && (
                                <Link
                                    to="/platform/tenants"
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
                                >
                                    <Building2 size={16} className="text-sky-500" />
                                    <span className="font-medium">{t('dashboard.newTenant')}</span>
                                </Link>
                            )}
                        </div>
                    </Card>

                    <Card className="overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <Bell size={14} className="text-slate-400" />
                                {t('dashboard.notifications')}
                            </h2>
                        </div>
                        <div className="p-3">
                            <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-900/20">
                                <div className="bg-emerald-500 p-1.5 rounded-full">
                                    <Shield size={12} className="text-white" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-300">{t('dashboard.systemUpToDate')}</p>
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('dashboard.allSystemsRunning')}</p>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card padded>
                        <div className="flex items-center gap-3 mb-3">
                            <Calendar size={18} className="text-blue-500" />
                            <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('dashboard.today')}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {new Date().toLocaleDateString(locale, { weekday: 'long' })}
                                </p>
                            </div>
                        </div>
                        <p className="text-4xl font-bold text-slate-900 dark:text-white">{new Date().getDate()}</p>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            {new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    )
}
