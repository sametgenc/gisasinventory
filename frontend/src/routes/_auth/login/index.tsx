import React, { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAuth } from '@/auth/context'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { LogIn, Loader2, AlertCircle, Fingerprint, Mail } from 'lucide-react'
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
    const { login, config, user, loginWithPasskey, redirectToProvider } = useAuth()
    const navigate = useNavigate()
    const search = Route.useSearch()
    const { t } = useTranslation()
    const [formData, setFormData] = useState({ email: '', password: '' })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePosition({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };

    const handleSuccessRedirect = () => {
        const target = (search.redirect && search.redirect !== '/login') ? search.redirect : '/dashboard'
        navigate({ to: target })
    }

    const handleWebAuthnLogin = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await loginWithPasskey()
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
        }
    }

    React.useEffect(() => {
        if (user) {
            handleSuccessRedirect()
        }
    }, [user])

    const { pendingFlow } = useAuth()
    React.useEffect(() => {
        if (pendingFlow) {
            const nextStep = pathForPendingFlow({ data: { flows: [pendingFlow] } } as any)
            if (nextStep) {
                navigate({ to: nextStep })
            }
        }
    }, [pendingFlow, navigate])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const res = await login(formData)
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
        }
    }

    const handleSocialLogin = (provider: any) => {
        const target = (search.redirect && search.redirect !== '/login') ? search.redirect : '/dashboard'
        redirectToProvider(provider.id, target)
    }

    const providers = config?.socialaccount?.providers || []
    const webAuthnEnabled = config?.mfa?.supported_types?.includes('webauthn')

    return (
        <div className="flex-1 flex w-full min-h-0 items-center justify-center p-4">
            <div
                className="max-w-md w-full relative group"
                onMouseMove={handleMouseMove}
            >
                <div className="relative bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-all duration-200 overflow-hidden">

                    {/* Spotlight Effect */}
                    <div
                        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
                        style={{
                            background: `radial-gradient(500px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(99,102,241,0.04), transparent 40%)`
                        }}
                    />

                    <div className="relative z-20">
                        <div className="text-center mb-8">
                            <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-4 mx-auto">
                                <LogIn size={28} />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('login.welcomeBack')}</h2>
                            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{t('login.signInSubtitle')}</p>
                        </div>

                        {error && (
                            <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2 text-sm">
                                <AlertCircle size={16} />
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('login.emailLabel')}</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white text-sm"
                                    placeholder={t('login.emailPlaceholder')}
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.passwordLabel')}</label>
                                    <Link to="/auth/password/request" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                                        {t('login.forgotPassword')}
                                    </Link>
                                </div>
                                <input
                                    type="password"
                                    required
                                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white text-sm"
                                    placeholder={t('login.passwordPlaceholder')}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-indigo-500/20 text-sm active:scale-[0.98]"
                            >
                                {loading ? <Loader2 className="animate-spin" size={18} /> : t('login.signIn')}
                            </button>

                            {/* Alternative Auth */}
                            <div className="flex justify-center gap-3 pt-1">
                                <Link
                                    to="/login/code"
                                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-slate-200 dark:border-slate-700 transition-all"
                                    title={t('login.mailCode')}
                                >
                                    <Mail size={20} />
                                </Link>

                                {webAuthnEnabled && (
                                    <button
                                        type="button"
                                        disabled={loading}
                                        onClick={handleWebAuthnLogin}
                                        className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50"
                                        title={t('login.passkey')}
                                    >
                                        {loading ? (
                                            <Loader2 className="animate-spin" size={20} />
                                        ) : (
                                            <Fingerprint size={20} />
                                        )}
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
                                                onClick={() => handleSocialLogin(provider)}
                                                className="w-full inline-flex justify-center py-2.5 px-4 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all items-center gap-2 active:scale-[0.98]"
                                            >
                                                {provider.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </form>

                        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {t('login.noAccount')}{' '}
                                <Link to="/register" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                                    {t('login.createOne')}
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
