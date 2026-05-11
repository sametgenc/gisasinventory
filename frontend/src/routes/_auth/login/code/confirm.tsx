import React, { useState, useEffect } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/context'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { Loader2, AlertCircle, ShieldCheck, ArrowLeft } from 'lucide-react'
import { OtpInput } from '@/components/ui/OtpInput'

const CODE_LENGTH = 6

export const Route = createFileRoute('/_auth/login/code/confirm')({
    component: ConfirmLoginCodeComponent,
    validateSearch: (search: Record<string, unknown>) => ({
        email: search.email as string | undefined,
    }),
})

function ConfirmLoginCodeComponent() {
    const { t } = useTranslation()
    const { loginByCode, user } = useAuth()
    const navigate = useNavigate()
    const { email } = Route.useSearch()
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (user) navigate({ to: '/dashboard' })
    }, [user, navigate])

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (code.length !== CODE_LENGTH) {
            setError(t('loginCodeConfirm.codeLengthError', { length: CODE_LENGTH }))
            return
        }
        setLoading(true)
        setError(null)
        try {
            const res = await loginByCode(code)
            if (res.status == 200) {
                const nextStep = pathForPendingFlow(res)
                await navigate({ to: nextStep ?? '/dashboard', search: { redirect: undefined } } as any)
            } else if (res.status == 401) {
                const nextStep = pathForPendingFlow(res)
                if (nextStep) {
                    await navigate({ to: nextStep, search: { redirect: undefined } } as any)
                } else {
                    setError(res.errors?.[0]?.message || `Invalid code`)
                }
            } else {
                setError(res.errors?.[0]?.message || `Invalid code (${res.status})`)
            }
        } catch (err: any) {
            setError(err.message || t('login.unexpectedError'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-sm bg-white dark:bg-gray-900 p-7 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800">
                <Link
                    to="/login/code"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-5"
                >
                    <ArrowLeft size={14} />
                    {t('loginCodeConfirm.useDifferentEmail')}
                </Link>

                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-4 mx-auto">
                        <ShieldCheck size={22} />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('loginCodeConfirm.title')}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                        {t('loginCodeConfirm.subtitle', { length: CODE_LENGTH, email: email ?? '' })}
                    </p>
                </div>

                {error && (
                    <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2 text-xs font-medium">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 text-center uppercase tracking-wide">
                            {t('loginCodeConfirm.codeLabel')}
                        </label>
                        <OtpInput
                            value={code}
                            onChange={setCode}
                            length={CODE_LENGTH}
                            disabled={loading}
                            onComplete={() => handleSubmit()}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading || code.length !== CODE_LENGTH}
                        className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={16} /> : t('loginCodeConfirm.submit')}
                    </button>
                </form>
            </div>
        </div>
    )
}
