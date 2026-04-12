import React, { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { useAuth } from '@/auth/context'
import { Loader2, KeyRound, Lock, ShieldCheck, AlertCircle, Plus } from 'lucide-react'

export const Route = createFileRoute('/_secured/account/password')({
    component: ChangePassword,
    staleTime: 10000,
})

function ChangePassword() {
    const { user } = useAuth()
    const hasCurrentPassword = user?.has_usable_password ?? true

    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match' })
            return
        }

        setLoading(true)
        setMessage(null)
        try {
            const res = await ALLAUTH_API.changePassword({
                current_password: hasCurrentPassword ? currentPassword : undefined,
                new_password: newPassword
            })
            if (res.status === 200) {
                setMessage({ type: 'success', text: hasCurrentPassword ? 'Password changed successfully.' : 'Password set successfully.' })
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
            } else {
                setMessage({ type: 'error', text: res.errors?.[0]?.message || 'Failed to update password' })
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full min-w-0 max-w-2xl space-y-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                        {hasCurrentPassword ? 'Change Password' : 'Set Password'}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        {hasCurrentPassword
                            ? 'Update your password to keep your account secure.'
                            : 'You signed up with a passkey. Set a password as an alternative login method.'}
                    </p>
                </div>
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
                    {hasCurrentPassword ? <KeyRound size={24} /> : <Plus size={24} />}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors">
                <div className="p-8">
                    {message && (
                        <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-900/30' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-900/30'}`}>
                            {message.type === 'success' ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {hasCurrentPassword && (
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Current Password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                                        <Lock size={18} />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                        placeholder="Enter your current password"
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">New Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type="password"
                                    required
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                    placeholder="Enter your new password"
                                />
                            </div>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Make sure it's at least 8 characters including a number and explicit symbol.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Confirm Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                    placeholder="Confirm your new password"
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3.5 bg-gray-900 dark:bg-indigo-600 text-white font-bold rounded-xl hover:bg-black dark:hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl active:scale-95 duration-200"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : (hasCurrentPassword ? 'Update Password' : 'Set Password')}
                            </button>
                        </div>
                    </form>
                </div>
                {hasCurrentPassword && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 px-8 py-4 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                            Forgot your password? <a href="/auth/password/reset" className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold">Reset it here</a>
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

