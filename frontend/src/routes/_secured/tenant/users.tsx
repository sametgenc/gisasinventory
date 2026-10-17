import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Users, Search, Shield, Clock, Pencil, FileText } from 'lucide-react'
import { exportReport } from '@/utils/report'
import {
    useMyUsers,
    useCurrentTenant,
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
import { useAuth } from '@/auth/context'
import { getApiErrorMessage } from '@/api/errors'
import { tenantTrustCopy } from '@/modules/tenants/trust-copy'

export const Route = createFileRoute('/_secured/tenant/users')({
    component: MyUsersPage,
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

function MyUsersPage() {
    const { t, i18n } = useTranslation()
    const { user: authUser } = useAuth()
    const copy = tenantTrustCopy(i18n.language)
    const { data: users = [], isLoading, error, refetch } = useMyUsers()
    const { data: currentTenant } = useCurrentTenant()
    const updateUserMutation = useUpdateUser()
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    const [searchQuery, setSearchQuery] = useState('')
    const [editingUser, setEditingUser] = useState<TenantUser | null>(null)
    const [editError, setEditError] = useState<string | null>(null)

    const filteredUsers = useMemo(
        () =>
            users.filter((u: TenantUser) => {
                const q = searchQuery.toLowerCase()
                return (
                    !q
                    || u.username.toLowerCase().includes(q)
                    || u.email.toLowerCase().includes(q)
                    || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
                )
            }),
        [users, searchQuery],
    )

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

    const activeUsers = users.filter((u: TenantUser) => u.is_active).length

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
            cell: (u) => u.is_superuser || u.role === 'platform_admin' ? (
                <span className="text-xs text-slate-500">{copy.managedByPlatform}</span>
            ) : (
                <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil size={13} />}
                    onClick={() => { setEditError(null); setEditingUser(u) }}
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
                title={t('users.myTitle')}
                subtitle={`${currentTenant?.name || authUser?.tenant_name || ''} · ${t('users.mySubtitle')}`}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={<FileText size={16} />}
                            disabled={filteredUsers.length === 0}
                            title={t('common.exportReportTitle')}
                            onClick={() => exportReport(
                                filteredUsers,
                                [
                                    { header: t('tenants.username'), value: (u) => u.username },
                                    { header: t('common.email'), value: (u) => u.email ?? '' },
                                    { header: t('tenants.firstName'), value: (u) => u.first_name ?? '' },
                                    { header: t('tenants.lastName'), value: (u) => u.last_name ?? '' },
                                    { header: t('users.roleLabel'), value: (u) => u.role },
                                    { header: t('users.statusLabel'), value: (u) => u.is_active ? t('users.active') : t('users.inactive') },
                                    { header: t('tenants.lastLogin'), value: (u) => u.last_login ? new Date(u.last_login).toLocaleString(locale) : '' },
                                ],
                                'my_users_report',
                            )}
                        >
                            {t('common.exportReport')}
                        </Button>
                    </>
                }
            />

            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{copy.createUserGuidance}</p>
            {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"><p>{getApiErrorMessage(error, copy.usersLoadFailed)}</p><Button variant="secondary" onClick={() => void refetch()}>{copy.retry}</Button></div>}
            {!error && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <StatCard tone="neutral" icon={<Users size={18} />} value={users.length} label={t('tenants.totalUsers')} />
                <StatCard tone="success" icon={<Users size={18} />} value={activeUsers} label={t('tenants.activeUsers')} />
                <StatCard tone="warning" icon={<Users size={18} />} value={users.length - activeUsers} label={t('tenants.inactiveUsers')} />
            </div>}

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
                <div className="relative max-w-md">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('users.searchPlaceholder')}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {!error && <DataTable
                data={filteredUsers}
                columns={columns}
                isLoading={isLoading}
                getRowId={(u) => u.id}
                pageSize={25}
                emptyState={<EmptyState icon={<Users size={40} />} title={t('users.noUsers')} />}
            />}

            <UserFormModal
                mode="edit"
                isOpen={!!editingUser}
                user={editingUser}
                onClose={() => { setEditingUser(null); setEditError(null) }}
                onSave={handleEditSave}
                isLoading={updateUserMutation.isPending}
                error={editError}
                allowedRoles={['tenant_user', 'tenant_admin']}
            />
        </div>
    )
}
