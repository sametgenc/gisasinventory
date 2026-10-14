import { useState, useEffect, useRef, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Settings, Mail, Send, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { settingsApi, type SmtpSettingsData, type SmtpSettingsInput } from '@/modules/settings/data'
import { Modal, FormField, FormSection, FormFooter, PageHeader, Button, Card, formControlClass } from '@/components/ui'

export const Route = createFileRoute('/_secured/platform/settings')({ component: SettingsPage })
type Gate = 'mfa_verification_required' | 'reauthentication_required' | null
type Message = { type: 'success' | 'error'; text: string }

function errorData(error: unknown): { code?: string; detail?: string; [key: string]: unknown } {
    if (!axios.isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') return {}
    return error.response.data
}
function securityGate(code: unknown): Gate { return code === 'reauthentication_required' || code === 'mfa_verification_required' ? code : null }
function SecurityGate({ gate }: { gate: Gate }) {
    const { t } = useTranslation()
    if (!gate) return null
    return <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
        <p className="mb-3 leading-6">{t(gate === 'reauthentication_required' ? 'settings.smtp.reauthenticationRequired' : 'settings.smtp.mfaVerificationRequired')}</p>
        <Link to="/auth/reauthenticate" search={{ next: '/platform/settings', mfa: gate === 'mfa_verification_required' }} className="font-medium underline">{t(gate === 'mfa_verification_required' ? 'settings.smtp.mfaVerify' : 'settings.smtp.verifyIdentity')}</Link>
    </div>
}
function Result({ message }: { message: Message | null }) {
    if (!message) return null
    return <p role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-md border p-3 text-sm leading-6 ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300'}`}>{message.text}</p>
}

function SettingsPage() {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [message, setMessage] = useState<Message | null>(null)
    const [status, setStatus] = useState<SmtpSettingsData | null>(null)
    const [gate, setGate] = useState<Gate>(null)
    const [fields, setFields] = useState<Record<string, string>>({})
    const [testOpen, setTestOpen] = useState(false)
    const busy = useRef(false)
    const [form, setForm] = useState<SmtpSettingsInput>({ host: '', port: 587, username: '', password: '', use_tls: true, use_ssl: false, from_email: '' })
    const load = useCallback(async () => {
        setLoading(true)
        setMessage(null)
        try {
            const data = await settingsApi.getSmtpSettings()
            setStatus(data)
            setForm({ host: data.host, port: data.port, username: data.username, password: '', use_tls: data.use_tls, use_ssl: data.use_ssl, from_email: data.from_email })
            setGate(data.reauthentication_required ? data.mfa_enabled ? 'mfa_verification_required' : 'reauthentication_required' : null)
        } catch { setMessage({ type: 'error', text: t('settings.smtp.loadFailed') }) }
        finally { setLoading(false) }
    }, [t])
    useEffect(() => { void load() }, [load])
    const save = async (event: React.FormEvent) => {
        event.preventDefault()
        if (busy.current) return
        busy.current = true
        setSaving(true)
        setFields({})
        setMessage(null)
        try {
            const data = await settingsApi.updateSmtpSettings(form)
            setStatus(data)
            setGate(null)
            setForm(current => ({ ...current, password: '' }))
            setShowPassword(false)
            setMessage({ type: 'success', text: t('settings.smtp.saveSuccess') })
        } catch (error) {
            const data = errorData(error)
            setGate(securityGate(data.code))
            const errors: Record<string, string> = {}
            for (const key of Object.keys(form)) {
                const value = data[key]
                if (Array.isArray(value)) errors[key] = value.filter(item => typeof item === 'string').join(' ')
                else if (typeof value === 'string') errors[key] = value
            }
            setFields(errors)
            setMessage({ type: 'error', text: t(Object.keys(errors).length ? 'settings.smtp.fieldsInvalid' : 'settings.smtp.saveFailed') })
        } finally { busy.current = false; setSaving(false) }
    }
    const transport = form.use_tls ? 'tls' : form.use_ssl ? 'ssl' : 'none'
    const input = (key: 'host' | 'username' | 'from_email', type = 'text') => <FormField label={t(`settings.smtp.${key === 'from_email' ? 'fromEmail' : key}`)} error={fields[key]} help={key === 'username' ? t('settings.smtp.usernameHelp') : undefined} required={key !== 'username'}>
        <input type={type} className={formControlClass} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} disabled={saving} required={key !== 'username'} autoComplete="off" />
    </FormField>
    return <div className="w-full min-w-0 max-w-4xl space-y-5">
        <PageHeader icon={<Settings size={22} />} title={t('settings.title')} subtitle={t('settings.subtitle')} />
        <Result message={message} />
        {loading ? <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{t('settings.smtp.loading')}</p> : !status ? <Button onClick={load}>{t('mfa.retry')}</Button> : <>
            <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-base font-semibold text-slate-900 dark:text-white">{t(status.delivery_mode === 'preview' ? 'settings.smtp.previewTitle' : status.is_configured ? 'settings.smtp.configured' : 'settings.smtp.notConfigured')}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">{t(status.delivery_mode === 'preview' ? 'settings.smtp.previewDescription' : 'settings.smtp.deliveryDescription')}</p></div><Button variant="secondary" icon={<Send size={16} />} onClick={() => setTestOpen(true)} disabled={saving || !status.is_configured}>{t('settings.smtp.testConnection')}</Button></div></Card>
            <SecurityGate gate={gate} />
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('settings.smtp.mfaOptional')} <Link to="/account/authenticators" className="font-medium text-blue-700 underline dark:text-blue-300">{t('settings.smtp.securitySettings')}</Link></p>
            <form onSubmit={save}>
                <Card><div className="flex items-center gap-3 border-b border-slate-200 p-5 dark:border-slate-700"><Mail size={20} className="text-blue-700 dark:text-blue-300" aria-hidden /><div><h2 className="font-semibold text-slate-900 dark:text-white">{t('settings.smtp.title')}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t('settings.smtp.description')}</p></div></div>
                <div className="space-y-6 p-5">
                    <FormSection title={t('settings.smtp.sectionSender')}>{input('from_email', 'email')}</FormSection>
                    <FormSection title={t('settings.smtp.sectionServer')}>
                        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">{input('host')}<FormField label={t('settings.smtp.port')} required error={fields.port}><input className={formControlClass} type="number" min={1} max={65535} required disabled={saving} value={form.port || ''} onChange={event => setForm({ ...form, port: Number(event.target.value) })} /></FormField></div>
                        <div className="grid gap-4 sm:grid-cols-2">{input('username')}<div className="relative"><FormField htmlFor="smtp-password" label={t('settings.smtp.password')} help={status.password_set ? t('settings.smtp.passwordHint') : undefined} error={fields.password}><input id="smtp-password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} className={`${formControlClass} pr-11`} autoComplete="new-password" disabled={saving} aria-describedby="smtp-password-desc" aria-invalid={Boolean(fields.password)} /></FormField><button type="button" onClick={() => setShowPassword(!showPassword)} disabled={saving} className="absolute right-0 top-7 h-10 px-3 text-slate-500 focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={t(showPassword ? 'settings.smtp.hidePassword' : 'settings.smtp.showPassword')} aria-pressed={showPassword}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
                        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('settings.smtp.appPasswordHelp')}</p>
                        <div><p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t('settings.smtp.security')}</p><div role="group" aria-label={t('settings.smtp.security')} className="flex flex-wrap gap-2">{(['tls', 'ssl'] as const).map(value => <Button key={value} variant={transport === value ? 'primary' : 'secondary'} aria-pressed={transport === value} disabled={saving} onClick={() => setForm(current => ({ ...current, use_tls: value === 'tls', use_ssl: value === 'ssl', port: [465, 587].includes(current.port) ? value === 'tls' ? 587 : 465 : current.port }))}>{value === 'tls' ? 'STARTTLS (587)' : 'SSL/TLS (465)'}</Button>)}</div><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.smtp.securityHelp')}</p>{transport === 'none' && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{t('settings.smtp.secureRequired')}</p>}{fields.use_tls && <p role="alert" className="text-sm text-red-700">{fields.use_tls}</p>}{fields.use_ssl && <p role="alert" className="text-sm text-red-700">{fields.use_ssl}</p>}</div>
                    </FormSection>
                </div><div className="flex justify-end border-t border-slate-200 p-4 dark:border-slate-700"><Button type="submit" loading={saving} disabled={transport === 'none'}>{t(saving ? 'settings.smtp.saving' : 'common.save')}</Button></div></Card>
            </form>
            <TestConnectionDialog isOpen={testOpen} onClose={() => setTestOpen(false)} onResult={setMessage} />
        </>}
    </div>
}

