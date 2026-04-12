import React, { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { useAuth } from '@/auth/context'
import { MailCheck, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/_auth/auth/email/verify')({
    component: VerifyEmail,
})

function VerifyEmail() {
    const navigate = useNavigate()
    const { updateFromResponse, config } = useAuth()
    const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
    const [error, setError] = useState<string | null>(null)
    const [code, setCode] = useState('')
    const [verifyingCode, setVerifyingCode] = useState(false)

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault()
        setVerifyingCode(true)
        setError(null)
        try {
            const res = await ALLAUTH_API.verifyEmailByCode(code)
            console.log('[VerifyEmail] Response:', JSON.stringify(res, null, 2))

            // Update auth context with the response (stores pending flow)
            updateFromResponse(res)

            // Check for pending flows on any response
            const nextPath = pathForPendingFlow(res)
            console.log('[VerifyEmail] Next path:', nextPath)

            if (nextPath) {
                navigate({ to: nextPath })
                return
            }

            if (res.status === 200) {
                setStatus('success')
            } else {
                setError(res.errors?.[0]?.message || 'Verification failed')
            }
        } catch (err: any) {
            console.error('[VerifyEmail] Error:', err)
            setError(err.message)
        } finally {
            setVerifyingCode(false)
        }
    }

    const showCodeInput = config?.account?.email_verification_by_code_enabled ?? true

    return (
        <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50 dark:bg-gray-950 transition-colors">
            <div className="max-w-md w-full">
                <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 text-center transition-colors">
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                        <MailCheck size={32} />
                    </div>

                    {status === 'verifying' && (
                        <>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                                Verify Your Email
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-8">
                                {showCodeInput
                                    ? 'We\'ve sent a verification code to your email. Please enter it below.'
                                    : 'We have sent a verification email to you. Please check your inbox and click the link to verify your account.'
                                }
                            </p>

                            {error && (
                                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm italic">
                                    {error}
                                </div>
                            )}

                            {showCodeInput ? (
                                <form onSubmit={handleVerifyCode} className="space-y-6">
                                    <input
                                        type="text"
                                        required
                                        maxLength={6}
                                        placeholder="Enter 6-digit code"
                                        className="w-full px-4 py-4 rounded-xl border-2 border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 dark:focus:border-indigo-500 outline-none transition-all text-center text-3xl font-mono tracking-[0.5em] uppercase placeholder:text-gray-400 dark:placeholder:text-gray-600"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                                    />
                                    <button
                                        type="submit"
                                        disabled={verifyingCode || code.length < 4}
                                        className="w-full py-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50"
                                    >
                                        {verifyingCode ? <Loader2 className="animate-spin" size={20} /> : 'Verify Code'}
                                    </button>
                                </form>
                            ) : (
                                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl text-indigo-800 dark:text-indigo-300 text-sm">
                                    Refresh this page after checking your email if you aren't redirected automatically.
                                </div>
                            )}
                        </>
                    )}

                    {status === 'success' && (
                        <>
                            <h2 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-4">Email Verified!</h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-8">
                                Your email address has been successfully verified.
                            </p>
                            <Link
                                to="/login"
                                search={{ redirect: undefined }}
                                className="w-full block py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all"
                            >
                                Continue to Login
                            </Link>
                        </>
                    )}

                    {status === 'error' && (
                        <>
                            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">Verification Failed</h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-8">
                                {error || 'The verification link is invalid or has expired.'}
                            </p>
                            <Link
                                to="/auth/email/verify"
                                className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                            >
                                Contact Support
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
