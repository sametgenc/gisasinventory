import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Settings, Mail, CheckCircle, AlertTriangle, Send, Eye, EyeOff, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { settingsApi } from '@/modules/settings/data'
import type { SmtpSettingsData, SmtpSettingsInput } from '@/modules/settings/data'
import {
    Modal,
    FormField,
    FormSection,
    FormFooter,
    PageHeader,
    Button,
    Card,
    formControlClass,
} from '@/components/ui'

export const Route = createFileRoute('/_secured/platform/settings')({
    component: SettingsPage,
})

type Security = 'tls' | 'ssl' | 'none'

function securityFromForm(f: Pick<SmtpSettingsInput, 'use_tls' | 'use_ssl'>): Security {
    if (f.use_tls) return 'tls'
    if (f.use_ssl) return 'ssl'
    return 'none'
}

function SettingsPage() {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [isTestOpen, setIsTestOpen] = useState(false)

    const [formData, setFormData] = useState<SmtpSettingsInput>({
        host: '',
        port: 587,
        username: '',
        password: '',
        use_tls: true,
        use_ssl: false,
        from_email: '',
    })
    const [smtpStatus, setSmtpStatus] = useState<Pick<SmtpSettingsData, 'is_configured' | 'password_set' | 'updated_at'>>({
        is_configured: false,
        password_set: false,
        updated_at: null,
    })

    useEffect(() => {
        loadSettings()
    }, [])

    useEffect(() => {
        if (!message) return
        const timer = setTimeout(() => setMessage(null), 5000)
        return () => clearTimeout(timer)
    }, [message])

    const loadSettings = async () => {
        try {
            setLoading(true)
            const data = await settingsApi.getSmtpSettings()
            setFormData({
                host: data.host,
                port: data.port,
                username: data.username,
                password: '',
                use_tls: data.use_tls,
                use_ssl: data.use_ssl,
                from_email: data.from_email,
            })
            setSmtpStatus({
                is_configured: data.is_configured,
                password_set: data.password_set,
                updated_at: data.updated_at,
            })
        } catch {
            setMessage({ type: 'error', text: t('settings.smtp.saveFailed') })
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            setSaving(true)
            const data = await settingsApi.updateSmtpSettings(formData)
            setSmtpStatus({
                is_configured: data.is_configured,
                password_set: data.password_set,
                updated_at: data.updated_at,
            })
            setFormData(prev => ({ ...prev, password: '' }))
            setMessage({ type: 'success', text: t('settings.smtp.saveSuccess') })
        } catch {
            setMessage({ type: 'error', text: t('settings.smtp.saveFailed') })
        } finally {
            setSaving(false)
        }
    }

    const setSecurity = (sec: Security) => {
        setFormData(prev => ({
            ...prev,
            use_tls: sec === 'tls',
            use_ssl: sec === 'ssl',
            // Suggest a default port when the user hasn't customised it
            port: sec === 'ssl' && (prev.port === 587 || !prev.port) ? 465
                : sec === 'tls' && (prev.port === 465 || !prev.port) ? 587
                : prev.port,
        }))
    }

    const currentSecurity = securityFromForm(formData)

    if (loading) {
        return (
            <div className="w-full min-w-0">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                    <div className="h-4 w-96 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                    <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
                </div>
            </div>
        )
    }

    return (
        <div className="w-full min-w-0 space-y-6">
            <PageHeader
                icon={<Settings size={22} />}
                title={t('settings.title')}
                subtitle={t('settings.subtitle')}
            />

            {/* Toast-like message */}
            {message && (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                    }`}>
                    {message.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                    {message.text}
                </div>
            )}

            {/* Status banner */}
            <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${smtpStatus.is_configured
                ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                }`}>
                {smtpStatus.is_configured
                    ? <CheckCircle size={20} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                    : <AlertTriangle size={20} className="text-amber-500 dark:text-amber-400 shrink-0" />}
                <div className="flex-1">
                    <p className={`text-sm font-medium ${smtpStatus.is_configured ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                        {smtpStatus.is_configured ? t('settings.smtp.configured') : t('settings.smtp.notConfigured')}
                    </p>
                    {smtpStatus.updated_at && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {new Date(smtpStatus.updated_at).toLocaleString()}
                        </p>
                    )}
                </div>
                {smtpStatus.is_configured && (
                    <Button variant="secondary" icon={<Send size={14} />} onClick={() => setIsTestOpen(true)}>
                        {t('settings.smtp.testConnection')}
                    </Button>
                )}
            </div>

            {/* SMTP form */}
            <form onSubmit={handleSave}>
                <Card className="overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                            <Mail size={18} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('settings.smtp.title')}</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.smtp.description')}</p>
                        </div>
                    </div>

                    <div className="p-5 space-y-6">
                        <FormSection title={t('settings.smtp.sectionSender', 'Gönderen')}>
                            <FormField label={t('settings.smtp.fromEmail')} required>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    <input
                                        type="email"
                                        value={formData.from_email}
                                        onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
                                        className={`${formControlClass} pl-9`}
                                        placeholder={t('settings.smtp.fromEmailPlaceholder')}
                                        required
                                    />
                                </div>
                            </FormField>
                        </FormSection>

                        <FormSection title={t('settings.smtp.sectionServer', 'Sunucu')}>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <FormField label={t('settings.smtp.host')} required>
                                        <div className="relative">
                                            <Server size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            <input
                                                type="text"
                                                value={formData.host}
                                                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                                                className={`${formControlClass} pl-9`}
                                                placeholder={t('settings.smtp.hostPlaceholder')}
                                                required
                                            />
                                        </div>
                                    </FormField>
                                </div>
                                <FormField label={t('settings.smtp.port')} required>
                                    <input
                                        type="number"
                                        value={formData.port}
                                        onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 0 })}
                                        className={formControlClass}
                                        placeholder={t('settings.smtp.portPlaceholder')}
                                        required
                                        min={1}
                                        max={65535}
                                    />
                                </FormField>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label={t('settings.smtp.username')}>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        className={formControlClass}
                                        placeholder={t('settings.smtp.usernamePlaceholder')}
                                        autoComplete="off"
                                    />
                                </FormField>
                                <FormField
                                    label={t('settings.smtp.password')}
                                    help={smtpStatus.password_set ? t('settings.smtp.passwordHint') : undefined}
                                >
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            className={`${formControlClass} pr-10`}
                                            placeholder={smtpStatus.password_set ? t('settings.smtp.passwordHint') : t('settings.smtp.passwordPlaceholder')}
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
                                            tabIndex={-1}
                                            aria-label={showPassword ? t('settings.smtp.hidePassword', 'Hide password') : t('settings.smtp.showPassword', 'Show password')}
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </FormField>
                            </div>

                            <FormField
                                label={t('settings.smtp.security', 'Güvenlik')}
                                help={t('settings.smtp.securityHelp', 'STARTTLS (587) veya SSL (465) tavsiye edilir.')}
                            >
                                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/50 w-full sm:w-auto">
                                    {([
                                        { id: 'tls' as const, label: t('settings.smtp.useTls'), port: '587' },
                                        { id: 'ssl' as const, label: t('settings.smtp.useSsl'), port: '465' },
                                        { id: 'none' as const, label: t('settings.smtp.secNone', 'Yok') },
                                    ]).map(opt => {
                                        const active = currentSecurity === opt.id
                                        return (
                                            <button
                                                type="button"
                                                key={opt.id}
                                                onClick={() => setSecurity(opt.id)}
                                                className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${active
                                                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                    }`}
                                            >
                                                {opt.label}
                                                {opt.port && <span className="ml-1.5 text-xs opacity-60">({opt.port})</span>}
                                            </button>
                                        )
                                    })}
                                </div>
                            </FormField>
                        </FormSection>
                    </div>

                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-end">
                        <Button type="submit" loading={saving} icon={null}>
                            {saving ? t('settings.smtp.saving') : t('common.save')}
                        </Button>
                    </div>
                </Card>
            </form>

            {/* Test email dialog */}
            <TestConnectionDialog
                isOpen={isTestOpen}
                onClose={() => setIsTestOpen(false)}
                onResult={setMessage}
            />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────

