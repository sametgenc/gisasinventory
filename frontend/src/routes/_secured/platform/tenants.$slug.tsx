import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    ArrowLeft, Ship, Users, UserPlus, UserMinus,
    MapPin, Phone, Mail, FileText, Pencil, Shield, Search, X
} from 'lucide-react'
import {
    useTenant, useTenantUsers, useAvailableUsers,
    useAssignUser, useRemoveUser, useCreateUser, useUpdateTenant,
    useUpdateUserRole
} from '@/modules/tenants'
import type { TenantUser, UserCreateInput, TenantUpdateInput } from '@/modules/tenants'
import { TenantFormModal } from '@/components/tenants/TenantFormModal'
import { useTranslation } from 'react-i18next'
import { getApiErrorMessage } from '@/api/errors'

export const Route = createFileRoute('/_secured/platform/tenants/$slug')({
    component: TenantDetailPage,
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

function TenantDetailPage() {
    const { slug } = Route.useParams()
    const { t } = useTranslation()
    const { data: tenant, isLoading: tenantLoading } = useTenant(slug)
    const { data: tenantUsers = [] } = useTenantUsers(slug)
    const { data: availableUsers = [] } = useAvailableUsers()
    const assignMutation = useAssignUser()
    const removeMutation = useRemoveUser()
    const createUserMutation = useCreateUser()
    const updateTenantMutation = useUpdateTenant()
    const updateRoleMutation = useUpdateUserRole()

    const [activeTab, setActiveTab] = useState<'info' | 'users' | 'assign'>('users')
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newUser, setNewUser] = useState<UserCreateInput>({ username: '', email: '', password: '', role: 'tenant_user' })
    const [error, setError] = useState<string | null>(null)
    const [userSearch, setUserSearch] = useState('')
    const [availableSearch, setAvailableSearch] = useState('')
    const [editingRoleUserId, setEditingRoleUserId] = useState<number | null>(null)
    const [bannerError, setBannerError] = useState<string | null>(null)
    const [tenantSaveError, setTenantSaveError] = useState<string | null>(null)
    const [roleErrorUserId, setRoleErrorUserId] = useState<number | null>(null)
    const [roleErrorMessage, setRoleErrorMessage] = useState<string | null>(null)

    const filteredUsers = tenantUsers.filter((u: TenantUser) =>
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase())
    )

    const filteredAvailable = availableUsers.filter((u: TenantUser) =>
        u.username.toLowerCase().includes(availableSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(availableSearch.toLowerCase())
    )

    const handleAssign = async (userId: number) => {
        setBannerError(null)
        try {
            await assignMutation.mutateAsync({ slug, userId })
        } catch (err) {
            setBannerError(getApiErrorMessage(err, t('tenants.assignFailed')))
        }
    }

    const handleRemove = async (userId: number) => {
        if (!confirm(t('tenants.removeConfirm'))) return
        setBannerError(null)
        try {
            await removeMutation.mutateAsync({ slug, userId })
        } catch (err) {
            setBannerError(getApiErrorMessage(err, t('tenants.removeFailed')))
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
            await createUserMutation.mutateAsync({ slug, data: newUser })
            setNewUser({ username: '', email: '', password: '', role: 'tenant_user' })
            setShowCreateForm(false)
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, t('tenants.createUserFailed')))
        }
    }

    const handleUpdateTenant = async (data: TenantUpdateInput) => {
        setTenantSaveError(null)
        try {
            await updateTenantMutation.mutateAsync({ slug, data })
            setIsEditModalOpen(false)
        } catch (err) {
            setTenantSaveError(getApiErrorMessage(err, t('tenants.tenantUpdateFailed')))
        }
    }

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

    if (tenantLoading || !tenant) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    const activeUsers = tenantUsers.filter((u: TenantUser) => u.is_active).length

    return (
        <div className="w-full min-w-0">
            {/* Header */}
            <div className="mb-6">
                <Link
                    to="/platform/tenants"
                    className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors"
                >
                    <ArrowLeft size={16} />
                    {t('tenants.backToList')}
                </Link>

                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <Ship size={28} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{tenant.name}</h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {tenant.slug}
                                {tenant.description && ` \u00b7 ${tenant.description}`}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setTenantSaveError(null)
                            setIsEditModalOpen(true)
                        }}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium flex items-center gap-2 text-sm"
                    >
                        <Pencil size={15} />
                        {t('tenants.editBtn')}
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                            <Users size={20} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{tenantUsers.length}</p>
                            <p className="text-sm text-slate-500">{t('tenants.totalUsers')}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                            <Users size={20} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{activeUsers}</p>
                            <p className="text-sm text-slate-500">{t('tenants.activeUsers')}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
                            <Users size={20} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{tenantUsers.length - activeUsers}</p>
                            <p className="text-sm text-slate-500">{t('tenants.inactiveUsers')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {bannerError && (
                <div
                    className="mb-4 p-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm"
                    role="alert"
                >
                    {bannerError}
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1.5">
                {([
                    { id: 'users' as const, label: t('tenants.tenantUsers'), icon: Users },
                    { id: 'assign' as const, label: t('tenants.availableUsers'), icon: UserPlus },
                    { id: 'info' as const, label: t('tenants.tenantInfo'), icon: FileText },
                ]).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => {
                            setBannerError(null)
                            setActiveTab(tab.id)
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.id
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'info' && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {tenant.description && (
                            <div className="md:col-span-2 flex gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                <FileText size={18} className="text-slate-400 mt-0.5 shrink-0" />
                                <p className="text-sm text-slate-600 dark:text-slate-400">{tenant.description}</p>
                            </div>
                        )}
                        {tenant.address && (
                            <div className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                <MapPin size={18} className="text-slate-400 mt-0.5 shrink-0" />
                                <p className="text-sm text-slate-600 dark:text-slate-400">{tenant.address}</p>
                            </div>
                        )}
                        {tenant.phone && (
                            <div className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                <Phone size={18} className="text-slate-400 shrink-0" />
                                <p className="text-sm text-slate-600 dark:text-slate-400">{tenant.phone}</p>
                            </div>
                        )}
                        {tenant.email && (
                            <div className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                <Mail size={18} className="text-slate-400 shrink-0" />
                                <p className="text-sm text-slate-600 dark:text-slate-400">{tenant.email}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'users' && (
                <div className="space-y-4">
                    {/* Create User + Search */}
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={userSearch}
                                onChange={e => setUserSearch(e.target.value)}
                                placeholder={t('users.searchPlaceholder')}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <button
                            onClick={() => setShowCreateForm(!showCreateForm)}
                            className={`px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 text-sm transition-colors ${
                                showCreateForm
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                            }`}
                        >
                            {showCreateForm ? <X size={16} /> : <UserPlus size={16} />}
                            {showCreateForm ? t('common.close') : t('tenants.createUser')}
                        </button>
                    </div>

                    {/* Create Form */}
                    {showCreateForm && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800/50 p-5">
                            {error && (
                                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                                    {error}
                                </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <input
                                    type="text"
                                    value={newUser.username}
                                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                                    placeholder={t('tenants.usernamePlaceholder')}
                                />
                                <input
                                    type="email"
                                    value={newUser.email}
                                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                                    placeholder={t('tenants.emailPlaceholderUser')}
                                />
                                <input
                                    type="password"
                                    value={newUser.password}
                                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                                    placeholder={t('tenants.passwordPlaceholder')}
                                />
                                <select
                                    value={newUser.role || 'tenant_user'}
                                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                                >
                                    <option value="tenant_user">{t('users.tenantUser')}</option>
                                    <option value="tenant_admin">{t('users.tenantAdmin')}</option>
                                </select>
                            </div>
                            <button
                                onClick={handleCreateUser}
                                disabled={createUserMutation.isPending}
                                className="mt-3 w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                                {createUserMutation.isPending ? t('tenants.creating') : t('tenants.createUserBtn')}
                            </button>
                        </div>
                    )}

                    {/* Users List */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        {filteredUsers.length > 0 ? (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredUsers.map((user: TenantUser) => (
                                    <div key={user.id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                                                {user.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-slate-900 dark:text-white text-sm">
                                                        {user.first_name && user.last_name
                                                            ? `${user.first_name} ${user.last_name}`
                                                            : user.username}
                                                    </p>
                                                    <RoleBadge role={user.role} />
                                                    <span className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                </div>
                                                <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {editingRoleUserId === user.id ? (
                                                <div className="space-y-1">
                                                    <select
                                                        value={user.role}
                                                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                        onBlur={() => {
                                                            if (roleErrorUserId !== user.id) setEditingRoleUserId(null)
                                                        }}
                                                        autoFocus
                                                        className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 max-w-[200px]"
                                                    >
                                                        <option value="tenant_user">{t('users.tenantUser')}</option>
                                                        <option value="tenant_admin">{t('users.tenantAdmin')}</option>
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
                                                    className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                >
                                                    {t('users.editRole')}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleRemove(user.id)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                title={t('tenants.removeUser')}
                                            >
                                                <UserMinus size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-12 text-center">
                                <Users size={40} className="mx-auto mb-3 text-slate-200 dark:text-slate-700" />
                                <p className="text-slate-400 font-medium">{t('tenants.noUsersInTenant')}</p>
                                <p className="text-sm text-slate-400 mt-1">{t('tenants.addUsersHint')}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'assign' && (
                <div className="space-y-4">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={availableSearch}
                            onChange={e => setAvailableSearch(e.target.value)}
                            placeholder={t('users.searchPlaceholder')}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        {filteredAvailable.length > 0 ? (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredAvailable.map((user: TenantUser) => (
                                    <div key={user.id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-sm">
                                                {user.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-900 dark:text-white text-sm">{user.username}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleAssign(user.id)}
                                            disabled={assignMutation.isPending}
                                            className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-medium flex items-center gap-2 text-sm"
                                        >
                                            <UserPlus size={15} />
                                            {t('tenants.assignUser')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-12 text-center">
                                <Users size={40} className="mx-auto mb-3 text-slate-200 dark:text-slate-700" />
                                <p className="text-slate-400 font-medium">{t('tenants.noAvailableUsers')}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            <TenantFormModal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setTenantSaveError(null)
                    setIsEditModalOpen(false)
                }}
                tenant={tenant}
                onSave={handleUpdateTenant}
                isLoading={updateTenantMutation.isPending}
                saveError={tenantSaveError}
            />
        </div>
    )
}
