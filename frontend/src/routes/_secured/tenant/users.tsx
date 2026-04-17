import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Users, Search, Shield, Clock, UserPlus, Pencil } from 'lucide-react'
import {
    useMyUsers,
    useCurrentTenant,
    useCreateUser,
    useUpdateUser,
} from '@/modules/tenants'
import type { TenantUser, UserCreateInput } from '@/modules/tenants'
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
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
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
    const { data: users = [], isLoading } = useMyUsers()
    const { data: currentTenant } = useCurrentTenant()
    const createUserMutation = useCreateUser()
    const updateUserMutation = useUpdateUser()
    const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US'

    const [searchQuery, setSearchQuery] = useState('')
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)
    const [editingUser, setEditingUser] = useState<TenantUser | null>(null)
    const [editError, setEditError] = useState<string | null>(null)

    const tenantSlug = authUser?.tenant_slug || currentTenant?.slug || ''

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

    const handleCreate = async (data: UserCreateInput) => {
        if (!tenantSlug) {
            setCreateError(t('tenants.createUserFailed'))
            return
        }
        try {
            setCreateError(null)
            await createUserMutation.mutateAsync({ slug: tenantSlug, data })
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
            cell: (u) => (
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
                    <Button icon={<UserPlus size={16} />} onClick={() => { setCreateError(null); setIsCreateOpen(true) }}>
                        {t('tenants.createUser')}
                    </Button>
                }
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <StatCard tone="neutral" icon={<Users size={18} />} value={users.length} label={t('tenants.totalUsers')} />
                <StatCard tone="success" icon={<Users size={18} />} value={activeUsers} label={t('tenants.activeUsers')} />
                <StatCard tone="warning" icon={<Users size={18} />} value={users.length - activeUsers} label={t('tenants.inactiveUsers')} />
            </div>

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

            <DataTable
                data={filteredUsers}
                columns={columns}
                isLoading={isLoading}
                getRowId={(u) => u.id}
                pageSize={25}
                emptyState={<EmptyState icon={<Users size={40} />} title={t('users.noUsers')} />}
            />

            <UserFormModal
                mode="create"
                isOpen={isCreateOpen}
                onClose={() => { setIsCreateOpen(false); setCreateError(null) }}
                onSave={(p) => p.mode === 'create' ? handleCreate(p.data) : undefined}
                isLoading={createUserMutation.isPending}
                error={createError}
                allowedRoles={['tenant_user', 'tenant_admin']}
                context={currentTenant?.name || authUser?.tenant_name || undefined}
            />

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
