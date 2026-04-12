import React, { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAuth } from '@/auth/context'
import { Loader2, AlertCircle, Mail, ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/_auth/login/code/')({
    component: RequestLoginCodeComponent,
})

function RequestLoginCodeComponent() {
    const { requestLoginCode, user } = useAuth()
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePosition({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };

    // Redirect if already logged in
    React.useEffect(() => {
        if (user) {
            navigate({ to: '/dashboard' })
        }
    }, [user])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const res = await requestLoginCode(email)
            if (res.status === 200 || res.status === 401) {
                // allauth headless returns 401 when a flow is pending
                navigate({ to: '/login/code/confirm', search: { email } })
            } else {
                setError(res.errors?.[0]?.message || 'Could not send code')
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.8),_transparent)] dark:bg-[radial-gradient(circle_at_50%_50%,_rgba(30,30,40,0.5),_transparent)] pointer-events-none" />

            <div
                className="max-w-md w-full relative group perspective-1000"
                onMouseMove={handleMouseMove}
            >
                <div className="relative bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-gray-100 dark:border-gray-800 transition-all duration-300 transform-gpu overflow-hidden">
                    <div
                        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
                        style={{
                            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.06), transparent 40%)`
                        }}
                    />

                    <div className="relative z-20">
                        <Link
                            to="/login"
                            search={{ redirect: undefined }}
                            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6 group/back"
                        >
                            <ArrowLeft size={16} className="group-hover/back:-translate-x-1 transition-transform" />
                            Back to sign in
                        </Link>

                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-inner">
                                <Mail size={32} />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Sign-in Code</h2>
                            <p className="text-gray-500 dark:text-gray-400 mt-2">
                                Enter your email to receive a secure sign-in code
                            </p>
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3 text-sm animate-shake">
                                <AlertCircle size={18} />
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="group/input">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1 transition-colors group-focus-within/input:text-indigo-600 dark:group-focus-within/input:text-indigo-400">Email Address</label>
                                <div className="relative">
                                    <input
                                        type="email"
                                        required
                                        autoFocus
                                        className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all dark:text-white shadow-sm group-hover/input:border-gray-300 dark:group-hover/input:border-gray-600"
                                        placeholder="name@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                    <div className="absolute inset-0 rounded-xl bg-indigo-500/5 opacity-0 group-focus-within/input:opacity-100 pointer-events-none transition-opacity duration-300" />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 active:scale-[0.98] transform"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Send Code'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}
