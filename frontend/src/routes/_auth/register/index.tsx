import React, { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAuth } from '@/auth/context'
import { UserPlus, Loader2, AlertCircle, Fingerprint } from 'lucide-react'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_auth/register/')({
    component: RegisterComponent,
})

function RegisterComponent() {
    const { register, user, config, redirectToProvider } = useAuth()
    const navigate = useNavigate()
    const { t } = useTranslation()
    const [formData, setFormData] = useState({ username: '', email: '', password1: '', password2: '' })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    React.useEffect(() => {
        if (user) {
            navigate({ to: '/dashboard' })
        }
    }, [user, navigate])

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
            const res = await register({
                username: formData.username,
                email: formData.email,
                password: formData.password1,
            })
            if (res.status === 200) {
                navigate({ to: '/dashboard' })
            } else {
                const pendingPath = pathForPendingFlow(res)
                if (pendingPath) {
                    navigate({ to: pendingPath })
                } else if (res.errors && res.errors.length > 0) {
                    throw new Error(res.errors[0].message)
                }
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSocialLogin = (provider: any) => {
        redirectToProvider(provider.id, '/dashboard', 'login')
    }

    const providers = config?.socialaccount?.providers || []

    return (
        <div className="flex-1 flex w-full min-h-0 items-center justify-center p-4">
            <div className="max-w-md w-full">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
                    <div className="text-center mb-8">
                        <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-4 mx-auto">
                            <UserPlus size={28} />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('register.createAccount')}</h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{t('register.getStarted')}</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2 text-sm">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('register.usernameLabel')}</label>
                            <input
                                type="text"
                                required
                                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white text-sm"
                                placeholder={t('register.usernamePlaceholder')}
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('register.emailLabel')}</label>
                            <input
                                type="email"
                                required
                                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white text-sm"
                                placeholder={t('register.emailPlaceholder')}
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('register.passwordLabel')}</label>
                            <input
                                type="password"
                                required
                                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white text-sm"
                                placeholder={t('register.passwordPlaceholder')}
                                value={formData.password1}
                                onChange={(e) => setFormData({ ...formData, password1: e.target.value, password2: e.target.value })}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-indigo-500/20 text-sm active:scale-[0.98]"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : t('register.submit')}
                        </button>

                        {/* Social Login */}
                        {providers.length > 0 && (
                            <div className="mt-4 space-y-3">
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                                    </div>
                                    <div className="relative flex justify-center text-xs">
                                        <span className="px-3 bg-white dark:bg-slate-900 text-slate-400">{t('register.orSignUpWith')}</span>
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

                        {config?.mfa?.supported_types?.includes('webauthn') && (
                            <div className="flex justify-center pt-1">
                                <Link
                                    to="/register/passkey"
                                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-slate-200 dark:border-slate-700 transition-all"
                                    title={t('register.passkey')}
                                >
                                    <Fingerprint size={20} />
                                </Link>
                            </div>
                        )}
                    </form>

                    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('register.haveAccount')}{' '}
                            <Link to="/login" search={{ redirect: undefined }} className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                                {t('register.signIn')}
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
