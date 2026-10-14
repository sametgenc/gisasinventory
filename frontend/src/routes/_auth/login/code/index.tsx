import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Loader2, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react'
import { useAuth } from '@/auth/context'
import { FormField, formControlClass } from '@/components/ui'
import { LoginCodeLayout, loginCodeBackLinkClass, loginCodeErrorClass, loginCodeSubmitClass } from '@/components/LoginCodeLayout'

export const Route = createFileRoute('/_auth/login/code/')({
    component: RequestLoginCodeComponent,
})

function RequestLoginCodeComponent() {
    const { requestLoginCode, user } = useAuth()
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const submitting = useRef(false)

    useEffect(() => {
        if (user) void navigate({ to: '/dashboard' })
    }, [user, navigate])

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()
        if (submitting.current) return
        submitting.current = true
        setLoading(true)
        setError(null)
        const address = email.trim()
        try {
            const res = await requestLoginCode(address)
            // Allauth returns 401 while code verification is pending.
            const codePending = res.data?.flows?.some(flow => flow.id === 'login_by_code' && flow.is_pending)
            if (res.status === 200 || (res.status === 401 && codePending)) {
                await navigate({ to: '/login/code/confirm', search: { email: address } })
            } else {
                const rateLimited = res.status === 429 || res.errors?.some(error => error.code === 'too_many_login_attempts')
                setError(t(rateLimited ? 'loginCodeRequest.rateLimited' : 'loginCodeRequest.requestFailed'))
            }
        } catch {
            setError(t('loginCodeRequest.connectionError'))
        } finally {
            submitting.current = false
            setLoading(false)
        }
    }

    return (
        <LoginCodeLayout
            step={1}
            title={t('loginCodeRequest.title')}
            description={t('loginCodeRequest.description')}
            backLink={<Link to="/login" search={{ redirect: undefined }} className={loginCodeBackLinkClass}><ArrowLeft size={16} aria-hidden />{t('loginCodeRequest.backToLogin')}</Link>}
        >
            {error && <div id="login-code-error" role="alert" className={loginCodeErrorClass}><AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden /><span>{error}</span></div>}
            <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading}>
                <FormField htmlFor="login-code-email" label={t('login.emailLabel')} help={t('loginCodeRequest.emailHint')}>
                    <input
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        spellCheck={false}
                        disabled={loading}
                        className={`${formControlClass} min-h-11`}
                        placeholder={t('loginCodeRequest.emailPlaceholder')}
                        value={email}
                        onChange={event => { setEmail(event.target.value); setError(null) }}
                    />
                </FormField>
                <button type="submit" disabled={loading} className={loginCodeSubmitClass}>
                    {loading && <Loader2 className="animate-spin motion-reduce:animate-none" size={18} aria-hidden />}
                    {loading ? t('loginCodeRequest.sending') : t('loginCodeRequest.sendCode')}
                    {!loading && <ArrowRight size={16} aria-hidden />}
                </button>
            </form>
        </LoginCodeLayout>
    )
}
