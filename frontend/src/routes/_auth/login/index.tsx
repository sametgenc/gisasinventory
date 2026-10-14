import { useCaptcha } from '@/hooks/useCaptcha'
import React, { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAuth } from '@/auth/context'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { Loader2, AlertCircle, Fingerprint, Mail, Ship } from 'lucide-react'
import { formControlClass } from '@/components/ui'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_auth/login/')({
    validateSearch: (search: Record<string, unknown>) => {
        return {
            redirect: (search.redirect as string) || undefined,
        }
    },
    component: LoginComponent,
})

function LoginComponent() {
    const captcha = useCaptcha()
    const { login, config, user, loginWithPasskey, redirectToProvider } = useAuth()
    const navigate = useNavigate()
    const search = Route.useSearch()
    const { t } = useTranslation()
    const [formData, setFormData] = useState({ email: '', password: '' })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSuccessRedirect = () => {
        const target = (search.redirect && search.redirect !== '/login') ? search.redirect : '/dashboard'
        navigate({ to: target })
    }

    const handleWebAuthnLogin = async () => {
        if (!captcha.ready || loading) return
        setLoading(true)
        setError(null)
        try {
            const res = await loginWithPasskey(captcha.token)
            if (res.status === 200) {
                const nextStep = pathForPendingFlow(res)
                if (nextStep) {
                    navigate({ to: nextStep })
                } else {
                    handleSuccessRedirect()
                }
            } else if (res.status === 401) {
                const nextStep = pathForPendingFlow(res)
                if (nextStep) {
                    navigate({ to: nextStep })
                } else {
                    setError(res.errors?.[0]?.message || t('login.loginFailed'))
                }
            } else {
                setError(res.errors?.[0]?.message || t('login.loginFailed'))
            }
        } catch (err: any) {
            if (err.name === 'NotAllowedError' || err.message?.includes('not allowed')) {
                return
            }
            setError(err.message || t('login.unexpectedError'))
        } finally {
            setLoading(false)
            captcha.reset()
        }
    }

    React.useEffect(() => {
        if (user) {
            handleSuccessRedirect()
        }
    }, [user])

    const { pendingFlow } = useAuth()
    React.useEffect(() => {
        // A pending email code must still allow choosing password sign-in.
        if (pendingFlow && pendingFlow.id !== 'login_by_code') {
            const nextStep = pathForPendingFlow({ data: { flows: [pendingFlow] } } as any)
            if (nextStep) {
                navigate({ to: nextStep })
            }
        }
    }, [pendingFlow, navigate])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!captcha.ready) return
        setLoading(true)
        setError(null)
        try {
            const res = await login({ ...formData, captcha_token: captcha.token })
            if (res.status === 200) {
                const nextStep = pathForPendingFlow(res)
                if (nextStep) {
                    navigate({ to: nextStep })
                } else {
                    handleSuccessRedirect()
                }
            } else if (res.status === 401) {
                const nextStep = pathForPendingFlow(res)
                if (nextStep) {
                    navigate({ to: nextStep })
                } else {
                    setError(res.errors?.[0]?.message || t('login.loginFailed'))
                }
            } else {
                setError(res.errors?.[0]?.message || t('login.loginFailed'))
            }
        } catch (err: any) {
            setError(err.message || t('login.unexpectedError'))
        } finally {
            setLoading(false)
            captcha.reset()
        }
    }

    const handleSocialLogin = (provider: any) => {
        if (!captcha.ready || loading) return
        const target = (search.redirect && search.redirect !== '/login') ? search.redirect : '/dashboard'
        redirectToProvider(provider.id, target, 'login', captcha.token)
    }

    const providers = config?.socialaccount?.providers || []
    const webAuthnEnabled = config?.mfa?.supported_types?.includes('webauthn')

    return (
        <div className="flex min-h-0 w-full flex-1 items-center justify-center py-6 sm:py-10">
            <div className="grid w-full max-w-4xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[1fr_1.1fr]">
                <aside className="border-b border-slate-200 bg-slate-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-950 sm:px-8 md:border-b-0 md:border-r md:py-10">
                    <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300"><Ship size={18} aria-hidden />{t('home.badge')}</p>
                    <h1 className="mt-7 hidden text-2xl font-semibold leading-snug tracking-tight text-slate-900 dark:text-white md:block">{t('home.titlePrefix')} {t('home.titleHighlight')}</h1>
                    <p className="mt-4 hidden text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:block">{t('home.subtitleLead')}</p>
                </aside>
                <div className="px-6 py-8 sm:px-8 md:py-10">
                    <div>
                        <div className="mb-7">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{t('login.welcomeBack')}</h2>
                            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t('login.signInSubtitle')}</p>
                        </div>

                        {error && (
                            <div role="alert" className="mb-6 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                                <AlertCircle size={16} />
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
                            <div>
                                <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('login.emailLabel')}</label>
                                <input
                                    id="login-email"
                                    type="email"
                                    autoComplete="username"
                                    required
                                    className={formControlClass}
                                    placeholder={t('login.emailPlaceholder')}
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.passwordLabel')}</label>
                                    <Link to="/auth/password/request" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                                        {t('login.forgotPassword')}
                                    </Link>
                                </div>
                                <input
                                    id="login-password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    className={formControlClass}
                                    placeholder={t('login.passwordPlaceholder')}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>

                            {captcha.widget}
                            <button
                                type="submit"
                                disabled={loading || !captcha.ready}
                                className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="animate-spin" size={18} /> : t('login.signIn')}
                            </button>

                            {/* Alternative Auth */}
                            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-5 dark:border-slate-700">
                                <Link
                                    to="/login/code"
                                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                    title={t('login.mailCode')}
                                >
                                    <Mail size={16} aria-hidden />{t('login.mailCode')}
                                </Link>

                                {webAuthnEnabled && (
                                    <button
                                        type="button"
                                        disabled={loading || !captcha.ready}
                                        onClick={handleWebAuthnLogin}
                                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                        title={t('login.passkey')}
                                    >
                                        {loading ? (
                                            <Loader2 className="animate-spin" size={20} />
                                        ) : (
                                            <Fingerprint size={16} aria-hidden />
                                        )}
                                        {t('login.passkey')}
                                    </button>
                                )}
                            </div>

                            {/* Social Login */}
                            {providers.length > 0 && (
                                <div className="mt-4 space-y-3">
                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                                        </div>
                                        <div className="relative flex justify-center text-xs">
                                            <span className="px-3 bg-white dark:bg-slate-900 text-slate-400">{t('login.orContinueWith')}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {providers.map((provider) => (
                                            <button
                                                key={provider.id}
                                                type="button"
                                                disabled={loading || !captcha.ready}
                                                onClick={() => handleSocialLogin(provider)}
                                                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                            >
                                                {provider.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </form>

                    </div>
                </div>
            </div>
        </div>
    )
}
