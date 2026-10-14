import { useCaptcha } from '@/hooks/useCaptcha'
import React, { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { useAuth } from '@/auth/context'
import { Mail, Loader2, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_auth/auth/password/request')({
    component: RequestPasswordReset,
})

function RequestPasswordReset() {
    const captcha = useCaptcha()
    const navigate = useNavigate()
    const { config } = useAuth()
    const { t } = useTranslation()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const byCode = Boolean(config?.account?.password_reset_by_code_enabled)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!captcha.ready) return
        setLoading(true)
        setError(null)
        try {
            const res = await ALLAUTH_API.requestPasswordReset(email, captcha.token)
            if (res.status === 200) {
                setSuccess(true)
            } else if (res.status === 401) {
                const pendingPath = pathForPendingFlow(res)
                if (pendingPath) {
                    navigate({ to: pendingPath })
                } else {
                    setError(t('passwordRequest.authRequired'))
                }
            } else {
                setError(res.errors?.[0]?.message || t('passwordRequest.requestFailed'))
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('login.unexpectedError')
            setError(message)
        } finally {
            setLoading(false)
            captcha.reset()
        }
    }

    return (
        <div className="flex-1 flex w-full min-h-0 items-center justify-center p-4">
            <div className="max-w-md w-full">
                <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div>
                        {success ? (
                            <>
                                <div className="mb-6">
                                    <CheckCircle2 size={24} className="text-green-600 dark:text-green-400 mb-3" />
                                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                                        {t('passwordRequest.successTitle')}
                                    </h2>
                                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm leading-relaxed">
                                        {byCode
                                            ? t('passwordRequest.successPrefixCode')
                                            : t('passwordRequest.successPrefixLink')}
                                        <br />
                                        <span className="font-semibold text-slate-900 dark:text-white">{email}</span>
                                    </p>
                                </div>
                                <Link
                                    to="/login"
                                    search={{ redirect: undefined }}
                                    className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
                                >
                                    <ArrowLeft size={18} />
                                    {t('passwordRequest.backToLogin')}
                                </Link>
                            </>
                        ) : (
                            <>
                                <div className="mb-6">
                                    <Mail size={24} className="text-slate-500 dark:text-slate-400 mb-3" />
                                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                                        {t('passwordRequest.title')}
                                    </h2>
                                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                                        {byCode ? t('passwordRequest.subtitleCode') : t('passwordRequest.subtitleLink')}
                                    </p>
                                </div>

                                {error && (
                                    <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2 text-sm">
                                        <AlertCircle size={16} />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                            {t('login.emailLabel')}
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            className="w-full px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-colors dark:text-white text-sm"
                                            placeholder={t('login.emailPlaceholder')}
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </div>
                                    {captcha.widget}
                                    <button
                                        type="submit"
                                        disabled={loading || !captcha.ready}
                                        className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                    >
                                        {loading ? (
                                            <Loader2 className="animate-spin" size={18} />
                                        ) : byCode ? (
                                            t('passwordRequest.sendCode')
                                        ) : (
                                            t('passwordRequest.sendLink')
                                        )}
                                    </button>
                                </form>

                                <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
                                    <Link
                                        to="/login"
                                        search={{ redirect: undefined }}
                                        className="text-sm text-blue-600 dark:text-blue-300 font-medium hover:underline"
                                    >
                                        {t('passwordRequest.backToLogin')}
                                    </Link>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
