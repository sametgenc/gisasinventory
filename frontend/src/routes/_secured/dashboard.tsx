import { useAuth } from '@/auth/context'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    Building2, Package, Layers, TrendingUp,
    Users, Clock, ArrowRight, Shield, Bell,
    ChevronRight, Calendar, Plus
} from 'lucide-react'
import { useTenants, useAllUsers } from '@/modules/tenants'
import { useAssetTypes, useAssets } from '@/modules/assets'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_secured/dashboard')({
    component: DashboardComponent,
})

function StatCard({
    to,
    icon: Icon,
    iconColor,
    value,
    label,
    linkText,
}: {
    to: string;
    icon: React.ComponentType<{ size: number; className?: string }>;
    iconColor: string;
    value: number | string;
    label: string;
    linkText?: string;
}) {
    return (
        <Link
            to={to}
            className="group bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/50 transition-all"
        >
            <div className="flex items-start justify-between">
                <div className={`p-2.5 rounded-lg ${iconColor}`}>
                    <Icon size={20} />
                </div>
                <TrendingUp size={16} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="mt-3">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{label}</p>
            </div>
            {linkText && (
                <div className="mt-3 flex items-center text-indigo-600 dark:text-indigo-400 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    {linkText} <ChevronRight size={14} />
                </div>
            )}
        </Link>
    )
}

function DashboardComponent() {
    const { user, loading } = useAuth()
    const { t, i18n } = useTranslation()
    const { data: tenants = [] } = useTenants()
    const { data: assetTypes = [] } = useAssetTypes()
    const { data: assets = [] } = useAssets()
    const { data: allUsers = [] } = useAllUsers()

    const isSuperuser = user?.is_superuser || false
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    const activeTenants = tenants.filter((t: { is_active: boolean }) => t.is_active).length
    const totalAssetTypes = assetTypes.length
    const totalAssets = assets.length
    const recentAssets = assets.slice(0, 5)

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!user) return null

    return (
        <div className="w-full min-w-0 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                        {t('dashboard.welcome', { name: user.username })}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        {new Date().toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        {isSuperuser && (
                            <span className="inline-flex items-center gap-1 ml-3 text-indigo-600 dark:text-indigo-400 font-medium">
                                <Shield size={12} />
                                {t('dashboard.platformAdmin')}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        to="/assets"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors shadow-sm shadow-indigo-500/20"
                    >
                        <Plus size={16} />
                        {t('dashboard.addNewAsset')}
                    </Link>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {isSuperuser && (
                    <StatCard
                        to="/platform/tenants"
                        icon={Building2}
                        iconColor="bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400"
                        value={activeTenants}
                        label={t('dashboard.activeTenants')}
                        linkText={t('dashboard.viewTenants')}
                    />
                )}

                <StatCard
                    to="/assets/types"
                    icon={Layers}
                    iconColor="bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                    value={totalAssetTypes}
                    label={t('dashboard.assetTypes')}
                    linkText={t('dashboard.manageTypes')}
                />

                <StatCard
                    to="/assets"
                    icon={Package}
                    iconColor="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                    value={totalAssets}
                    label={t('dashboard.totalAssets')}
                    linkText={t('dashboard.viewAssets')}
                />

                {isSuperuser ? (
                    <StatCard
                        to="/platform/users"
                        icon={Users}
                        iconColor="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                        value={allUsers.length}
                        label={t('dashboard.totalUsers')}
                        linkText={t('users.title')}
                    />
                ) : (
                    <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-5 text-white">
                        <div className="flex items-start">
                            <div className="bg-white/20 p-2.5 rounded-lg">
                                <Shield size={20} />
                            </div>
                        </div>
                        <div className="mt-3">
                            <p className="text-lg font-bold">{(user as any).tenant_name || t('dashboard.yourTenant')}</p>
                            <p className="text-indigo-200 text-sm mt-0.5">{t('dashboard.activeMembership')}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Assets */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Clock size={16} className="text-slate-400" />
                            {t('dashboard.recentAssets')}
                        </h2>
                        <Link to="/assets" className="text-indigo-600 dark:text-indigo-400 text-xs font-medium flex items-center gap-1 hover:underline">
                            {t('dashboard.viewAll')} <ArrowRight size={12} />
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {recentAssets.length > 0 ? (
                            recentAssets.map((asset: { id: string; asset_type_name: string; tenant_name?: string; created_at: string; custom_data: Record<string, unknown> }) => (
                                <div key={asset.id} className="px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-lg">
                                                <Package size={16} className="text-emerald-600 dark:text-emerald-400" />
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
                            <div className="p-10 text-center">
                                <Package size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{t('dashboard.noAssets')}</p>
                                <Link to="/assets" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs font-medium">
                                    <Plus size={14} />
                                    {t('dashboard.addFirstAsset')}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    {/* Quick Actions */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
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
                                <Package size={16} className="text-emerald-500" />
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
                    </div>

                    {/* Status */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
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
                    </div>

                    {/* Calendar Widget */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <Calendar size={18} className="text-indigo-500" />
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
                    </div>
                </div>
            </div>
        </div>
    )
}
