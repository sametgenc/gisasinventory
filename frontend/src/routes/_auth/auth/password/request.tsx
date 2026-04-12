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
    const navigate = useNavigate()
    const { config } = useAuth()
    const { t } = useTranslation()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

    const byCode = Boolean(config?.account?.password_reset_by_code_enabled)

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setMousePosition({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const res = await ALLAUTH_API.requestPasswordReset(email)
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
        }
    }

    return (
        <div className="flex-1 flex w-full min-h-0 items-center justify-center p-4">
            <div className="max-w-md w-full relative group" onMouseMove={handleMouseMove}>
                <div className="relative bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-all duration-200 overflow-hidden">
                    <div
                        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
                        style={{
                            background: `radial-gradient(500px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(99,102,241,0.04), transparent 40%)`,
                        }}
                    />

                    <div className="relative z-20">
                        {success ? (
                            <>
                                <div className="text-center mb-8">
                                    <div className="w-14 h-14 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center mb-4 mx-auto">
                                        <CheckCircle2 size={28} />
                                    </div>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
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
                                    className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-sm shadow-indigo-500/20 text-sm active:scale-[0.98]"
                                >
                                    <ArrowLeft size={18} />
                                    {t('passwordRequest.backToLogin')}
                                </Link>
                            </>
                        ) : (
                            <>
                                <div className="text-center mb-8">
                                    <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-4 mx-auto">
                                        <Mail size={28} />
                                    </div>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
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
                                            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white text-sm"
                                            placeholder={t('login.emailPlaceholder')}
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-indigo-500/20 text-sm active:scale-[0.98]"
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
                                        className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
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
