import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { parseRequestOptionsFromJSON, get as webauthnGet } from '@github/webauthn-json/browser-ponyfill'
import { useAuth } from '@/auth/context'
import { Button, FormField, formControlClass } from '@/components/ui'
import { Route } from '@/routes/_auth/auth/mfa/authenticate'
import { pathForPendingFlow } from '../routing'
import { ALLAUTH_API } from '../data'
import { MethodSelector, SecurityError, SecurityPanel } from './SecurityPanel'
import { pendingMfaMethods, safeReturnPath, securityErrorKey, type VerificationMethod } from './security'

export function MFAAuthenticate() {
    const { t } = useTranslation()
    const { pendingFlow, refresh, logout } = useAuth()
    const navigate = useNavigate()
    const { redirect } = Route.useSearch()
    const methods = pendingMfaMethods(pendingFlow?.id === 'mfa_authenticate' ? pendingFlow.types : [])
    const [selected, setSelected] = useState<VerificationMethod | null>(null)
    const method = selected && methods.includes(selected) ? selected : methods[0]
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const busy = useRef(false)

    const submit = async (event?: FormEvent) => {
        event?.preventDefault()
        if (busy.current || !method) return
        busy.current = true
        setLoading(true)
        setError(null)
        try {
            let res
            if (method === 'passkey') {
                const options = await ALLAUTH_API.getWebAuthnRequestOptionsForAuthentication()
                if (options.status !== 200 || !options.data?.request_options) { setError(t(securityErrorKey(options))); return }
                const credential = await webauthnGet(parseRequestOptionsFromJSON(options.data.request_options))
                res = await ALLAUTH_API.authenticateWebAuthn(credential)
            } else res = await ALLAUTH_API.authenticateMFA(code.trim())
            const next = pathForPendingFlow(res)
            if (next && next !== '/auth/mfa/authenticate') { await navigate({ to: next }); return }
            if (res.status !== 200) { setError(t(securityErrorKey(res))); return }
            const refreshed = await refresh(true)
            if (refreshed.error || refreshed.sessionRes?.status !== 200) { setError(t('mfa.errors.connection')); return }
            await navigate({ to: safeReturnPath(redirect) })
        } catch { setError(t(method === 'passkey' ? 'mfa.errors.passkey' : 'mfa.errors.connection')) }
        finally { busy.current = false; setLoading(false) }
    }
    const cancel = async () => {
        if (busy.current) return
        busy.current = true
        setLoading(true)
        setError(null)
        try { await logout(); await navigate({ to: '/login', search: { redirect: '/dashboard' } }) }
        catch { setError(t('mfa.errors.connection')) }
        finally { busy.current = false; setLoading(false) }
    }
    return <SecurityPanel title={t('mfa.authenticateTitle')} description={t('mfa.authenticateDescription')}>
        {error && <SecurityError>{error}</SecurityError>}
        {!method ? <SecurityError>{t('mfa.noPendingMethod')}</SecurityError> : <>
            <MethodSelector methods={methods} method={method} onChange={item => { setSelected(item); setCode(''); setError(null) }} disabled={loading} />
            {method === 'passkey' ? <><p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{t('mfa.passkeyHint')}</p><Button onClick={() => submit()} loading={loading}>{t('mfa.methods.passkey')}</Button></> : <form className="space-y-4" onSubmit={submit}>
                <FormField label={t(method === 'recovery' ? 'mfa.recoveryCodeLabel' : 'mfa.codeLabel')} help={t(method === 'recovery' ? 'mfa.recoveryCodeHint' : 'mfa.codeHint')} required>
                    <input className={formControlClass} type="text" value={code} onChange={event => setCode(method === 'totp' ? event.target.value.replace(/\D/g, '') : event.target.value)} inputMode={method === 'totp' ? 'numeric' : undefined} autoComplete="one-time-code" pattern={method === 'totp' ? '[0-9]{6}' : undefined} maxLength={method === 'totp' ? 6 : 64} required disabled={loading} />
                </FormField>
                <Button type="submit" loading={loading} disabled={method === 'totp' ? code.length !== 6 : !code.trim()}>{t('mfa.verify')}</Button>
            </form>}
        </>}
        <Button variant="ghost" className="mt-5" onClick={cancel} disabled={loading}>{t('mfa.backToLogin')}</Button>
    </SecurityPanel>
}
