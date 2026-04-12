import React, { useEffect, useState } from 'react';
import { ALLAUTH_API } from '../data';
import { useAuth } from '../../../auth/context';
import { Loader2, Link as LinkIcon, Trash2, Plus } from 'lucide-react';
import type { SocialProvider } from '../types';

export const SocialProviders: React.FC = () => {
    const { config } = useAuth();
    const [connected, setConnected] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const providers = config?.socialaccount?.providers || [];

    const fetchConnected = async () => {
        try {
            // Assuming we have an endpoint to list connected social accounts
            // Based on reference code: getProviderAccounts matches '/account/providers'
            const res = await (ALLAUTH_API as any).getProviderAccounts();
            if (res.status === 200) {
                setConnected(res.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConnected();
    }, []);

    const handleConnect = (provider: SocialProvider) => {
        // Redirect to provider auth url
        // In allauth, usually initiated by a form submit to /providers/<provider_id>/login/?process=connect
        // Or using the API endpoint redirects.
        // Reference: redirectToProvider in reference lib uses postForm to /auth/provider/redirect

        // Let's use the provided auth_url from config if available, or construct standard Django Allauth URL
        if (provider.auth_url) {
            window.location.href = `${provider.auth_url}?process=connect`;
        } else {
            // Fallback
            window.location.href = `/_allauth/browser/v1/auth/provider/redirect?provider=${provider.id}&process=connect`;
        }
    };

    const handleDisconnect = async (providerId: string, accountId: string) => {
        if (!confirm('Are you sure you want to disconnect this account?')) return;
        setActionLoading(true);
        try {
            const res = await (ALLAUTH_API as any).disconnectProviderAccount(providerId, accountId);
            if (res.status === 200) {
                fetchConnected();
            } else {
                setError(res.errors?.[0]?.message || 'Failed to disconnect.');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setActionLoading(false);
        }
    };

    // Helper to get provider name from ID
    const getProviderName = (id: string) => {
        return providers.find(p => p.id === id)?.name || id;
    }

    if (loading) {
        return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;
    }

    return (
        <div className="max-w-3xl mx-auto mt-8 px-4 sm:px-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                <LinkIcon className="text-indigo-500" /> Connected Accounts
            </h2>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6">
                    {error}
                </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Your Connections</h3>
                    {connected.length === 0 ? (
                        <p className="text-gray-500 italic">No third-party accounts connected.</p>
                    ) : (
                        <div className="space-y-4">
                            {connected.map((account: any) => (
                                <div key={account.uid} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                                    <div className="flex items-center gap-3">
                                        {/* Could add provider icons here if we had them map */}
                                        <div>
                                            <p className="font-bold text-gray-900">{getProviderName(account.provider)}</p>
                                            <p className="text-sm text-gray-500">{account.display || account.uid}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDisconnect(account.provider, account.uid)}
                                        disabled={actionLoading}
                                        className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                        title="Disconnect"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-gray-50 p-6 border-t border-gray-100">
                    <h3 className="font-semibold text-gray-900 mb-4">Add Connection</h3>
                    <div className="flex flex-wrap gap-3">
                        {providers.map((provider) => {
                            const isConnected = connected.some(c => c.provider === provider.id);
                            if (isConnected) return null; // Already connected

                            return (
                                <button
                                    key={provider.id}
                                    onClick={() => handleConnect(provider)}
                                    className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm flex items-center gap-2"
                                >
                                    <Plus size={16} /> Connect {provider.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
