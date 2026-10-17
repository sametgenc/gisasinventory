import { useCaptcha } from '@/hooks/useCaptcha'
import React, { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { accountErrorKey } from '@/modules/allauth/account-errors'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { Lock, Loader2, AlertTriangle } from 'lucide-react'

export const Route = createFileRoute('/_auth/auth/password/confirm/$key')({
    component: ConfirmResetPassword,
    loader: async ({ params: { key } }) => {
        if (!key) return { isValid: false, key: null }
        try {
            const res = await ALLAUTH_API.validatePasswordResetKey(key)
            if (res.status === 200) {
                return { isValid: true, key }
            }
            return { isValid: false, errorKey: 'account.passwordLink.invalidDescription', key }
        } catch {
            return { isValid: false, errorKey: 'account.passwordLink.loadFailed', key }
        }
    }
})

function ConfirmResetPassword() {
    const { t } = useTranslation()
    const captcha = useCaptcha()
    const { isValid, key, errorKey } = Route.useLoaderData()
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    if (!isValid || !key) {
        return (
            <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50/50 dark:bg-gray-950 transition-colors">
                <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 text-center">
                    <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-3xl flex items-center justify-center mb-6 mx-auto">
                        <AlertTriangle size={40} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{t('account.passwordLink.invalidTitle')}</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
                        {t(errorKey || 'account.passwordLink.invalidDescription')}
                    </p>
                    <Link to="/auth/password/request" className="inline-flex items-center justify-center px-8 py-4 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg hover:shadow-xl">
                        {t('account.passwordLink.newLink')}
                    </Link>
                </div>
            </div>
        )
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!captcha.ready) return
        setLoading(true)
        setSubmitError(null)
        try {
            const res = await ALLAUTH_API.resetPassword({ key, password }, captcha.token)
            if (res.status === 200 || res.status === 401) {
                navigate({ to: '/login', search: { redirect: undefined } })
            } else {
                setSubmitError(t(accountErrorKey(res, 'account.passwordLink.failed')))
            }
        } catch (err: unknown) {
            setSubmitError(t(accountErrorKey(err, 'account.errors.connection')))
        } finally {
            setLoading(false)
            captcha.reset()
        }
    }

    return (
        <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50/50 dark:bg-gray-950 transition-colors">
            <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 animate-in fade-in zoom-in duration-300">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center mb-6 mx-auto transform rotate-3 hover:rotate-6 transition-transform">
                        <Lock size={40} />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">{t('account.passwordLink.title')}</h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-3 text-lg">{t('account.passwordLink.description')}</p>
                </div>

                {submitError && (
                    <div role="alert" className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-2xl text-sm font-medium animate-in slide-in-from-top-2">
                        {submitError}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="reset-link-password" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">{t('account.password.new')}</label>
                        <input
                            id="reset-link-password"
                            type="password"
                            autoComplete="new-password"
                            required
                            className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600 font-medium"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 ml-1">{t('passwordReset.newPasswordPlaceholder')}</p>
                    </div>
                    {captcha.widget}
                    <button
                        type="submit"
                        disabled={loading || !captcha.ready}
                        className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-700 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : t('account.passwordLink.submit')}
                    </button>
                </form>
            </div>
        </div>
    )
}
