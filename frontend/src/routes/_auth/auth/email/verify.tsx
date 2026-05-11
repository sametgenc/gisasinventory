import React, { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { pathForPendingFlow } from '@/modules/allauth/routing'
import { useAuth } from '@/auth/context'
import { MailCheck, Loader2 } from 'lucide-react'
import { OtpInput } from '@/components/ui/OtpInput'

export const Route = createFileRoute('/_auth/auth/email/verify')({
    component: VerifyEmail,
})

const CODE_LENGTH = 6

function VerifyEmail() {
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
            setError(`Code must be ${CODE_LENGTH} characters`)
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
                setError(res.errors?.[0]?.message || 'Verification failed')
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setVerifyingCode(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50 dark:bg-gray-950 transition-colors">
            <div className="max-w-md w-full">
                <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 text-center transition-colors">
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                        <MailCheck size={32} />
                    </div>

                    {status === 'verifying' && (
                        <>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Verify Your Email</h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-8 text-sm">
                                {showCodeInput
                                    ? `Enter the ${CODE_LENGTH}-digit code sent to your email.`
                                    : 'Check your inbox and click the verification link.'}
                            </p>

                            {error && (
                                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm italic">
                                    {error}
                                </div>
                            )}

                            {showCodeInput ? (
                                <form onSubmit={handleVerifyCode} className="space-y-6">
                                    <OtpInput
                                        value={code}
                                        onChange={setCode}
                                        length={CODE_LENGTH}
                                        disabled={verifyingCode}
                                        onComplete={() => handleVerifyCode()}
                                    />
                                    <button
                                        type="submit"
                                        disabled={verifyingCode || code.length !== CODE_LENGTH}
                                        className="w-full py-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50"
                                    >
                                        {verifyingCode ? <Loader2 className="animate-spin" size={20} /> : 'Verify Code'}
                                    </button>
                                </form>
                            ) : (
                                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl text-indigo-800 dark:text-indigo-300 text-sm">
                                    Refresh this page after checking your email.
                                </div>
                            )}
                        </>
                    )}

                    {status === 'success' && (
                        <>
                            <h2 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-4">Email Verified!</h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-8">
                                Your email address has been verified.
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
                                {error || 'Invalid or expired code.'}
                            </p>
                            <Link
                                to="/auth/email/verify"
                                className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                            >
                                Try again
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
