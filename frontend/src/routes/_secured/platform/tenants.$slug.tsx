import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    ArrowLeft, Ship, Users, UserPlus, UserMinus,
    MapPin, Phone, Mail, FileText, Pencil, Shield, Search,
} from 'lucide-react'
import {
    useTenant, useTenantUsers, useAvailableUsers,
    useAssignUser, useRemoveUser, useCreateUser, useUpdateTenant,
    useUpdateUser,
} from '@/modules/tenants'
import type { TenantUser, TenantUpdateInput } from '@/modules/tenants'
import { TenantFormModal } from '@/components/tenants/TenantFormModal'
import { UserFormModal, type UserFormPayload } from '@/components/users/UserFormModal'
import {
    PageHeader,
    Button,
    Badge,
    DataTable,
    EmptyState,
    StatCard,
    Card,
    ConfirmationModal,
    type ColumnDef,
    type BadgeVariant,
} from '@/components/ui'
import { useTranslation } from 'react-i18next'
import { getApiErrorMessage } from '@/api/errors'

export const Route = createFileRoute('/_secured/platform/tenants/$slug')({
    component: TenantDetailPage,
})

const roleVariant: Record<string, BadgeVariant> = {
    platform_admin: 'purple',
    tenant_admin: 'info',
    tenant_user: 'neutral',
}

function RoleBadge({ role, label }: { role: string; label: string }) {
    return (
        <Badge variant={roleVariant[role] ?? 'neutral'}>
            {role === 'platform_admin' && <Shield size={11} className="mr-1" />}
            {label}
        </Badge>
    )
}

