import React, { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAuth } from '@/auth/context'
import { Flows } from '@/modules/allauth/lib'
import { ShieldPlus, Loader2, AlertCircle, Fingerprint } from 'lucide-react'

export const Route = createFileRoute('/_auth/register/passkey/create')({
    component: CreateSignupPasskeyComponent,
})

function CreateSignupPasskeyComponent() {
    const { createPasskeyAtSignup, user, loading: authLoading, pendingFlow } = useAuth()
    const navigate = useNavigate()
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Redirect if already logged in (means signup finished)
    React.useEffect(() => {
        if (user) {
            navigate({ to: '/dashboard' })
        }
    }, [user, navigate])

    // Check if we have the correct pending flow
    React.useEffect(() => {
        console.log('[CreatePasskey] Pending flow:', pendingFlow)
        if (!authLoading && pendingFlow?.id !== Flows.MFA_WEBAUTHN_SIGNUP) {
            console.log('[CreatePasskey] No valid pending flow, redirecting to /register/passkey')
            navigate({ to: '/register/passkey' })
        }
    }, [authLoading, pendingFlow, navigate])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const res = await createPasskeyAtSignup(name || 'My Passkey')
            if (res.status === 200) {
                navigate({ to: '/dashboard' })
            } else {
                setError(res.errors?.[0]?.message || 'Failed to create passkey')
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred during passkey creation')
        } finally {
            setLoading(false)
        }
    }

    if (authLoading || pendingFlow?.id !== Flows.MFA_WEBAUTHN_SIGNUP) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>

    return (
        <div className="max-w-md w-full mx-auto mt-20">
            <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 transition-colors">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                        <Fingerprint size={32} />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Final Step</h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">Create your passkey to finish signing up</p>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-4 rounded-xl mb-8 text-sm text-amber-800 dark:text-amber-200 flex gap-3">
                    <ShieldPlus className="shrink-0 text-amber-500 dark:text-amber-400" size={20} />
                    <p>Give your passkey a descriptive name (e.g., "MacBook Pro" or "Mobile Phone") to help you identify it later.</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3 text-sm animate-shake">
                        <AlertCircle size={18} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleCreate} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Passkey Name</label>
                        <input
                            type="text"
                            required
                            className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            placeholder="e.g. My Secure Key"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg shadow-lg shadow-indigo-100 dark:shadow-none"
                    >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : 'Create Passkey'}
                    </button>

                    <div className="text-center mt-6">
                        <Link
                            to="/register"
                            className="text-sm font-medium text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                            Cancel and start over
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    )
}
