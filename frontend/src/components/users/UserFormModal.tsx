import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Shield, ShieldCheck, UserPlus, Wand2 } from 'lucide-react'
import type { TenantUser, UserCreateInput } from '@/modules/tenants'
import type { UpdateUserInput } from '@/modules/tenants'
import {
    Modal,
    FormField,
    FormSection,
    FormFooter,
    formControlClass,
    cn,
} from '@/components/ui'

export type UserRole = 'tenant_user' | 'tenant_admin' | 'platform_admin'

type Mode = 'create' | 'edit'

export type UserFormPayload =
    | { mode: 'create'; data: UserCreateInput }
    | { mode: 'edit'; data: UpdateUserInput }

export interface UserFormModalProps {
    isOpen: boolean
    onClose: () => void
    mode?: Mode
    /** Required in edit mode. */
    user?: TenantUser | null
    onSave: (payload: UserFormPayload) => Promise<void> | void
    isLoading: boolean
    error?: string | null
    allowedRoles?: UserRole[]
    context?: string
    hint?: string
}

const defaultRoles: UserRole[] = ['tenant_user', 'tenant_admin']

// Avatar: gradient badge mirroring the table cell look.
function Avatar({ username, email }: { username: string; email: string }) {
    const initial = (username || email || '?').trim().charAt(0).toUpperCase()
    return (
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl shadow-sm">
            {initial || '?'}
        </div>
    )
}

function scorePassword(pw: string): number {
    if (!pw) return 0
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
    if (/\d/.test(pw)) score++
    if (/[^a-zA-Z0-9]/.test(pw)) score++
    return Math.min(4, score)
}

function generatePassword(length = 14): string {
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
    const lower = 'abcdefghjkmnpqrstuvwxyz'
    const digit = '23456789'
    const sym = '!@#$%^&*-_=+'
    const all = upper + lower + digit + sym
    const crypto = (globalThis as { crypto?: Crypto }).crypto
    const rand = (n: number) => {
        if (crypto?.getRandomValues) {
            const arr = new Uint32Array(1)
            crypto.getRandomValues(arr)
            return arr[0] % n
        }
        return Math.floor(Math.random() * n)
    }
    const ensure = [upper[rand(upper.length)], lower[rand(lower.length)], digit[rand(digit.length)], sym[rand(sym.length)]]
    const rest = Array.from({ length: Math.max(0, length - ensure.length) }, () => all[rand(all.length)])
    return [...ensure, ...rest].sort(() => rand(3) - 1).join('')
}

/**
 * Shared user form modal — create + edit flows with role cards, avatar preview,
 * password strength meter, and Generate-password shortcut.
 */
