import { useTranslation } from 'react-i18next'
import { accountErrorKey } from '@/modules/allauth/account-errors'
import { useCaptcha } from '@/hooks/useCaptcha'
import React, { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAuth } from '@/auth/context'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { ShieldCheck, Loader2, AlertCircle, ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/_auth/register/passkey/')({
    component: RegisterByPasskeyComponent,
})

function RegisterByPasskeyComponent() {
    const { t } = useTranslation()
    const captcha = useCaptcha()
    const { signupWithPasskey, user, updateFromResponse } = useAuth()
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Redirect if already logged in
    React.useEffect(() => {
        if (user) {
            navigate({ to: '/dashboard' })
        }
    }, [user, navigate])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!captcha.ready) return
        setLoading(true)
        setError(null)
        try {
            const res = await signupWithPasskey(email, captcha.token)
            updateFromResponse(res)

            if (res.status === 200 || res.status === 401) {
                const nextStep = pathForPendingFlow(res)
                if (nextStep) {
                    navigate({ to: nextStep })
                } else {
                    // This shouldn't happen for passkey signup usually
                    navigate({ to: '/dashboard' })
                }
            } else {
                setError(t(accountErrorKey(res, 'account.providers.signupFailed')))
            }
        } catch (err: unknown) {
            setError(t(accountErrorKey(err, 'account.errors.connection')))
        } finally {
            setLoading(false)
            captcha.reset()
        }
    }

    return (
        <div className="max-w-md w-full mx-auto mt-20">
            <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 transition-colors">
                <div className="mb-8">
                    <Link
                        to="/register"
                        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6"
                    >
                        <ArrowLeft size={16} />
                        {t('account.passkeySignup.back')}
                    </Link>
                    <div className="text-center">
                        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                            <ShieldCheck size={32} />
                        </div>
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{t('account.passkeySignup.title')}</h2>
                        <p className="text-gray-500 dark:text-gray-400 mt-2">{t('account.passkeySignup.description')}</p>
                    </div>
                </div>

                {error && (
                    <div role="alert" className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3 text-sm animate-shake">
                        <AlertCircle size={18} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="passkey-signup-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 text-center">
                            {t('account.passkeySignup.email')}
                        </label>
                        <input
                            id="passkey-signup-email"
                            type="email"
                            required
                            className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center text-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            placeholder={t('login.emailPlaceholder')}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    {captcha.widget}
                    <button
                        type="submit"
                        disabled={loading || !captcha.ready}
                        className="w-full py-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg shadow-lg shadow-indigo-100 dark:shadow-none"
                    >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : t('account.passkeySignup.continue')}
                    </button>

                    <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-4 leading-relaxed">
                        {t('account.passkeySignup.hint')}
                    </p>
                </form>
            </div>
        </div>
    )
}
