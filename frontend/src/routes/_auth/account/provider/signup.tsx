import React, { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { Loader2, Mail } from 'lucide-react'

export const Route = createFileRoute('/_auth/account/provider/signup')({
    component: ProviderSignup,
})

function ProviderSignup() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const res = await ALLAUTH_API.providerSignup({ email })
            // Provider signup usually returns the auth response which might be a successful login/signup
            if (res.status === 200) {
                // If 200, we might be authenticated or need verification?
                setSuccess(true)
            } else {
                setError(res.errors?.[0]?.message || 'Failed to complete signup')
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50/50 dark:bg-gray-950 transition-colors">
                <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 text-center animate-in fade-in zoom-in duration-300">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-4 tracking-tight">Signup Complete</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg leading-relaxed">
                        Your account has been created successfully.
                    </p>
                    <Link
                        to="/dashboard"
                        className="inline-flex items-center justify-center px-8 py-4 rounded-2xl bg-gray-900 dark:bg-gray-700 text-white font-bold hover:bg-black dark:hover:bg-gray-600 transition-all shadow-lg hover:shadow-xl active:scale-95 duration-200"
                    >
                        Go to Dashboard
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50/50 dark:bg-gray-950 transition-colors">
            <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 animate-in fade-in zoom-in duration-300">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center mb-6 mx-auto transform rotate-3 hover:rotate-6 transition-transform">
                        <Mail size={40} />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Complete Signup</h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-3 text-lg">Please confirm your email address</p>
                </div>

                {error && (
                    <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-2xl text-sm font-medium animate-in slide-in-from-top-2">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Email Address</label>
                        <input
                            type="email"
                            required
                            className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600 font-medium"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-700 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : 'Sign Up'}
                    </button>
                    <div className="text-center pt-2">
                        <Link
                            to="/login"
                            className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                            Return to Login
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    )
}
