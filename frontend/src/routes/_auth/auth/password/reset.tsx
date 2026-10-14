import { useRef, useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { SecurityError, SecurityPanel } from '@/modules/allauth/mfa/SecurityPanel'
import { Button, FormField, formControlClass } from '@/components/ui'
import { OtpInput } from '@/components/ui/OtpInput'

export const Route = createFileRoute('/_auth/auth/password/reset')({ component: ResetPasswordCode })
const CODE_LENGTH = 8

function ResetPasswordCode() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [code, setCode] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [inactive, setInactive] = useState(false)
    const busy = useRef(false)

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (busy.current || inactive) return
        if (code.length !== CODE_LENGTH) { setError(t('passwordReset.codeLengthError', { length: CODE_LENGTH })); return }
        if (password.length < 8) { setError(t('passwordReset.passwordTooShort')); return }
        busy.current = true
        setLoading(true)
        setError(null)
        try {
            const res = await ALLAUTH_API.resetPassword({ key: code, password })
            const hasErrors = Boolean(res.errors?.length)
            const resetFlow = res.data?.flows?.find(flow => flow.id === 'password_reset_by_code')
            // Allauth reports successful unauthenticated resets as 401 after explicitly completing this flow.
            const completedReset = res.status === 401 && res.meta?.is_authenticated === false && resetFlow?.is_pending === false
            if (!hasErrors && (res.status === 200 || completedReset)) {
                const next = pathForPendingFlow(res)
                if (next && next !== '/auth/password/reset') await navigate({ to: next })
                else await navigate({ to: '/login', search: { redirect: undefined } })
            } else if (res.status === 409 || res.status === 410) {
                setInactive(true)
                setError(t('passwordReset.inactiveRequest'))
            } else {
                setError(t(res.status === 429 ? 'passwordReset.rateLimit' : res.errors?.some(item => item.param === 'password') ? 'passwordReset.passwordRejected' : 'passwordReset.invalidCredentials'))
            }
        } catch { setError(t('passwordReset.connectionError')) }
        finally { busy.current = false; setLoading(false) }
    }

    return <SecurityPanel title={t('passwordReset.title')} description={t('passwordReset.subtitle', { length: CODE_LENGTH })}>
        {error && <SecurityError>{error}</SecurityError>}
        <form onSubmit={submit} className="space-y-5" aria-busy={loading}>
            <div>
                <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">{t('passwordReset.codeLabel')}</p>
                <OtpInput value={code} onChange={value => { setCode(value); setError(null) }} length={CODE_LENGTH} disabled={loading || inactive} label={t('passwordReset.codeLabel')} getCellLabel={position => t('passwordReset.characterLabel', { position })} />
            </div>
            <div className="relative">
                <FormField htmlFor="new-password" label={t('passwordReset.newPasswordLabel')} help={t('passwordReset.newPasswordPlaceholder')} required>
                    <input id="new-password" type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" className={`${formControlClass} pr-11`} value={password} onChange={event => setPassword(event.target.value)} disabled={loading || inactive} />
                </FormField>
                <button type="button" onClick={() => setShowPassword(!showPassword)} disabled={loading} className="absolute right-0 top-7 flex h-10 items-center px-3 text-slate-500 focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={t(showPassword ? 'passwordReset.hidePassword' : 'passwordReset.showPassword')} aria-pressed={showPassword}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
            <Button type="submit" className="w-full" loading={loading} disabled={inactive || code.length !== CODE_LENGTH || password.length < 8}>{t(loading ? 'passwordReset.submitting' : 'passwordReset.submit')}</Button>
            <Link to="/auth/password/request" onClick={event => { if (loading) event.preventDefault() }} aria-disabled={loading || undefined} className="inline-flex min-h-9 items-center text-sm font-medium text-blue-700 underline-offset-4 hover:underline dark:text-blue-300">{t('passwordReset.resending')}</Link>
        </form>
    </SecurityPanel>
}