function UserAvatar({ user, tone = 'primary' }: { user: TenantUser; tone?: 'primary' | 'muted' }) {
    const cls = tone === 'muted'
        ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
        : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
    return (
        <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${cls}`}>
                {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
                <p className="font-medium text-slate-900 dark:text-white text-sm truncate">
                    {user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username}
                </p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
        </div>
    )
}

function TenantDetailPage() {
    const { slug } = Route.useParams()
    const { t } = useTranslation()
    const { data: tenant, isLoading: tenantLoading } = useTenant(slug)
    const { data: tenantUsers = [], isLoading: usersLoading } = useTenantUsers(slug)
    const { data: availableUsers = [], isLoading: availableLoading } = useAvailableUsers()
    const assignMutation = useAssignUser()
    const removeMutation = useRemoveUser()
    const createUserMutation = useCreateUser()
    const updateTenantMutation = useUpdateTenant()
    const updateUserMutation = useUpdateUser()

    const [activeTab, setActiveTab] = useState<'info' | 'users' | 'assign'>('users')
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isCreateUserOpen, setIsCreateUserOpen] = useState(false)
    const [createUserError, setCreateUserError] = useState<string | null>(null)
    const [editingUser, setEditingUser] = useState<TenantUser | null>(null)
    const [editUserError, setEditUserError] = useState<string | null>(null)
    const [userSearch, setUserSearch] = useState('')
    const [availableSearch, setAvailableSearch] = useState('')
    const [userToRemove, setUserToRemove] = useState<TenantUser | null>(null)
    const [bannerError, setBannerError] = useState<string | null>(null)
    const [tenantSaveError, setTenantSaveError] = useState<string | null>(null)

    const filteredUsers = useMemo(
        () => tenantUsers.filter((u: TenantUser) =>
            u.username.toLowerCase().includes(userSearch.toLowerCase())
            || u.email.toLowerCase().includes(userSearch.toLowerCase())),
        [tenantUsers, userSearch],
    )
    const filteredAvailable = useMemo(
        () => availableUsers.filter((u: TenantUser) =>
            u.username.toLowerCase().includes(availableSearch.toLowerCase())
            || u.email.toLowerCase().includes(availableSearch.toLowerCase())),
        [availableUsers, availableSearch],
    )

    const handleAssign = async (userId: number) => {
        setBannerError(null)
        try {
            await assignMutation.mutateAsync({ slug, userId })
        } catch (err) {
            setBannerError(getApiErrorMessage(err, t('tenants.assignFailed')))
        }
    }

    const handleRemove = (user: TenantUser) => {
        setBannerError(null)
        setUserToRemove(user)
    }

    const confirmRemove = async () => {
        if (!userToRemove) return
        try {
            await removeMutation.mutateAsync({ slug, userId: userToRemove.id })
            setUserToRemove(null)
        } catch (err) {
            setUserToRemove(null)
            setBannerError(getApiErrorMessage(err, t('tenants.removeFailed')))
        }
    }

    const handleCreateUser = async (payload: UserFormPayload) => {
        if (payload.mode !== 'create') return
        try {
            setCreateUserError(null)
            await createUserMutation.mutateAsync({ slug, data: payload.data })
            setIsCreateUserOpen(false)
        } catch (err: unknown) {
            setCreateUserError(getApiErrorMessage(err, t('tenants.createUserFailed')))
        }
    }

    const handleEditUser = async (payload: UserFormPayload) => {
        if (payload.mode !== 'edit' || !editingUser) return
        try {
            setEditUserError(null)
            await updateUserMutation.mutateAsync({ userId: editingUser.id, data: payload.data })
            setEditingUser(null)
        } catch (err) {
            setEditUserError(getApiErrorMessage(err, t('tenants.userUpdateFailed')))
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

    if (tenantLoading || !tenant) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    const activeUsers = tenantUsers.filter((u: TenantUser) => u.is_active).length

    const userColumns: ColumnDef<TenantUser>[] = [
        {
            key: 'user',
            header: t('tenants.username'),
            sortable: true,
            sortAccessor: (u) => u.username,
            cell: (u) => <UserAvatar user={u} />,
        },
        {
            key: 'role',
            header: t('users.roleLabel'),
            cell: (u) => (
                <RoleBadge
                    role={u.role}
                    label={
                        u.role === 'platform_admin' ? t('users.platformAdmin')
                            : u.role === 'tenant_admin' ? t('users.tenantAdmin')
                                : t('users.tenantUser')
                    }
                />
            ),
        },
        {
            key: 'status',
            header: t('users.statusLabel'),
            cell: (u) =>
                u.is_active ? (
                    <Badge variant="success">{t('users.active')}</Badge>
                ) : (
                    <Badge variant="danger">{t('users.inactive')}</Badge>
                ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (u) => (
                <div className="flex items-center justify-end gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil size={13} />}
                        onClick={() => { setEditUserError(null); setEditingUser(u) }}
                    >
                        {t('common.edit')}
                    </Button>
                    <button
                        type="button"
                        onClick={() => handleRemove(u)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                        title={t('tenants.removeUser')}
                    >
                        <UserMinus size={15} />
                    </button>
                </div>
            ),
        },
    ]

    const availableColumns: ColumnDef<TenantUser>[] = [
        {
            key: 'user',
            header: t('tenants.username'),
            sortable: true,
            sortAccessor: (u) => u.username,
            cell: (u) => <UserAvatar user={u} tone="muted" />,
        },
        {
            key: 'assign',
            header: '',
            align: 'right',
            cell: (u) => (
                <Button
                    size="sm"
                    variant="secondary"
                    icon={<UserPlus size={13} />}
                    onClick={() => handleAssign(u.id)}
                    loading={assignMutation.isPending}
                >
                    {t('tenants.assignUser')}
                </Button>
            ),
        },
    ]

    return (
        <div className="w-full min-w-0">
            <PageHeader
                before={
                    <Link
                        to="/platform/tenants"
                        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                        <ArrowLeft size={16} />
                        {t('tenants.backToList')}
                    </Link>
                }
                icon={<Ship size={22} />}
                title={tenant.name}
                subtitle={tenant.slug + (tenant.description ? ` · ${tenant.description}` : '')}
                actions={
                    <Button
                        variant="secondary"
                        icon={<Pencil size={15} />}
                        onClick={() => { setTenantSaveError(null); setIsEditModalOpen(true) }}
                    >
                        {t('tenants.editBtn')}
                    </Button>
                }
            />

            {bannerError && (
                <div className="mb-4 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm" role="alert">
                    {bannerError}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <StatCard tone="info" icon={<Users size={18} />} value={tenantUsers.length} label={t('tenants.totalUsers')} />
                <StatCard tone="success" icon={<Users size={18} />} value={activeUsers} label={t('tenants.activeUsers')} />
                <StatCard tone="warning" icon={<Users size={18} />} value={tenantUsers.length - activeUsers} label={t('tenants.inactiveUsers')} />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1.5">
                {([
                    { id: 'users' as const, label: t('tenants.tenantUsers'), icon: Users },
                    { id: 'assign' as const, label: t('tenants.availableUsers'), icon: UserPlus },
                    { id: 'info' as const, label: t('tenants.tenantInfo'), icon: FileText },
                ]).map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => { setBannerError(null); setActiveTab(tab.id) }}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'info' && (
                <Card padded>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {tenant.description && (
                            <div className="md:col-span-2 flex gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                <FileText size={18} className="text-slate-400 mt-0.5 shrink-0" />
                                <p className="text-sm text-slate-600 dark:text-slate-400">{tenant.description}</p>
                            </div>
                        )}
                        {tenant.address && (
                            <div className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                <MapPin size={18} className="text-slate-400 mt-0.5 shrink-0" />
                                <p className="text-sm text-slate-600 dark:text-slate-400">{tenant.address}</p>
                            </div>
                        )}
                        {tenant.phone && (
                            <div className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                <Phone size={18} className="text-slate-400 shrink-0" />
                                <p className="text-sm text-slate-600 dark:text-slate-400">{tenant.phone}</p>
                            </div>
                        )}
                        {tenant.email && (
                            <div className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                <Mail size={18} className="text-slate-400 shrink-0" />
                                <p className="text-sm text-slate-600 dark:text-slate-400">{tenant.email}</p>
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {activeTab === 'users' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                placeholder={t('users.searchPlaceholder')}
                                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <Button icon={<UserPlus size={16} />} onClick={() => { setCreateUserError(null); setIsCreateUserOpen(true) }}>
                            {t('tenants.createUser')}
                        </Button>
                    </div>

                    <DataTable
                        data={filteredUsers}
                        columns={userColumns}
                        isLoading={usersLoading}
                        getRowId={(u) => u.id}
                        pageSize={25}
                        emptyState={
                            <EmptyState
                                icon={<Users size={40} />}
                                title={t('tenants.noUsersInTenant')}
                                description={t('tenants.addUsersHint')}
                            />
                        }
                    />
                </div>
            )}

            {activeTab === 'assign' && (
                <div className="space-y-4">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={availableSearch}
                            onChange={(e) => setAvailableSearch(e.target.value)}
                            placeholder={t('users.searchPlaceholder')}
                            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <DataTable
                        data={filteredAvailable}
                        columns={availableColumns}
                        isLoading={availableLoading}
                        getRowId={(u) => u.id}
                        pageSize={25}
                        emptyState={<EmptyState icon={<Users size={40} />} title={t('tenants.noAvailableUsers')} />}
                    />
                </div>
            )}

            <TenantFormModal
                isOpen={isEditModalOpen}
                onClose={() => { setTenantSaveError(null); setIsEditModalOpen(false) }}
                tenant={tenant}
                onSave={handleUpdateTenant}
                isLoading={updateTenantMutation.isPending}
                saveError={tenantSaveError}
            />

            <UserFormModal
                mode="create"
                isOpen={isCreateUserOpen}
                onClose={() => { setIsCreateUserOpen(false); setCreateUserError(null) }}
                onSave={handleCreateUser}
                isLoading={createUserMutation.isPending}
                error={createUserError}
                allowedRoles={['tenant_user', 'tenant_admin']}
                context={tenant.name}
            />

            <UserFormModal
                mode="edit"
                isOpen={!!editingUser}
                user={editingUser}
                onClose={() => { setEditingUser(null); setEditUserError(null) }}
                onSave={handleEditUser}
                isLoading={updateUserMutation.isPending}
                error={editUserError}
                allowedRoles={['tenant_user', 'tenant_admin']}
            />

            <ConfirmationModal
                isOpen={!!userToRemove}
                onClose={() => setUserToRemove(null)}
                onConfirm={confirmRemove}
                title={t('tenants.removeUser')}
                message={t('tenants.removeConfirm')}
                type="danger"
                isLoading={removeMutation.isPending}
            />
        </div>
    )
}
