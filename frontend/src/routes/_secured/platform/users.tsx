import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    Users, Search, Shield, Building2, Clock,
    ChevronDown, UserPlus, Pencil, FileText,
} from 'lucide-react'
import { exportReport } from '@/utils/report'
import {
    useAllUsers,
    useCreateUnassignedUser,
    useCreateUser,
    useTenants,
    useUpdateUser,
} from '@/modules/tenants'
import type { TenantUser } from '@/modules/tenants'
import { UserFormModal, type UserFormPayload } from '@/components/users/UserFormModal'
import {
    PageHeader,
    Button,
    Badge,
    DataTable,
    EmptyState,
    StatCard,
    type ColumnDef,
    type BadgeVariant,
} from '@/components/ui'
import { useTranslation } from 'react-i18next'
import { getApiErrorMessage } from '@/api/errors'
import { tenantTrustCopy } from '@/modules/tenants/trust-copy'

export const Route = createFileRoute('/_secured/platform/users')({
    component: AllUsersPage,
})

const roleConfig: Record<string, { label: (t: (k: string) => string) => string; variant: BadgeVariant }> = {
    platform_admin: { label: (t) => t('users.platformAdmin'), variant: 'purple' },
    tenant_admin: { label: (t) => t('users.tenantAdmin'), variant: 'info' },
    tenant_user: { label: (t) => t('users.tenantUser'), variant: 'neutral' },
}

function RoleBadge({ user }: { user: TenantUser }) {
    const { t } = useTranslation()
    if (user.is_superuser && !user.tenant_slug) {
        return (
            <Badge variant="purple" icon={<Shield size={11} />}>
                {t('users.superuser')}
            </Badge>
        )
    }
    const cfg = roleConfig[user.role] ?? roleConfig.tenant_user
    return <Badge variant={cfg.variant}>{cfg.label(t)}</Badge>
}

