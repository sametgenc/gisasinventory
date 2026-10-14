import { useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { Button, ConfirmationModal, FormField, formControlClass } from '@/components/ui'
import { Route } from '@/routes/_secured/account/totp-setup'
import { ALLAUTH_API } from '../data'
import { useSensitiveAction } from './useSensitiveAction'
import { SecurityError, SecurityPanel } from './SecurityPanel'
import { securityErrorKey } from './security'

export function TOTPSetup() {
    const { t } = useTranslation()
    const router = useRouter()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { mode, setupData } = Route.useLoaderData()
    const { execute, handleResponse } = useSensitiveAction()
    const [code, setCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [verified, setVerified] = useState(false)
    const [loading, setLoading] = useState(false)
    const [disableOpen, setDisableOpen] = useState(false)
    const busy = useRef(false)

    const run = (action: 'activate' | 'test' | 'disable') => {
        if (busy.current) return
        execute(async () => {
            if (busy.current) return
            busy.current = true
            setLoading(true)
            setError(null)
            setVerified(false)
            try {
                const res = action === 'activate' ? await ALLAUTH_API.activateTOTP(code) : action === 'test' ? await ALLAUTH_API.mfaReauthenticate(code) : await ALLAUTH_API.deleteTOTP()
                if (!await handleResponse(res)) return
                if (res.status !== 200) { setError(t(securityErrorKey(res, action === 'disable' ? 'mfa.errors.disable' : 'mfa.errors.verify'))); return }
                if (action === 'activate') {
                    // Preserve this completion step when refreshed loader data switches to manage mode.
                    setSuccess(true)
                    setCode('')
                    await queryClient.invalidateQueries({ queryKey: ['authenticators'] })
                    await router.invalidate()
                } else if (action === 'test') { setVerified(true); setCode('') }
                else {
                    setDisableOpen(false)
                    await queryClient.invalidateQueries({ queryKey: ['authenticators'] })
                    await navigate({ to: '/account/authenticators' })
                }
            } catch { setError(t('mfa.errors.connection')) }
            finally { busy.current = false; setLoading(false) }
        })
    }
    const codeForm = (action: 'activate' | 'test') => <form className="space-y-4" onSubmit={(event: FormEvent) => { event.preventDefault(); run(action) }}>
        <FormField label={t('mfa.codeLabel')} help={t('mfa.codeHint')} required>
            <input className={formControlClass} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={loading} />
        </FormField>
        <Button type="submit" loading={loading} disabled={code.length !== 6}>{t(action === 'activate' ? 'mfa.setup.activate' : 'mfa.setup.test')}</Button>
    </form>

    if (success) return <SecurityPanel title={t('mfa.setup.successTitle')} description={t('mfa.setup.successDescription')}>
        <p role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{t('mfa.setup.saveRecovery')}</p>
        <Link to="/auth/mfa/recovery-codes" className="inline-flex min-h-10 items-center rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{t('mfa.setup.openRecovery')}</Link>
        <Link to="/account/authenticators" className="mt-4 block text-sm text-blue-700 dark:text-blue-300">{t('mfa.recovery.backToSecurity')}</Link>
    </SecurityPanel>
    if (mode === 'error') return <SecurityPanel title={t('mfa.setup.title')} description={t('mfa.setup.description')}><SecurityError>{t('mfa.errors.load')}</SecurityError><Button onClick={() => router.invalidate()}>{t('mfa.retry')}</Button></SecurityPanel>
    if (mode === 'manage') return <SecurityPanel title={t('mfa.setup.appTitle')} description={t('mfa.setup.activeDescription')}>
        {error && !disableOpen && <SecurityError>{error}</SecurityError>}
        {verified && <p role="status" className="mb-4 text-sm text-emerald-700 dark:text-emerald-300">{t('mfa.setup.testSuccess')}</p>}
        {codeForm('test')}
        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700"><Button variant="danger" onClick={() => { setError(null); setDisableOpen(true) }} disabled={loading}>{t('mfa.setup.disable')}</Button></div>
        <ConfirmationModal isOpen={disableOpen} onClose={() => setDisableOpen(false)} onConfirm={() => run('disable')} title={t('mfa.setup.disableTitle')} message={t('mfa.setup.disableDescription')} confirmText={t('mfa.setup.disable')} isLoading={loading} error={error} />
    </SecurityPanel>
    return <SecurityPanel title={t('mfa.setup.title')} description={t('mfa.setup.description')}>
        {error && <SecurityError>{error}</SecurityError>}
        {setupData ? <>
            <ol className="mb-5 list-inside list-decimal space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300"><li>{t('mfa.setup.scan')}</li><li>{t('mfa.setup.enterCode')}</li></ol>
            <div className="mb-4 flex justify-center"><div className="rounded-md border border-slate-200 bg-white p-3"><QRCodeSVG value={setupData.totp_url} size={180} level="M" /></div></div>
            <details className="mb-6 text-sm text-slate-600 dark:text-slate-300"><summary className="cursor-pointer">{t('mfa.setup.manualKey')}</summary><p className="mt-3 break-all rounded-md bg-slate-100 p-3 font-mono dark:bg-slate-800">{setupData.secret}</p></details>
            {codeForm('activate')}
        </> : <SecurityError>{t('mfa.errors.load')}</SecurityError>}
    </SecurityPanel>
}
