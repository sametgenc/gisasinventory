import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuth } from '@/auth/context';
import { ALLAUTH_API } from '../data';
import { Lock, Loader2, AlertCircle, Fingerprint, Key, Smartphone } from 'lucide-react';
import { parseRequestOptionsFromJSON, get as webauthnGet } from '@github/webauthn-json/browser-ponyfill';

type AuthMethod = 'password' | 'passkey' | 'totp';

export const Reauthenticate: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { next } = useSearch({ from: '/_auth/auth/reauthenticate' }) as { next?: string };

    const hasPassword = user?.has_usable_password ?? true;
    const { data: authenticators } = useQuery({
        queryKey: ['authenticators'],
        queryFn: async () => {
            const res = await ALLAUTH_API.getAuthenticators();
            return (res.status === 200 && Array.isArray(res.data)) ? res.data : [];
        },
        staleTime: 10000,
    });

    const hasTOTP = authenticators?.some(a => a.type === 'totp') ?? false;

    // Default to password if they have one, otherwise passkey
    const [method, setMethod] = useState<AuthMethod>(hasPassword ? 'password' : 'passkey');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSuccess = () => {
        if (next) {
            window.location.href = next;
        } else {
            navigate({ to: '/dashboard' });
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await ALLAUTH_API.reauthenticate(password);
            if (res.status === 200) {
                handleSuccess();
            } else {
                setError(res.errors?.[0]?.message || 'Re-authentication failed');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handlePasskeySubmit = async () => {
        setLoading(true);
        setError(null);

        try {
            const optResp = await ALLAUTH_API.getWebAuthnRequestOptionsForReauthentication();
            if (!optResp.data?.request_options) {
                throw new Error('Could not get passkey options');
            }
            const jsonOptions = optResp.data.request_options;
            const options = parseRequestOptionsFromJSON(jsonOptions);
            const credential = await webauthnGet(options);
            const res = await ALLAUTH_API.reauthenticateUsingWebAuthn(credential);

            if (res.status === 200) {
                handleSuccess();
            } else {
                setError(res.errors?.[0]?.message || 'Re-authentication failed');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred during passkey verification');
        } finally {
            setLoading(false);
        }
    };

    const handleTOTPSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await ALLAUTH_API.authenticateMFA(totpCode);
            if (res.status === 200) {
                handleSuccess();
            } else {
                setError(res.errors?.[0]?.message || 'Invalid code');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    // Count available methods
    const availableMethods = [
        hasPassword && 'password',
        'passkey',
        hasTOTP && 'totp'
    ].filter(Boolean) as AuthMethod[];

    return (
        <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50 dark:bg-gray-950 transition-colors">
            <div className="max-w-md w-full p-8 bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 transition-colors">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                        <Lock size={32} />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Verify Identity</h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">Please verify your identity to continue with this sensitive action.</p>
                </div>

                {/* Method Toggle - only show if multiple methods available */}
                {availableMethods.length > 1 && (
                    <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-6 gap-1">
                        {hasPassword && (
                            <button
                                type="button"
                                onClick={() => setMethod('password')}
                                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${method === 'password'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                            >
                                <Key size={14} />
                                Password
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setMethod('passkey')}
                            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${method === 'passkey'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            <Fingerprint size={14} />
                            Passkey
                        </button>
                        {hasTOTP && (
                            <button
                                type="button"
                                onClick={() => setMethod('totp')}
                                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${method === 'totp'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                            >
                                <Smartphone size={14} />
                                TOTP
                            </button>
                        )}
                    </div>
                )}

                {error && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3 text-sm">
                        <AlertCircle size={18} />
                        {error}
                    </div>
                )}

                {method === 'password' && (
                    <form onSubmit={handlePasswordSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
                            <input
                                type="password"
                                required
                                autoFocus
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Verify Password'}
                        </button>
                    </form>
                )}

                {method === 'passkey' && (
                    <div className="space-y-5">
                        <div className="text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                            <Fingerprint className="mx-auto mb-3 text-indigo-600 dark:text-indigo-400" size={48} />
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Click the button below to verify using your passkey or security key.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handlePasskeySubmit}
                            disabled={loading}
                            className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : (
                                <>
                                    <Fingerprint size={20} />
                                    Use Passkey
                                </>
                            )}
                        </button>
                    </div>
                )}

                {method === 'totp' && (
                    <form onSubmit={handleTOTPSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Authenticator Code</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                required
                                autoFocus
                                maxLength={6}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center text-2xl tracking-widest"
                                placeholder="000000"
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                            />
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">Enter the 6-digit code from your authenticator app</p>
                        </div>
                        <button
                            type="submit"
                            disabled={loading || totpCode.length !== 6}
                            className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Verify Code'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};
