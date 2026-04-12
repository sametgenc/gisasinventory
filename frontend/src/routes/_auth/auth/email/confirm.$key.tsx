import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { useAuth } from '@/auth/context'
import { MailCheck, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/_auth/auth/email/confirm/$key')({
    component: ConfirmEmail,
    loader: async ({ params: { key } }) => {
        try {
            const verification = await ALLAUTH_API.getEmailVerification(key)
            return { key, verification }
        } catch (e) {
            console.error(e)
            return { key, verification: null, error: e }
        }
    },
})

function ConfirmEmail() {
    const { key, verification, error: loadError } = Route.useLoaderData()
    const navigate = useNavigate()
    const { updateFromResponse } = useAuth()
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Handle immediate redirect if already authenticated or invalid status
    if (verification?.status === 200 || verification?.status === 401) {
        // Continue to render, logic is inside body
    }

    const handleConfirm = async () => {
        setSubmitting(true)
        setError(null)
        try {
            const res = await ALLAUTH_API.verifyEmail(key)
            updateFromResponse(res)
            if (res.status === 200) {
                navigate({ to: '/dashboard' })
            } else if (res.status === 401) {
                // Verification successful but user not logged in
                navigate({ to: '/login', search: { redirect: undefined } })
            } else {
                setError(res.errors?.[0]?.message || 'Verification failed')
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    let body = null
    if (loadError || !verification) {
        body = (
            <div className="text-red-500">
                <h3 className="text-xl font-bold mb-2">Error Loading Verification</h3>
                <p>Unable to load verification details. The link may be invalid.</p>
            </div>
        )
    } else if (verification.status === 200 && verification.data) {
        body = (
            <>
                <p className="text-gray-600 dark:text-gray-400 mb-8">
                    Please confirm that <span className="font-bold text-gray-900 dark:text-white">{verification.data.email}</span> is an email address for user <span className="font-bold text-gray-900 dark:text-white">{verification.data.user?.display || verification.data.user?.username}</span>.
                </p>
                <button
                    onClick={handleConfirm}
                    disabled={submitting}
                    className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {submitting ? <Loader2 className="animate-spin" size={20} /> : 'Confirm'}
                </button>
            </>
        )
    } else if (verification.status === 401) {
        // Should not usually happen for public verify but handling just in case
        body = (
            <p>Please login to verify this email.</p>
        )
    }
    else if (!verification.data?.email) {
        body = <p className="text-gray-600 dark:text-gray-400">Invalid verification link.</p>
    } else {
        body = <p className="text-gray-600 dark:text-gray-400">Unable to confirm email {verification.data.email} because it is already confirmed.</p>
    }

    return (
        <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50 dark:bg-gray-950 transition-colors">
            <div className="max-w-md w-full">
                <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 text-center transition-colors">
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                        <MailCheck size={32} />
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                        Confirm Email Address
                    </h2>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm italic">
                            {error}
                        </div>
                    )}

                    {body}
                </div>
            </div>
        </div>
    )
}
