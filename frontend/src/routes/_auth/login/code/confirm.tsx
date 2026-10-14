import { useState, useEffect, useRef, type FormEvent } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Loader2, AlertCircle, ArrowLeft, Mail } from 'lucide-react'
import { useAuth } from '@/auth/context'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { OtpInput } from '@/components/ui/OtpInput'
import { LoginCodeLayout, loginCodeBackLinkClass, loginCodeErrorClass, loginCodeSubmitClass } from '@/components/LoginCodeLayout'

const CODE_LENGTH = 6
const CONFIRM_PATH = '/login/code/confirm'

export const Route = createFileRoute('/_auth/login/code/confirm')({
    component: ConfirmLoginCodeComponent,
    validateSearch: (search: Record<string, unknown>) => {
        const email = typeof search.email === 'string' ? search.email.trim() : ''
        return { email: email.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(email) ? email : undefined }
    },
})

function ConfirmLoginCodeComponent() {
    const { t } = useTranslation()
    const { loginByCode, user } = useAuth()
    const navigate = useNavigate()
    const { email } = Route.useSearch()
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [inactive, setInactive] = useState(false)
    const submitting = useRef(false)

    useEffect(() => {
        if (user) void navigate({ to: '/dashboard' })
    }, [user, navigate])

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()
        if (submitting.current || inactive) return
        if (code.length !== CODE_LENGTH) {
            setError(t('loginCodeConfirm.codeLengthError', { length: CODE_LENGTH }))
            return
        }
        submitting.current = true
        setLoading(true)
        setError(null)
        try {
            const res = await loginByCode(code)
            const nextStep = pathForPendingFlow(res)
            if (res.status === 200) {
                await navigate({ to: nextStep ?? '/dashboard' })
            } else if (res.status === 401 && nextStep && nextStep !== CONFIRM_PATH) {
                await navigate({ to: nextStep })
            } else if (res.status === 409) {
                setInactive(true)
                setError(t('loginCodeConfirm.inactiveRequest'))
            } else {
                setError(t('loginCodeConfirm.invalidCode'))
            }
        } catch {
            setError(t('loginCodeConfirm.connectionError'))
        } finally {
            submitting.current = false
            setLoading(false)
        }
    }

    return (
        <LoginCodeLayout
            step={2}
            title={t('loginCodeConfirm.title')}
            description={t('loginCodeConfirm.instruction', { length: CODE_LENGTH })}
            backLink={<Link to="/login/code" className={loginCodeBackLinkClass}><ArrowLeft size={16} aria-hidden />{t('loginCodeConfirm.changeEmail')}</Link>}
        >
            {email ? <div className="mb-6 flex items-start gap-3 border-l-2 border-blue-500 bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
                <Mail size={17} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden />
                <div className="min-w-0"><p className="text-xs text-slate-500 dark:text-slate-400">{t('loginCodeConfirm.sentTo')}</p><p className="mt-1 break-all text-sm font-medium text-slate-900 dark:text-slate-100">{email}</p></div>
            </div> : <p className="mb-6 text-sm leading-6 text-slate-600 dark:text-slate-300">{t('loginCodeConfirm.missingEmail')}</p>}
            {error && <div id="login-code-error" role="alert" className={loginCodeErrorClass}>
                <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
                <div><p>{error}</p>{inactive && <Link to="/login/code" className="mt-2 inline-flex font-semibold underline underline-offset-4">{t('loginCodeConfirm.requestNewCode')}</Link>}</div>
            </div>}
            <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading}>
                <div>
                    <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">{t('loginCodeConfirm.codeLabel')}</p>
                    <OtpInput
                        value={code}
                        onChange={value => { setCode(value); setError(null) }}
                        length={CODE_LENGTH}
                        disabled={loading || inactive}
                        label={t('loginCodeConfirm.codeLabel')}
                        getCellLabel={position => t('loginCodeConfirm.digitLabel', { position })}
                    />
                </div>
                <button type="submit" disabled={loading || inactive || code.length !== CODE_LENGTH} className={loginCodeSubmitClass}>
                    {loading && <Loader2 className="animate-spin motion-reduce:animate-none" size={18} aria-hidden />}
                    {loading ? t('loginCodeConfirm.verifying') : t('loginCodeConfirm.submit')}
                </button>
                <p className="border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">{t('loginCodeConfirm.inboxHint')}</p>
            </form>
        </LoginCodeLayout>
    )
}
