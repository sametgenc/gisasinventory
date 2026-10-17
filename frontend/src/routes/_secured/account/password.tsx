import React, { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { useAuth } from '@/auth/context'
import { useTranslation } from 'react-i18next'
import { accountErrorKey } from '@/modules/allauth/account-errors'
import { Loader2, KeyRound, Lock, ShieldCheck, AlertCircle, Plus } from 'lucide-react'

export const Route = createFileRoute('/_secured/account/password')({
    component: ChangePassword,
    staleTime: 10000,
})

function ChangePassword() {
    const { t } = useTranslation()
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
            setMessage({ type: 'error', text: t('account.password.mismatch') })
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
                setMessage({ type: 'success', text: t(hasCurrentPassword ? 'account.password.changed' : 'account.password.set') })
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
            } else {
                setMessage({ type: 'error', text: t(accountErrorKey(res, 'account.password.failed')) })
            }
        } catch (err: unknown) {
            setMessage({ type: 'error', text: t(accountErrorKey(err, 'account.errors.connection')) })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full min-w-0 max-w-2xl space-y-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                        {t(hasCurrentPassword ? 'account.password.changeTitle' : 'account.password.setTitle')}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        {t(hasCurrentPassword ? 'account.password.changeDescription' : 'account.password.setDescription')}
                    </p>
                </div>
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
                    {hasCurrentPassword ? <KeyRound size={24} /> : <Plus size={24} />}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors">
                <div className="p-8">
                    {message && (
                        <div role={message.type === 'error' ? 'alert' : 'status'} className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-900/30' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-900/30'}`}>
                            {message.type === 'success' ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {hasCurrentPassword && (
                            <div>
                                <label htmlFor="current-password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('account.password.current')}</label>
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
                                        id="current-password"
                                        autoComplete="current-password"
                                        placeholder={t('account.password.currentPlaceholder')}
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label htmlFor="new-password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('account.password.new')}</label>
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
                                    id="new-password"
                                    autoComplete="new-password"
                                    placeholder={t('account.password.newPlaceholder')}
                                />
                            </div>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('account.password.policyHint')}</p>
                        </div>

                        <div>
                            <label htmlFor="confirm-password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('account.password.confirm')}</label>
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
                                    id="confirm-password"
                                    autoComplete="new-password"
                                    placeholder={t('account.password.confirmPlaceholder')}
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3.5 bg-gray-900 dark:bg-indigo-600 text-white font-bold rounded-xl hover:bg-black dark:hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl active:scale-95 duration-200"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : t(hasCurrentPassword ? 'account.password.update' : 'account.password.setTitle')}
                            </button>
                        </div>
                    </form>
                </div>
                {hasCurrentPassword && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 px-8 py-4 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                            {t('account.password.forgot')} <a href="/auth/password/reset" className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold">{t('account.password.reset')}</a>
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

