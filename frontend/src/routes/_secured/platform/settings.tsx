import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Settings, Mail, CheckCircle, AlertTriangle, Send, Save, Eye, EyeOff, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { settingsApi } from '@/modules/settings/data'
import type { SmtpSettingsData, SmtpSettingsInput } from '@/modules/settings/data'

export const Route = createFileRoute('/_secured/platform/settings')({
    component: SettingsPage,
})

function SettingsPage() {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [testEmail, setTestEmail] = useState('')
    const [showTestModal, setShowTestModal] = useState(false)

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
        if (message) {
            const timer = setTimeout(() => setMessage(null), 5000)
            return () => clearTimeout(timer)
        }
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

    const handleTest = async () => {
        if (!testEmail.trim()) return
        try {
            setTesting(true)
            await settingsApi.testSmtpConnection(testEmail)
            setMessage({ type: 'success', text: t('settings.smtp.testSuccess') })
            setShowTestModal(false)
            setTestEmail('')
        } catch {
            setMessage({ type: 'error', text: t('settings.smtp.testFailed') })
        } finally {
            setTesting(false)
        }
    }

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
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-1">
                    <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-2.5 rounded-xl shadow-md shadow-indigo-500/20">
                        <Settings size={22} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                            {t('settings.title')}
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('settings.subtitle')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Status Message */}
            {message && (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                    message.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}>
                    {message.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                    {message.text}
                </div>
            )}

            {/* SMTP Status Banner */}
            <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${
                smtpStatus.is_configured
                    ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
            }`}>
                {smtpStatus.is_configured ? (
                    <CheckCircle size={20} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                ) : (
                    <AlertTriangle size={20} className="text-amber-500 dark:text-amber-400 shrink-0" />
                )}
                <div className="flex-1">
                    <p className={`text-sm font-medium ${
                        smtpStatus.is_configured
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                    }`}>
                        {smtpStatus.is_configured
                            ? t('settings.smtp.configured')
                            : t('settings.smtp.notConfigured')}
                    </p>
                    {smtpStatus.updated_at && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {new Date(smtpStatus.updated_at).toLocaleString()}
                        </p>
                    )}
                </div>
                {smtpStatus.is_configured && (
                    <button
                        type="button"
                        onClick={() => setShowTestModal(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                    >
                        <Send size={14} />
                        {t('settings.smtp.testConnection')}
                    </button>
                )}
            </div>

            {/* SMTP Settings Form */}
            <form onSubmit={handleSave}>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    {/* Section Header */}
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                            <Mail size={18} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                                {t('settings.smtp.title')}
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t('settings.smtp.description')}
                            </p>
                        </div>
                    </div>

                    <div className="p-6 space-y-5">
                        {/* Host & Port */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                                    {t('settings.smtp.host')} <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <Server size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={formData.host}
                                        onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                        placeholder={t('settings.smtp.hostPlaceholder')}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                                    {t('settings.smtp.port')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    value={formData.port}
                                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 0 })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    placeholder={t('settings.smtp.portPlaceholder')}
                                    required
                                    min={1}
                                    max={65535}
                                />
                            </div>
                        </div>

                        {/* Username & Password */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                                    {t('settings.smtp.username')}
                                </label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    placeholder={t('settings.smtp.usernamePlaceholder')}
                                    autoComplete="off"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                                    {t('settings.smtp.password')}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                        placeholder={smtpStatus.password_set ? t('settings.smtp.passwordHint') : t('settings.smtp.passwordPlaceholder')}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {smtpStatus.password_set && (
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                        {t('settings.smtp.passwordHint')}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* From Email */}
                        <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                                {t('settings.smtp.fromEmail')} <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="email"
                                    value={formData.from_email}
                                    onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    placeholder={t('settings.smtp.fromEmailPlaceholder')}
                                    required
                                />
                            </div>
                        </div>

                        {/* TLS / SSL Toggles */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={formData.use_tls}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        use_tls: e.target.checked,
                                        use_ssl: e.target.checked ? false : formData.use_ssl,
                                    })}
                                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div>
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {t('settings.smtp.useTls')}
                                    </span>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">Port 587</p>
                                </div>
                            </label>
                            <label className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={formData.use_ssl}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        use_ssl: e.target.checked,
                                        use_tls: e.target.checked ? false : formData.use_tls,
                                    })}
                                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div>
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {t('settings.smtp.useSsl')}
                                    </span>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">Port 465</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-end gap-3">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-sm shadow-indigo-500/20 hover:shadow-indigo-500/30"
                        >
                            <Save size={16} />
                            {saving ? t('settings.smtp.saving') : t('common.save')}
                        </button>
                    </div>
                </div>
            </form>

            {/* Test Email Modal */}
            {showTestModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <Send size={16} className="text-indigo-500" />
                                {t('settings.smtp.testConnection')}
                            </h3>
                        </div>
                        <div className="p-6">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                                {t('settings.smtp.testEmail')}
                            </label>
                            <input
                                type="email"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                placeholder={t('settings.smtp.testEmailPlaceholder')}
                                autoFocus
                            />
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => { setShowTestModal(false); setTestEmail('') }}
                                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleTest}
                                disabled={testing || !testEmail.trim()}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
                            >
                                <Send size={14} />
                                {testing ? t('settings.smtp.testing') : t('settings.smtp.testConnection')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
