import React, { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ALLAUTH_API } from '@/modules/allauth/data'
import { useAuth } from '@/auth/context'
import { Loader2, Plus, Trash2, Shield, AlertTriangle } from 'lucide-react'

export const Route = createFileRoute('/_auth/account/providers')({
    component: ManageProviders,
})

function ManageProviders() {
    const { config } = useAuth()
    const [accounts, setAccounts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadAccounts()
    }, [])

    const loadAccounts = async () => {
        try {
            const res = await ALLAUTH_API.getProviderAccounts()
            if (res.status === 200 && res.data) {
                setAccounts(res.data)
            }
        } catch (e) {
            console.error('Failed to load accounts', e)
        } finally {
            setLoading(false)
        }
    }

    const disconnect = async (account: any) => {
        if (!confirm(`Are you sure you want to disconnect ${account.provider.name}?`)) return

        setActionLoading(true)
        setError(null)
        try {
            const res = await ALLAUTH_API.disconnectProviderAccount(account.provider.id, account.uid)
            if (res.status === 200) {
                // Determine new list. The API returns the UPDATED list in data usually?
                // Reference implementation says: if (resp.status === 200) setAccounts(resp.data)
                if (res.data) {
                    setAccounts(res.data)
                } else {
                    // Fallback if data not returned (should be though)
                    loadAccounts()
                }
            } else {
                setError(res.errors?.[0]?.message || 'Failed to disconnect account')
            }
        } catch (e: any) {
            setError(e.message || 'An error occurred')
        } finally {
            setActionLoading(false)
        }
    }

    const availableProviders = config?.socialaccount?.providers || []

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Connected Accounts</h1>
                <p className="text-gray-500 dark:text-gray-400">Manage your connected social accounts.</p>
            </div>

            {error && (
                <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-2xl flex items-center gap-3">
                    <AlertTriangle size={20} />
                    {error}
                </div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-12">
                {loading ? (
                    <div className="p-8 flex justify-center">
                        <Loader2 className="animate-spin text-indigo-600" size={32} />
                    </div>
                ) : accounts.length === 0 ? (
                    <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                        No connected accounts found.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {accounts.map((account: any) => (
                            <div key={account.uid} className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
                                        <Shield size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white">{account.provider.name}</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{account.display || account.uid}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => disconnect(account)}
                                    disabled={actionLoading}
                                    className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50"
                                    title="Disconnect"
                                >
                                    {actionLoading ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Connect New Account</h2>
                <p className="text-gray-500 dark:text-gray-400">Select a provider to connect to your account.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {availableProviders.map((provider: any) => (
                    <button
                        key={provider.id}
                        onClick={() => ALLAUTH_API.redirectToProvider(provider.id, '/account/providers', 'connect')}
                        className="flex items-center justify-center gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md transition-all group"
                    >
                        <img
                            src={`https://authjs.dev/img/providers/${provider.id === 'google' ? 'google' : 'github'}.svg`} // Fallback icon logic or use generic
                            alt=""
                            className="w-6 h-6"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <span className="font-bold text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{provider.name}</span>
                    </button>
                ))}
                {availableProviders.length === 0 && (
                    <div className="col-span-full p-8 text-center bg-gray-50 dark:bg-gray-900/50 rounded-2xl text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-gray-800">
                        No providers configured in backend.
                    </div>
                )}
            </div>
        </div>
    )
}