function TestConnectionDialog({
    isOpen,
    onClose,
    onResult,
}: {
    isOpen: boolean
    onClose: () => void
    onResult: (m: { type: 'success' | 'error'; text: string }) => void
}) {
    const { t } = useTranslation()
    const [testEmail, setTestEmail] = useState('')
    const [testing, setTesting] = useState(false)

    useEffect(() => {
        if (!isOpen) { setTestEmail(''); setTesting(false) }
    }, [isOpen])

    const handleTest = async () => {
        if (!testEmail.trim()) return
        try {
            setTesting(true)
            await settingsApi.testSmtpConnection(testEmail)
            onResult({ type: 'success', text: t('settings.smtp.testSuccess') })
            onClose()
        } catch {
            onResult({ type: 'error', text: t('settings.smtp.testFailed') })
        } finally {
            setTesting(false)
        }
    }

    const formId = 'smtp-test-form'

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('settings.smtp.testConnection')}
            size="md"
            footer={
                <FormFooter
                    asSubmit
                    formId={formId}
                    icon={<Send size={16} />}
                    primaryLabel={t('settings.smtp.testConnection')}
                    loading={testing}
                    disabled={!testEmail.trim()}
                    onCancel={onClose}
                />
            }
        >
            <form id={formId} onSubmit={(e) => { e.preventDefault(); handleTest() }} className="space-y-5">
                <FormField
                    label={t('settings.smtp.testEmail')}
                    help={testing ? t('settings.smtp.testing') : undefined}
                    required
                >
                    <input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        className={formControlClass}
                        placeholder={t('settings.smtp.testEmailPlaceholder')}
                        required
                        autoFocus
                    />
                </FormField>
            </form>
        </Modal>
    )
}
