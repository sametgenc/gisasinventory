import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    Users, Search, Shield, Building2, Clock,
    ChevronDown, UserPlus, X
} from 'lucide-react'
import { useAllUsers, useUpdateUserRole, useTenants, useCreateUnassignedUser } from '@/modules/tenants'
import type { TenantUser, UserCreateInput } from '@/modules/tenants'
import { useTranslation } from 'react-i18next'
import { getApiErrorMessage } from '@/api/errors'

export const Route = createFileRoute('/_secured/platform/users')({
    component: AllUsersPage,
})

function RoleBadge({ role, isSuperuser }: { role: string; isSuperuser?: boolean }) {
    const { t } = useTranslation()
    if (isSuperuser) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                <Shield size={11} />
                {t('users.superuser')}
            </span>
        )
    }
    const config: Record<string, { label: string; color: string }> = {
        platform_admin: { label: t('users.platformAdmin'), color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
        tenant_admin: { label: t('users.tenantAdmin'), color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
        tenant_user: { label: t('users.tenantUser'), color: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
    }
    const c = config[role] || config.tenant_user
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${c.color}`}>
            {c.label}
        </span>
    )
}

function AllUsersPage() {
    const { t, i18n } = useTranslation()
    const { data: users = [], isLoading } = useAllUsers()
    const { data: tenants = [] } = useTenants()
    const updateRoleMutation = useUpdateUserRole()
    const createUserMutation = useCreateUnassignedUser()
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    const [searchQuery, setSearchQuery] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('all')
    const [tenantFilter, setTenantFilter] = useState<string>('all')
    const [editingRoleUserId, setEditingRoleUserId] = useState<number | null>(null)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newUser, setNewUser] = useState<UserCreateInput>({ username: '', email: '', password: '', role: 'tenant_user' })
    const [error, setError] = useState<string | null>(null)
    const [roleErrorUserId, setRoleErrorUserId] = useState<number | null>(null)
    const [roleErrorMessage, setRoleErrorMessage] = useState<string | null>(null)

    const filteredUsers = users.filter((user: TenantUser) => {
        const matchesSearch = user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (user.first_name + ' ' + user.last_name).toLowerCase().includes(searchQuery.toLowerCase())
        const matchesRole = roleFilter === 'all' || user.role === roleFilter
        const matchesTenant = tenantFilter === 'all' ||
            (tenantFilter === 'unassigned' ? !user.tenant_slug : user.tenant_slug === tenantFilter)
        return matchesSearch && matchesRole && matchesTenant
    })

    const handleRoleChange = async (userId: number, role: string) => {
        setRoleErrorUserId(null)
        setRoleErrorMessage(null)
        try {
            await updateRoleMutation.mutateAsync({ userId, role })
            setEditingRoleUserId(null)
        } catch (err) {
            setRoleErrorUserId(userId)
            setRoleErrorMessage(getApiErrorMessage(err, t('tenants.roleUpdateFailed')))
        }
    }

    const handleCreateUser = async () => {
        if (!newUser.username || !newUser.email || !newUser.password) {
            setError(t('tenants.fillAllFields')); return
        }
        if (newUser.password.length < 8) {
            setError(t('tenants.passwordMinLength')); return
        }
        try {
            setError(null)
            await createUserMutation.mutateAsync(newUser)
            setNewUser({ username: '', email: '', password: '', role: 'tenant_user' })
            setShowCreateForm(false)
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, t('tenants.createUserFailed')))
        }
    }

    const roleStats = {
        total: users.length,
        platform_admin: users.filter((u: TenantUser) => u.role === 'platform_admin').length,
        tenant_admin: users.filter((u: TenantUser) => u.role === 'tenant_admin').length,
        tenant_user: users.filter((u: TenantUser) => u.role === 'tenant_user').length,
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Users size={24} className="text-indigo-500" />
                        {t('users.title')}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                        {t('users.subtitle')} &middot; {t('users.userCount', { count: users.length })}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className={`px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 text-sm transition-colors ${
                        showCreateForm
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20'
                    }`}
                >
                    {showCreateForm ? <X size={16} /> : <UserPlus size={16} />}
                    {showCreateForm ? t('common.close') : t('tenants.createUser')}
                </button>
            </div>

            {/* Create User Form */}
            {showCreateForm && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-indigo-200 dark:border-indigo-800/50 p-5 mb-6">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('tenants.createUser')}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        {t('users.createUnassignedHint')}
                    </p>
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <input
                            type="text"
                            value={newUser.username}
                            onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                            placeholder={t('tenants.usernamePlaceholder')}
                        />
                        <input
                            type="email"
                            value={newUser.email}
                            onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                            placeholder={t('tenants.emailPlaceholderUser')}
                        />
                        <input
                            type="password"
                            value={newUser.password}
                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                            placeholder={t('tenants.passwordPlaceholder')}
                        />
                        <select
                            value={newUser.role || 'tenant_user'}
                            onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                        >
                            <option value="tenant_user">{t('users.tenantUser')}</option>
                        </select>
                    </div>
                    <button
                        onClick={handleCreateUser}
                        disabled={createUserMutation.isPending}
                        className="mt-3 w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {createUserMutation.isPending ? t('tenants.creating') : t('tenants.createUserBtn')}
                    </button>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                    { label: t('tenants.totalUsers'), value: roleStats.total, color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
                    { label: t('users.platformAdmin'), value: roleStats.platform_admin, color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400' },
                    { label: t('users.tenantAdmin'), value: roleStats.tenant_admin, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
                    { label: t('users.tenantUser'), value: roleStats.tenant_user, color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
                ].map((stat, i) => (
                    <div key={i} className={`rounded-xl p-4 ${stat.color}`}>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-sm mt-0.5 opacity-80">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('users.searchPlaceholder')}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="relative">
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="appearance-none pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm min-w-[160px]"
                        >
                            <option value="all">{t('users.allRoles')}</option>
                            <option value="platform_admin">{t('users.platformAdmin')}</option>
                            <option value="tenant_admin">{t('users.tenantAdmin')}</option>
                            <option value="tenant_user">{t('users.tenantUser')}</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <div className="relative">
                        <select
                            value={tenantFilter}
                            onChange={(e) => setTenantFilter(e.target.value)}
                            className="appearance-none pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm min-w-[180px]"
                        >
                            <option value="all">{t('users.allTenants')}</option>
                            <option value="unassigned">{t('users.unassigned')}</option>
                            {tenants.map(tenant => (
                                <option key={tenant.slug} value={tenant.slug}>{tenant.name}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('tenants.username')}</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('users.roleLabel')}</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('users.tenantLabel')}</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('users.statusLabel')}</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('tenants.lastLogin')}</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredUsers.length > 0 ? (
                                filteredUsers.map((user: TenantUser) => (
                                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                                                    {user.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-slate-900 dark:text-white text-sm">
                                                        {user.first_name && user.last_name
                                                            ? `${user.first_name} ${user.last_name}`
                                                            : user.username}
                                                    </p>
                                                    <p className="text-xs text-slate-500">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {editingRoleUserId === user.id ? (
                                                <div className="space-y-1">
                                                    <select
                                                        value={user.role}
                                                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                        onBlur={() => {
                                                            if (!roleErrorUserId) setEditingRoleUserId(null)
                                                        }}
                                                        autoFocus
                                                        className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 w-full max-w-[220px]"
                                                    >
                                                        <option value="tenant_user">{t('users.tenantUser')}</option>
                                                        <option
                                                            value="tenant_admin"
                                                            disabled={!user.tenant_slug}
                                                            title={!user.tenant_slug ? t('users.assignShipyardFirstHint') : undefined}
                                                        >
                                                            {t('users.tenantAdmin')}
                                                        </option>
                                                        <option value="platform_admin">{t('users.platformAdminRoleOption')}</option>
                                                    </select>
                                                    {roleErrorUserId === user.id && roleErrorMessage && (
                                                        <p className="text-xs text-red-600 dark:text-red-400 max-w-xs">
                                                            {roleErrorMessage}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setRoleErrorUserId(null)
                                                        setRoleErrorMessage(null)
                                                        setEditingRoleUserId(user.id)
                                                    }}
                                                    className="cursor-pointer"
                                                >
                                                    <RoleBadge role={user.role} />
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {user.tenant_slug ? (
                                                <Link
                                                    to="/platform/tenants/$slug"
                                                    params={{ slug: user.tenant_slug }}
                                                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                                >
                                                    <Building2 size={13} />
                                                    {user.tenant_name}
                                                </Link>
                                            ) : (
                                                <span className="text-sm text-slate-400 italic">{t('users.unassigned')}</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                                                user.is_active
                                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                                                    : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                {user.is_active ? t('users.active') : t('users.inactive')}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-1.5 text-sm text-slate-500">
                                                <Clock size={13} className="text-slate-400" />
                                                {user.last_login
                                                    ? new Date(user.last_login).toLocaleDateString(locale)
                                                    : t('tenants.never')}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setRoleErrorUserId(null)
                                                    setRoleErrorMessage(null)
                                                    setEditingRoleUserId(user.id)
                                                }}
                                                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                            >
                                                {t('users.editRole')}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-5 py-16 text-center">
                                        <Users size={40} className="mx-auto mb-3 text-slate-200 dark:text-slate-700" />
                                        <p className="text-slate-400 font-medium">{t('users.noUsers')}</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
