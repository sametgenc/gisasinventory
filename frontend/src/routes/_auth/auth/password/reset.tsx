import React, { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { OtpInput } from '@/components/ui/OtpInput'

export const Route = createFileRoute('/_auth/auth/password/reset')({
    component: ResetPasswordCode,
})

const CODE_LENGTH = 6

function ResetPasswordCode() {
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
            setSubmitError(`Code must be ${CODE_LENGTH} characters`)
            return
        }
        if (password.length < 8) {
            setSubmitError('Password must be at least 8 characters')
            return
        }

        setLoading(true)
        try {
            const res = await ALLAUTH_API.resetPassword({ key: code, password })
            if (res.status === 200 || res.status === 401) {
                navigate({ to: '/login', search: { redirect: undefined } })
                return
            }
            setSubmitError(res.errors?.[0]?.message || 'Invalid code or password')
        } catch (err: any) {
            setSubmitError(err.message || 'Unexpected error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50/50 dark:bg-gray-950 transition-colors">
            <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 animate-in fade-in zoom-in duration-300">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center mb-6 mx-auto">
                        <KeyRound size={40} />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Reset Password</h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-3 text-base">
                        Enter the {CODE_LENGTH}-digit code sent to your email and your new password.
                    </p>
                </div>

                {submitError && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-2xl text-sm font-medium animate-in slide-in-from-top-2">
                        {submitError}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 text-center">Reset Code</label>
                        <OtpInput value={code} onChange={setCode} length={CODE_LENGTH} disabled={loading} />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">New Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength={8}
                                className="w-full px-5 py-4 pr-12 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600 font-medium"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 ml-1">At least 8 characters</p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || code.length !== CODE_LENGTH || password.length < 8}
                        className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : 'Set New Password'}
                    </button>

                    <div className="text-center pt-2">
                        <Link
                            to="/auth/password/request"
                            className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                            Resend code
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    )
}
