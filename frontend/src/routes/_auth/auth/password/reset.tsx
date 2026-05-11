import React, { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { OtpInput } from '@/components/ui/OtpInput'

export const Route = createFileRoute('/_auth/auth/password/reset')({
    component: ResetPasswordCode,
})

const CODE_LENGTH = 6

function ResetPasswordCode() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [code, setCode] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitError(null)

        if (code.length !== CODE_LENGTH) {
            setSubmitError(t('passwordReset.codeLengthError', { length: CODE_LENGTH }))
            return
        }
        if (password.length < 8) {
            setSubmitError(t('passwordReset.passwordTooShort'))
            return
        }

        setLoading(true)
        try {
            const res = await ALLAUTH_API.resetPassword({ key: code, password })
            if (res.status === 200 || res.status === 401) {
                navigate({ to: '/login', search: { redirect: undefined } })
                return
            }
            setSubmitError(res.errors?.[0]?.message || t('passwordReset.invalidCredentials'))
        } catch (err: any) {
            setSubmitError(err.message || t('login.unexpectedError'))
        } finally {
            setLoading(false)
        }
    }

    const submitDisabled = loading || code.length !== CODE_LENGTH || password.length < 8

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-7">
                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-4 mx-auto">
                        <KeyRound size={22} />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('passwordReset.title')}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                        {t('passwordReset.subtitle', { length: CODE_LENGTH })}
                    </p>
                </div>

                {submitError && (
                    <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium">
                        {submitError}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 text-center uppercase tracking-wide">
                            {t('passwordReset.codeLabel')}
                        </label>
                        <OtpInput value={code} onChange={setCode} length={CODE_LENGTH} disabled={loading} />
                    </div>

                    <div>
                        <label htmlFor="new-password" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                            {t('passwordReset.newPasswordLabel')}
                        </label>
                        <div className="relative">
                            <input
                                id="new-password"
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength={8}
                                className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600"
                                placeholder={t('passwordReset.newPasswordPlaceholder')}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                aria-label={showPassword ? t('passwordReset.hidePassword') : t('passwordReset.showPassword')}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitDisabled}
                        className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={16} /> : t('passwordReset.submit')}
                    </button>

                    <div className="text-center">
                        <Link
                            to="/auth/password/request"
                            className="text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                            {t('passwordReset.resending')}
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    )
}