export function UserFormModal({
    isOpen,
    onClose,
    mode = 'create',
    user,
    onSave,
    isLoading,
    error = null,
    allowedRoles = defaultRoles,
    context,
    hint,
}: UserFormModalProps) {
    const { t } = useTranslation()
    const roles = allowedRoles.length ? allowedRoles : defaultRoles

    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [password, setPassword] = useState('')
    const [role, setRole] = useState<UserRole>(roles[0])
    const [isActive, setIsActive] = useState(true)
    const [showPassword, setShowPassword] = useState(false)
    const [localError, setLocalError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) return
        if (mode === 'edit' && user) {
            setUsername(user.username)
            setEmail(user.email)
            setFirstName(user.first_name || '')
            setLastName(user.last_name || '')
            setPassword('')
            setRole((user.role as UserRole) ?? roles[0])
            setIsActive(user.is_active)
        } else {
            setUsername('')
            setEmail('')
            setFirstName('')
            setLastName('')
            setPassword('')
            setRole(roles[0])
            setIsActive(true)
        }
        setShowPassword(false)
        setLocalError(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, mode, user])

    const displayError = error ?? localError
    const passwordScore = useMemo(() => scorePassword(password), [password])

    const handleGenerate = () => {
        const pw = generatePassword()
        setPassword(pw)
        setShowPassword(true)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (mode === 'create') {
            if (!username || !email || !password) { setLocalError(t('tenants.fillAllFields')); return }
            if (password.length < 8) { setLocalError(t('tenants.passwordMinLength')); return }
            setLocalError(null)
            await onSave({
                mode: 'create',
                data: { username, email, password, role },
            })
            return
        }
        // Edit mode
        if (password && password.length < 8) { setLocalError(t('tenants.passwordMinLength')); return }
        const patch: UpdateUserInput = {
            first_name: firstName,
            last_name: lastName,
            email,
            role,
            is_active: isActive,
        }
        if (password) patch.password = password
        setLocalError(null)
        await onSave({ mode: 'edit', data: patch })
    }

    const roleIcons: Record<UserRole, React.ReactNode> = {
        tenant_user: <ShieldCheck size={18} className="text-slate-400" />,
        tenant_admin: <Shield size={18} className="text-blue-500" />,
        platform_admin: <Shield size={18} className="text-purple-500" />,
    }
    const roleLabel = (r: UserRole) =>
        r === 'platform_admin' ? t('users.platformAdmin')
            : r === 'tenant_admin' ? t('users.tenantAdmin')
            : t('users.tenantUser')

    const displayUsername = username || user?.username || ''

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
            title={mode === 'edit' ? t('tenants.editUser') : t('tenants.createUser')}
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                {(context || hint) && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                        {context && <p className="font-medium text-slate-600 dark:text-slate-300">{context}</p>}
                        {hint && <p>{hint}</p>}
                    </div>
                )}

                {displayError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                        {displayError}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5">
                    {/* Avatar + status chip */}
                    <div className="flex flex-col items-center gap-2">
                        <Avatar username={displayUsername} email={email} />
                        <span className="text-xs text-slate-500 text-center break-all max-w-[140px]">
                            {displayUsername || t('tenants.username')}
                        </span>
                    </div>

                    <div className="space-y-5 min-w-0">
                        <FormSection title={t('tenants.identityHeading')} layout="grid">
                            <FormField label={t('tenants.username')} required>
                                <input
                                    type="text"
                                    autoComplete="off"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className={formControlClass}
                                    placeholder={t('tenants.usernamePlaceholder')}
                                    required
                                    disabled={mode === 'edit'}
                                    autoFocus={mode === 'create'}
                                />
                            </FormField>
                            <FormField label={t('common.email')} required>
                                <input
                                    type="email"
                                    autoComplete="off"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={formControlClass}
                                    placeholder={t('tenants.emailPlaceholderUser')}
                                    required
                                />
                            </FormField>
                            {mode === 'edit' && (
                                <>
                                    <FormField label={t('tenants.firstName')}>
                                        <input
                                            type="text"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            className={formControlClass}
                                            placeholder={t('tenants.firstNamePlaceholder')}
                                        />
                                    </FormField>
                                    <FormField label={t('tenants.lastName')}>
                                        <input
                                            type="text"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            className={formControlClass}
                                            placeholder={t('tenants.lastNamePlaceholder')}
                                        />
                                    </FormField>
                                </>
                            )}
                        </FormSection>

                        <FormSection
                            title={mode === 'edit' ? t('tenants.changePassword') : t('tenants.credentialsHeading')}
                        >
                            <FormField
                                label={t('tenants.passwordPlaceholder')}
                                required={mode === 'create'}
                                help={
                                    mode === 'edit'
                                        ? t('tenants.passwordOptional')
                                        : t('tenants.passwordMinLength')
                                }
                            >
                                <div>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className={`${formControlClass} pr-10`}
                                                placeholder="••••••••"
                                                minLength={mode === 'create' ? 8 : undefined}
                                                required={mode === 'create'}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword((v) => !v)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                                                aria-label={showPassword ? 'Hide' : 'Show'}
                                            >
                                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleGenerate}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                        >
                                            <Wand2 size={13} />
                                            {t('tenants.generatePassword')}
                                        </button>
                                    </div>
                                    {(password || mode === 'create') && (
                                        <PasswordStrengthMeter score={passwordScore} />
                                    )}
                                </div>
                            </FormField>
                        </FormSection>

                        <FormSection title={t('tenants.accessHeading')}>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {roles.map((r) => {
                                    const active = role === r
                                    return (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={() => setRole(r)}
                                            className={cn(
                                                'flex items-start gap-2.5 p-3 rounded-lg border text-left transition-colors',
                                                active
                                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
                                            )}
                                        >
                                            <div className="shrink-0">{roleIcons[r]}</div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                    {roleLabel(r)}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                                                    {t(`users.roleDesc.${r}`, '')}
                                                </p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>

                            {mode === 'edit' && (
                                <label className="flex items-center gap-3 pt-1 cursor-pointer">
                                    <span className="relative inline-flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={isActive}
                                            onChange={(e) => setIsActive(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <span className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all" />
                                    </span>
                                    <span className="text-sm text-slate-600 dark:text-slate-300">
                                        {t('tenants.activeStatus')}
                                    </span>
                                </label>
                            )}
                        </FormSection>
                    </div>
                </div>

                <FormFooter
                    asSubmit
                    loading={isLoading}
                    onCancel={onClose}
                    icon={mode === 'create' ? <UserPlus size={16} /> : undefined}
                    primaryLabel={mode === 'edit' ? t('common.save') : t('tenants.createUserBtn')}
                />
            </form>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────

function PasswordStrengthMeter({ score }: { score: number }) {
    const { t } = useTranslation()
    const labels = [
        t('users.passwordStrength.veryWeak', 'Very weak'),
        t('users.passwordStrength.weak', 'Weak'),
        t('users.passwordStrength.fair', 'Fair'),
        t('users.passwordStrength.good', 'Good'),
        t('users.passwordStrength.strong', 'Strong'),
    ]
    const label = labels[score] ?? labels[0]
    const bars = [0, 1, 2, 3]
    const toneClass = [
        'bg-red-500',
        'bg-red-500',
        'bg-amber-500',
        'bg-emerald-500',
        'bg-emerald-500',
    ][score]

    return (
        <div className="mt-2 flex items-center gap-2">
            <div className="flex gap-1 flex-1">
                {bars.map((b) => (
                    <span
                        key={b}
                        className={cn(
                            'h-1 flex-1 rounded-full',
                            b < score ? toneClass : 'bg-slate-200 dark:bg-slate-700',
                        )}
                    />
                ))}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 min-w-[50px] text-right">{label}</span>
        </div>
    )
}
