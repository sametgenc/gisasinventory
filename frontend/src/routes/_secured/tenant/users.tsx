import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
    Users, Search, Shield, Clock, UserPlus, X
} from 'lucide-react'
import { useMyUsers, useUpdateUserRole, useCurrentTenant, useCreateUser } from '@/modules/tenants'
import type { TenantUser, UserCreateInput } from '@/modules/tenants'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/context'

export const Route = createFileRoute('/_secured/tenant/users')({
    component: MyUsersPage,
})

function RoleBadge({ role }: { role: string }) {
    const { t } = useTranslation()
    const config: Record<string, { label: string; color: string }> = {
        platform_admin: { label: t('users.platformAdmin'), color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
        tenant_admin: { label: t('users.tenantAdmin'), color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
        tenant_user: { label: t('users.tenantUser'), color: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
    }
    const c = config[role] || config.tenant_user
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${c.color}`}>
            {role === 'platform_admin' && <Shield size={11} />}
            {c.label}
        </span>
    )
}

function MyUsersPage() {
    const { t, i18n } = useTranslation()
    const { user: authUser } = useAuth()
    const { data: users = [], isLoading } = useMyUsers()
    const { data: currentTenant } = useCurrentTenant()
    const updateRoleMutation = useUpdateUserRole()
    const createUserMutation = useCreateUser()
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    const [searchQuery, setSearchQuery] = useState('')
    const [editingRoleUserId, setEditingRoleUserId] = useState<number | null>(null)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newUser, setNewUser] = useState<UserCreateInput>({ username: '', email: '', password: '', role: 'tenant_user' })
    const [error, setError] = useState<string | null>(null)

    const tenantSlug = authUser?.tenant_slug || currentTenant?.slug || ''

    const filteredUsers = users.filter((user: TenantUser) =>
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.first_name + ' ' + user.last_name).toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleRoleChange = async (userId: number, role: string) => {
        try {
            await updateRoleMutation.mutateAsync({ userId, role })
            setEditingRoleUserId(null)
        } catch (err) { console.error('Failed to update role:', err) }
    }

    const handleCreateUser = async () => {
        if (!newUser.username || !newUser.email || !newUser.password) {
            setError(t('tenants.fillAllFields')); return
        }
        if (newUser.password.length < 8) {
            setError(t('tenants.passwordMinLength')); return
        }
        if (!tenantSlug) {
            setError('Tenant not found'); return
        }
        try {
            setError(null)
            await createUserMutation.mutateAsync({ slug: tenantSlug, data: newUser })
            setNewUser({ username: '', email: '', password: '', role: 'tenant_user' })
            setShowCreateForm(false)
        } catch (err: unknown) {
            const errorObj = err as { response?: { data?: Record<string, unknown> } }
            if (errorObj.response?.data) {
                const messages = Object.entries(errorObj.response.data).map(([, v]) =>
                    Array.isArray(v) ? v.join(', ') : String(v)
                ).join('; ')
                setError(messages)
            } else {
                setError(t('tenants.createUserFailed'))
            }
        }
    }

    const activeUsers = users.filter((u: TenantUser) => u.is_active).length

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
                        <Users size={24} className="text-blue-500" />
                        {t('users.myTitle')}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                        {currentTenant?.name || authUser?.tenant_name || ''} &middot; {t('users.mySubtitle')}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className={`px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 text-sm transition-colors ${
                        showCreateForm
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20'
                    }`}
                >
                    {showCreateForm ? <X size={16} /> : <UserPlus size={16} />}
                    {showCreateForm ? t('common.close') : t('tenants.createUser')}
                </button>
            </div>

            {/* Create User Form */}
            {showCreateForm && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-blue-800/50 p-5 mb-6">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('tenants.createUser')}</h3>
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
                            <option value="tenant_admin">{t('users.tenantAdmin')}</option>
                        </select>
                    </div>
                    <button
                        onClick={handleCreateUser}
                        disabled={createUserMutation.isPending}
                        className="mt-3 w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {createUserMutation.isPending ? t('tenants.creating') : t('tenants.createUserBtn')}
                    </button>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{users.length}</p>
                    <p className="text-sm text-slate-500">{t('tenants.totalUsers')}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeUsers}</p>
                    <p className="text-sm text-slate-500">{t('tenants.activeUsers')}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{users.length - activeUsers}</p>
                    <p className="text-sm text-slate-500">{t('tenants.inactiveUsers')}</p>
                </div>
            </div>

            {/* Search */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
                <div className="relative max-w-md">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('users.searchPlaceholder')}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {/* Users List */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {filteredUsers.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredUsers.map((user: TenantUser) => (
                            <div key={user.id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                                        {user.username.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2.5">
                                            <p className="font-medium text-slate-900 dark:text-white text-sm">
                                                {user.first_name && user.last_name
                                                    ? `${user.first_name} ${user.last_name}`
                                                    : user.username}
                                            </p>
                                            <RoleBadge role={user.role} />
                                            <span className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <p className="text-xs text-slate-500">{user.email}</p>
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                <Clock size={11} />
                                                {user.last_login
                                                    ? new Date(user.last_login).toLocaleDateString(locale)
                                                    : t('tenants.never')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    {editingRoleUserId === user.id ? (
                                        <select
                                            value={user.role}
                                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                            onBlur={() => setEditingRoleUserId(null)}
                                            autoFocus
                                            className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="tenant_user">{t('users.tenantUser')}</option>
                                            <option value="tenant_admin">{t('users.tenantAdmin')}</option>
                                        </select>
                                    ) : (
                                        <button
                                            onClick={() => setEditingRoleUserId(user.id)}
                                            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                        >
                                            {t('users.editRole')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-16 text-center">
                        <Users size={40} className="mx-auto mb-3 text-slate-200 dark:text-slate-700" />
                        <p className="text-slate-400 font-medium">{t('users.noUsers')}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