function UserAvatar({ user }: { user: TenantUser }) {
    return (
        <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-600 font-medium text-xs shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
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

function AllUsersPage() {
    const { t, i18n } = useTranslation()
    const copy = tenantTrustCopy(i18n.language)
    const { data: users = [], isLoading, error, refetch } = useAllUsers()
    const { data: tenants = [], isLoading: tenantsLoading, error: tenantsError, refetch: refetchTenants } = useTenants()
    const createUserMutation = useCreateUnassignedUser()
    const createAssignedUserMutation = useCreateUser()
    const updateUserMutation = useUpdateUser()
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    const [searchQuery, setSearchQuery] = useState('')
    const [roleFilter, setRoleFilter] = useState('all')
    const [tenantFilter, setTenantFilter] = useState('all')
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)
    const [editingUser, setEditingUser] = useState<TenantUser | null>(null)
    const [editError, setEditError] = useState<string | null>(null)

    const filteredUsers = useMemo(
        () =>
            users.filter((u: TenantUser) => {
                const q = searchQuery.toLowerCase()
                const matchSearch =
                    !q
                    || u.username.toLowerCase().includes(q)
                    || u.email.toLowerCase().includes(q)
                    || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
                const matchRole = roleFilter === 'all' || u.role === roleFilter
                const matchTenant =
                    tenantFilter === 'all'
                    || (tenantFilter === 'unassigned' ? !u.tenant_slug : u.tenant_slug === tenantFilter)
                return matchSearch && matchRole && matchTenant
            }),
        [users, searchQuery, roleFilter, tenantFilter],
    )

    const handleCreate = async (payload: UserFormPayload) => {
        if (payload.mode !== 'create') return
        try {
            setCreateError(null)
            if (payload.tenantSlug) {
                await createAssignedUserMutation.mutateAsync({ slug: payload.tenantSlug, data: payload.data })
            } else {
                await createUserMutation.mutateAsync(payload.data)
            }
            setIsCreateOpen(false)
        } catch (err: unknown) {
            setCreateError(getApiErrorMessage(err, t('tenants.createUserFailed')))
        }
    }

    const handleEditSave = async (payload: UserFormPayload) => {
        if (payload.mode !== 'edit' || !editingUser) return
        try {
            setEditError(null)
            await updateUserMutation.mutateAsync({ userId: editingUser.id, data: payload.data })
            setEditingUser(null)
        } catch (err) {
            setEditError(getApiErrorMessage(err, t('tenants.userUpdateFailed')))
        }
    }

    const stats = {
        total: users.length,
        platform_admin: users.filter((u: TenantUser) => u.role === 'platform_admin').length,
        tenant_admin: users.filter((u: TenantUser) => u.role === 'tenant_admin').length,
        tenant_user: users.filter((u: TenantUser) => u.role === 'tenant_user').length,
    }

    const columns: ColumnDef<TenantUser>[] = [
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
            sortable: true,
            sortAccessor: (u) => u.role,
            cell: (u) => <RoleBadge user={u} />,
        },
        {
            key: 'tenant',
            header: t('users.tenantLabel'),
            sortable: true,
            sortAccessor: (u) => u.tenant_name ?? '',
            cell: (u) =>
                u.tenant_slug ? (
                    <Link
                        to="/platform/tenants/$slug"
                        params={{ slug: u.tenant_slug }}
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        <Building2 size={13} />
                        {u.tenant_name}
                    </Link>
                ) : (
                    <span className="text-sm text-slate-400 italic">{t('users.unassigned')}</span>
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
            key: 'lastLogin',
            header: t('tenants.lastLogin'),
            sortable: true,
            sortAccessor: (u) => (u.last_login ? new Date(u.last_login) : null),
            cell: (u) => (
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                    <Clock size={13} className="text-slate-400" />
                    {u.last_login ? new Date(u.last_login).toLocaleDateString(locale) : t('tenants.never')}
                </div>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (u) => (
                <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil size={13} />}
                    onClick={(e) => { e.stopPropagation(); setEditError(null); setEditingUser(u) }}
                >
                    {t('common.edit')}
                </Button>
            ),
        },
    ]

    return (
        <div className="max-w-7xl mx-auto w-full">
            <PageHeader
                icon={<Users size={22} />}
                title={t('users.title')}
                subtitle={error ? t('users.subtitle') : `${t('users.subtitle')} · ${t('users.userCount', { count: users.length })}`}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={<FileText size={16} />}
                            disabled={!!error || filteredUsers.length === 0}
                            title={t('common.exportReportTitle')}
                            onClick={() => exportReport(
                                filteredUsers,
                                [
                                    { header: t('tenants.username'), value: (u) => u.username },
                                    { header: t('common.email'), value: (u) => u.email ?? '' },
                                    { header: t('tenants.firstName'), value: (u) => u.first_name ?? '' },
                                    { header: t('tenants.lastName'), value: (u) => u.last_name ?? '' },
                                    { header: t('users.roleLabel'), value: (u) => u.role },
                                    { header: t('users.tenantLabel'), value: (u) => u.tenant_name ?? '' },
                                    { header: t('users.statusLabel'), value: (u) => u.is_active ? t('users.active') : t('users.inactive') },
                                    { header: t('tenants.lastLogin'), value: (u) => u.last_login ? new Date(u.last_login).toLocaleString(locale) : '' },
                                ],
                                'platform_users_report',
                            )}
                        >
                            {t('common.exportReport')}
                        </Button>
                        <Button icon={<UserPlus size={16} />} onClick={() => { setCreateError(null); setIsCreateOpen(true) }}>
                            {t('tenants.createUser')}
                        </Button>
                    </>
                }
            />

            {!error && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard tone="neutral" icon={<Users size={18} />} value={stats.total} label={t('tenants.totalUsers')} />
                <StatCard tone="info" icon={<Shield size={18} />} value={stats.platform_admin} label={t('users.platformAdmin')} />
                <StatCard tone="info" icon={<Shield size={18} />} value={stats.tenant_admin} label={t('users.tenantAdmin')} />
                <StatCard tone="success" icon={<Users size={18} />} value={stats.tenant_user} label={t('users.tenantUser')} />
            </div>}

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('users.searchPlaceholder')}
                            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="relative">
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="appearance-none pl-4 pr-10 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm min-w-[160px]"
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
                            className="appearance-none pl-4 pr-10 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm min-w-[180px]"
                        >
                            <option value="all">{t('users.allTenants')}</option>
                            <option value="unassigned">{t('users.unassigned')}</option>
                            {tenants.map((tenant) => (
                                <option key={tenant.slug} value={tenant.slug}>{tenant.name}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            {tenantsError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"><p>{getApiErrorMessage(tenantsError, copy.tenantLoadFailed)}</p><Button variant="secondary" onClick={() => void refetchTenants()}>{copy.retry}</Button></div>}
            {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"><p>{getApiErrorMessage(error, copy.usersLoadFailed)}</p><Button variant="secondary" onClick={() => void refetch()}>{copy.retry}</Button></div>}
            {!error && <DataTable
                data={filteredUsers}
                columns={columns}
                isLoading={isLoading}
                getRowId={(u) => u.id}
                pageSize={25}
                emptyState={<EmptyState icon={<Users size={40} />} title={t('users.noUsers')} />}
            />}

            <UserFormModal
                mode="create"
                isOpen={isCreateOpen}
                onClose={() => { setIsCreateOpen(false); setCreateError(null) }}
                onSave={handleCreate}
                isLoading={createUserMutation.isPending || createAssignedUserMutation.isPending}
                error={createError}
                allowedRoles={['tenant_user', 'tenant_admin']}
                assignment={{ tenants, isLoading: tenantsLoading, error: tenantsError ? getApiErrorMessage(tenantsError, copy.tenantLoadFailed) : null, onRetry: () => void refetchTenants() }}
            />

            <UserFormModal
                mode="edit"
                isOpen={!!editingUser}
                user={editingUser}
                onClose={() => { setEditingUser(null); setEditError(null) }}
                onSave={handleEditSave}
                isLoading={updateUserMutation.isPending}
                error={editError}
                allowedRoles={editingUser?.role === 'platform_admin' ? ['tenant_user', 'tenant_admin', 'platform_admin'] : ['tenant_user', 'tenant_admin']}
            />
        </div>
    )
}
