import { useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { parseRequestOptionsFromJSON, get as webauthnGet } from '@github/webauthn-json/browser-ponyfill'
import { useAuth } from '@/auth/context'
import { Button, FormField, formControlClass } from '@/components/ui'
import { Route } from '@/routes/_auth/auth/reauthenticate'
import { ALLAUTH_API } from '../data'
import { MethodSelector, SecurityError, SecurityPanel } from './SecurityPanel'
import { reauthenticationMethods, safeReturnPath, securityErrorKey, type VerificationMethod } from './security'

export function Reauthenticate() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { user, refresh, logout } = useAuth()
    const { next, mfa } = Route.useSearch()
    const authenticators = useQuery({
        queryKey: ['authenticators'],
        queryFn: async () => {
            const res = await ALLAUTH_API.getAuthenticators()
            if (res.status !== 200 || !Array.isArray(res.data)) throw new Error('authenticators_unavailable')
            return res.data
        },
        retry: false,
    })
    const methods = reauthenticationMethods(authenticators.data ?? [], user?.has_usable_password === true, Boolean(mfa))
    const [selected, setSelected] = useState<VerificationMethod | null>(null)
    const method = selected && methods.includes(selected) ? selected : methods[0]
    const [value, setValue] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const busy = useRef(false)
    const returnToSignIn = async () => {
        if (busy.current) return
        busy.current = true
        setLoading(true)
        setError(null)
        try {
            await logout()
            await navigate({ to: '/login', search: { redirect: safeReturnPath(next) } })
        } catch { setError(t('mfa.errors.connection')) }
        finally { busy.current = false; setLoading(false) }
    }

    const submit = async (event?: FormEvent) => {
        event?.preventDefault()
        if (busy.current || !method) return
        busy.current = true
        setLoading(true)
        setError(null)
        try {
            let res
            if (method === 'passkey') {
                const options = await ALLAUTH_API.getWebAuthnRequestOptionsForReauthentication()
                if (options.status !== 200 || !options.data?.request_options) {
                    setError(t(securityErrorKey(options)))
                    return
                }
                const credential = await webauthnGet(parseRequestOptionsFromJSON(options.data.request_options))
                res = await ALLAUTH_API.reauthenticateUsingWebAuthn(credential)
            } else {
                res = method === 'totp' ? await ALLAUTH_API.mfaReauthenticate(value) : await ALLAUTH_API.reauthenticate(value)
            }
            if (res.status !== 200) {
                setError(t(securityErrorKey(res)))
                return
            }
            const refreshed = await refresh(true)
            if (refreshed.error || refreshed.sessionRes?.status !== 200) {
                setError(t('mfa.errors.connection'))
                return
            }
            await navigate({ to: safeReturnPath(next) })
        } catch {
            setError(t(method === 'passkey' ? 'mfa.errors.passkey' : 'mfa.errors.connection'))
        } finally {
            busy.current = false
            setLoading(false)
        }
    }

    return <SecurityPanel title={t('mfa.reauthenticateTitle')} description={t(mfa ? 'mfa.reauthenticateMfaDescription' : 'mfa.reauthenticateDescription')}>
        {authenticators.isPending ? <p role="status">{t('mfa.loading')}</p> : authenticators.isError ? <><SecurityError>{t('mfa.errors.load')}</SecurityError><Button onClick={() => authenticators.refetch()}>{t('mfa.retry')}</Button></> : !method ? <><SecurityError>{error || t('mfa.noRegisteredMethod')}</SecurityError><Button onClick={returnToSignIn} loading={loading}>{t('mfa.backToLogin')}</Button></> : <>
            <MethodSelector methods={methods} method={method} onChange={item => { setSelected(item); setValue(''); setError(null) }} disabled={loading} />
            {error && <SecurityError>{error}</SecurityError>}
            {method === 'passkey' ? <><p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{t('mfa.passkeyHint')}</p><Button onClick={() => submit()} loading={loading}>{t('mfa.methods.passkey')}</Button></> : <form onSubmit={submit} className="space-y-4">
                <FormField label={t(method === 'password' ? 'mfa.methods.password' : 'mfa.codeLabel')} help={method === 'totp' ? t('mfa.codeHint') : undefined} required>
                    <input type={method === 'password' ? 'password' : 'text'} className={formControlClass} autoComplete={method === 'password' ? 'current-password' : 'one-time-code'} inputMode={method === 'totp' ? 'numeric' : undefined} pattern={method === 'totp' ? '[0-9]{6}' : undefined} maxLength={method === 'totp' ? 6 : undefined} value={value} onChange={event => setValue(method === 'totp' ? event.target.value.replace(/\D/g, '') : event.target.value)} required disabled={loading} />
                </FormField>
                <Button type="submit" loading={loading} disabled={!value || (method === 'totp' && value.length !== 6)}>{t('mfa.verify')}</Button>
            </form>}
        </>}
    </SecurityPanel>
}