function TestConnectionDialog({ isOpen, onClose, onResult }: { isOpen: boolean; onClose: () => void; onResult: (message: Message) => void }) {
    const { t } = useTranslation()
    const [email, setEmail] = useState('')
    const [testing, setTesting] = useState(false)
    const [message, setMessage] = useState<Message | null>(null)
    const [fieldError, setFieldError] = useState<string | undefined>()
    const [gate, setGate] = useState<Gate>(null)
    const busy = useRef(false)
    useEffect(() => { if (isOpen) { setMessage(null); setFieldError(undefined); setGate(null) } }, [isOpen])
    const test = async (event: React.FormEvent) => {
        event.preventDefault()
        if (busy.current || !email.trim()) return
        busy.current = true
        setTesting(true)
        setMessage(null)
        setFieldError(undefined)
        setGate(null)
        try {
            const data = await settingsApi.testSmtpConnection(email.trim())
            const result: Message = { type: 'success', text: t(data.delivery_mode === 'preview' ? 'settings.smtp.testPreviewSuccess' : 'settings.smtp.testSuccess') }
            setMessage(result)
            onResult(result)
        } catch (error) {
            const data = errorData(error)
            setGate(securityGate(data.code))
            if (Array.isArray(data.email)) setFieldError(data.email.join(' '))
            setMessage({ type: 'error', text: t('settings.smtp.testFailed') })
        } finally { busy.current = false; setTesting(false) }
    }
    return <Modal isOpen={isOpen} onClose={onClose} closeDisabled={testing} title={t('settings.smtp.testConnection')} size="md" footer={<FormFooter asSubmit formId="smtp-test-form" primaryLabel={t('settings.smtp.testConnection')} icon={<Send size={16} />} loading={testing} disabled={!email.trim()} onCancel={onClose} />}>
        <form id="smtp-test-form" onSubmit={test} className="space-y-4"><Result message={message} /><SecurityGate gate={gate} /><FormField label={t('settings.smtp.testEmail')} help={t(testing ? 'settings.smtp.testing' : 'settings.smtp.testHelp')} error={fieldError} required><input type="email" className={formControlClass} value={email} onChange={event => setEmail(event.target.value)} disabled={testing} required autoFocus /></FormField></form>
    </Modal>
}
