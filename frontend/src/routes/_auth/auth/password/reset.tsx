import React, { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { KeyRound, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/_auth/auth/password/reset')({
    component: ResetPasswordCode,
})

function ResetPasswordCode() {
    const navigate = useNavigate()
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const handleCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setSubmitError(null)

        if (code.length < 4) {
            setSubmitError('Code is too short')
            return
        }

        // Navigate to the confirm page with the code as the key
        navigate({
            to: '/auth/password/confirm/$key',
            params: { key: code }
        })
    }

    return (
        <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50/50 dark:bg-gray-950 transition-colors">
            <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 animate-in fade-in zoom-in duration-300">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center mb-6 mx-auto transform rotate-3 hover:rotate-6 transition-transform">
                        <KeyRound size={40} />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Enter Reset Code</h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-3 text-lg">Enter the code from your email and your new password</p>
                </div>

                {submitError && (
                    <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-2xl text-sm font-medium animate-in slide-in-from-top-2">
                        {submitError}
                    </div>
                )}

                <form onSubmit={handleCodeSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Reset Code</label>
                        <input
                            type="text"
                            required
                            maxLength={8}
                            className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600 font-mono text-center text-3xl tracking-widest uppercase"
                            placeholder="123456"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading || code.length < 4}
                        className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-700 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : 'Verify Code'}
                    </button>
                    <div className="text-center pt-2">
                        <Link
                            to="/auth/password/request"
                            className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                            Resend Code
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    )
}
