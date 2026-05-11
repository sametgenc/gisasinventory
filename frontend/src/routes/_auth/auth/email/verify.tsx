import React, { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { useAuth } from '@/auth/context'
import { MailCheck, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { OtpInput } from '@/components/ui/OtpInput'

export const Route = createFileRoute('/_auth/auth/email/verify')({
    component: VerifyEmail,
})

const CODE_LENGTH = 6

function VerifyEmail() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { updateFromResponse, config } = useAuth()
    const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
    const [error, setError] = useState<string | null>(null)
    const [code, setCode] = useState('')
    const [verifyingCode, setVerifyingCode] = useState(false)

    const showCodeInput = config?.account?.email_verification_by_code_enabled ?? true

    const handleVerifyCode = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (code.length !== CODE_LENGTH) {
            setError(t('emailVerify.codeLengthError', { length: CODE_LENGTH }))
            return
        }
        setVerifyingCode(true)
        setError(null)
        try {
            const res = await ALLAUTH_API.verifyEmailByCode(code)
            updateFromResponse(res)
            const nextPath = pathForPendingFlow(res)
            if (nextPath) {
                navigate({ to: nextPath })
                return
            }
            if (res.status === 200) {
                setStatus('success')
            } else {
                setError(res.errors?.[0]?.message || t('emailVerify.errorMessage'))
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setVerifyingCode(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-sm bg-white dark:bg-gray-900 p-7 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800">
                {status === 'verifying' && (
                    <>
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-4 mx-auto">
                                <MailCheck size={22} />
                            </div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('emailVerify.title')}</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                                {showCodeInput
                                    ? t('emailVerify.subtitleCode', { length: CODE_LENGTH })
                                    : t('emailVerify.subtitleLink')}
                            </p>
                        </div>

                        {error && (
                            <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium">
                                {error}
                            </div>
                        )}

                        {showCodeInput ? (
                            <form onSubmit={handleVerifyCode} className="space-y-5">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 text-center uppercase tracking-wide">
                                        {t('emailVerify.codeLabel')}
                                    </label>
                                    <OtpInput
                                        value={code}
                                        onChange={setCode}
                                        length={CODE_LENGTH}
                                        disabled={verifyingCode}
                                        onComplete={() => handleVerifyCode()}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={verifyingCode || code.length !== CODE_LENGTH}
                                    className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {verifyingCode ? <Loader2 className="animate-spin" size={16} /> : t('emailVerify.submit')}
                                </button>
                            </form>
                        ) : (
                            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/10 rounded-lg text-indigo-800 dark:text-indigo-300 text-xs text-center">
                                {t('emailVerify.refreshHint')}
                            </div>
                        )}
                    </>
                )}

                {status === 'success' && (
                    <div className="text-center">
                        <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center mb-4 mx-auto">
                            <CheckCircle2 size={22} />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('emailVerify.successTitle')}</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('emailVerify.successMessage')}</p>
                        <Link
                            to="/login"
                            search={{ redirect: undefined }}
                            className="inline-block w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-all"
                        >
                            {t('emailVerify.continueToLogin')}
                        </Link>
                    </div>
                )}

                {status === 'error' && (
                    <div className="text-center">
                        <div className="w-12 h-12 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl flex items-center justify-center mb-4 mx-auto">
                            <AlertTriangle size={22} />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('emailVerify.errorTitle')}</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{error || t('emailVerify.errorMessage')}</p>
                        <Link
                            to="/auth/email/verify"
                            className="inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                            {t('emailVerify.tryAgain')}
                        </Link>
                    </div>
                )}
            </div>
        </div>
    )
}
