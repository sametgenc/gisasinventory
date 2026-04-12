import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ALLAUTH_API } from '../data';
import { Route } from '../../../routes/_secured/account/totp-setup';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useSensitiveAction } from './useSensitiveAction';

export const TOTPSetup: React.FC = () => {
    const navigate = useNavigate();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { mode, setupData, authenticator } = Route.useLoaderData();
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showDisableModal, setShowDisableModal] = useState(false);
    const { execute } = useSensitiveAction();

    // Test TOTP state
    const [testCode, setTestCode] = useState('');
    const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');
    const [testLoading, setTestLoading] = useState(false);

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        execute(async () => {
            setLoading(true);
            setError(null);

            try {
                const res = await ALLAUTH_API.activateTOTP(code);
                if (res.status === 200) {
                    setSuccess(true);
                    queryClient.invalidateQueries({ queryKey: ['authenticators'] });
                    router.invalidate();
                } else {
                    setError(res.errors?.[0]?.message || 'Activation failed');
                }
            } catch (err: any) {
                setError(err.message || 'An error occurred');
            } finally {
                setLoading(false);
            }
        });
    };

    const handleDeactivate = async () => {
        // Modal handles the confirmation flow now
        setLoading(true);
        try {
            const res = await ALLAUTH_API.deleteTOTP();
            if (res.status === 200) {
                await queryClient.invalidateQueries({ queryKey: ['authenticators'] });
                await router.invalidate();
                navigate({ to: '/account/authenticators' });
            } else {
                setError(res.errors?.[0]?.message || 'Failed to disable TOTP');
            }
        } catch (e: any) {
            setError(e.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleTestTOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setTestLoading(true);
        setTestResult('idle');

        try {
            const res = await ALLAUTH_API.mfaReauthenticate(testCode);
            if (res.status === 200) {
                setTestResult('success');
            } else {
                setTestResult('error');
            }
        } catch (err: any) {
            setTestResult('error');
        } finally {
            setTestLoading(false);
        }
    };

    if (mode === 'manage' && authenticator) {
        return (
            <div className="w-full min-w-0 max-w-md p-6 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 transition-colors">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Authenticator App</h2>
                <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-4 rounded-xl mb-6 flex items-center gap-3 border border-green-100 dark:border-green-900/30">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="font-medium">Active and securing your account</span>
                </div>
                <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-300">
                        Two-factor authentication is currently enabled via an authenticator app.
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Added on: {new Date(parseInt(authenticator.created_at) * 1000).toLocaleDateString()}
                    </p>

                    {/* Test Code Section */}
                    <div className="border border-gray-100 dark:border-gray-800 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Test Your Authenticator</h4>
                        <form onSubmit={handleTestTOTP} className="space-y-3">
                            <input
                                type="text"
                                value={testCode}
                                onChange={(e) => setTestCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="000000"
                                className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-center tracking-widest text-lg font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                maxLength={6}
                            />

                            {testResult === 'success' && (
                                <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-xs text-center flex items-center justify-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Code verified! Authenticator is working.
                                </div>
                            )}

                            {testResult === 'error' && (
                                <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-300 rounded-lg text-xs text-center">
                                    Invalid code. Check your authenticator app.
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={testLoading || testCode.length !== 6}
                                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                            >
                                {testLoading ? 'Verifying...' : 'Test Code'}
                            </button>
                        </form>
                    </div>

                    <hr className="border-gray-100 dark:border-gray-800" />

                    <button
                        onClick={() => setShowDisableModal(true)}
                        disabled={loading}
                        className="w-full py-2.5 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    >
                        Disable Authenticator App
                    </button>
                </div>
                {error && <p className="text-red-500 dark:text-red-400 text-sm mt-4 text-center">{error}</p>}

                <ConfirmationModal
                    isOpen={showDisableModal}
                    onClose={() => setShowDisableModal(false)}
                    onConfirm={() => execute(handleDeactivate)}
                    title="Disable Authenticator App?"
                    message="Are you sure you want to disable 2FA? This will make your account less secure and remove this added layer of protection."
                    confirmText="Yes, Disable"
                    isLoading={loading}
                    type="danger"
                />
            </div>
        );
    }

    if (success) {
        return (
            <div className="w-full min-w-0 max-w-md p-8 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-green-100 dark:border-green-900/30 transition-colors">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">MFA Activated!</h3>
                    <p className="text-gray-600 dark:text-gray-300">Your account is now protected with two-factor authentication.</p>
                </div>

                {/* Test TOTP Section */}
                <div className="border-t border-gray-100 dark:border-gray-800 pt-6 mt-6">
                    <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 text-center">Test Your Authenticator</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
                        Verify that your authenticator app is working correctly by entering a code below.
                    </p>

                    <form onSubmit={handleTestTOTP} className="space-y-4">
                        <input
                            type="text"
                            value={testCode}
                            onChange={(e) => setTestCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="000000"
                            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-center tracking-widest text-xl font-mono text-gray-900 dark:text-white"
                            maxLength={6}
                        />

                        {testResult === 'success' && (
                            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm text-center flex items-center justify-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Code verified successfully! Your authenticator is working.
                            </div>
                        )}

                        {testResult === 'error' && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm text-center">
                                Invalid code. Please check your authenticator app and try again.
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={testLoading || testCode.length !== 6}
                            className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            {testLoading ? 'Verifying...' : 'Test Code'}
                        </button>
                    </form>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <button
                        onClick={() => navigate({ to: '/account/authenticators' })}
                        className="w-full py-2.5 bg-gray-900 dark:bg-gray-700 text-white font-semibold rounded-lg hover:bg-black dark:hover:bg-gray-600 transition-colors"
                    >
                        Return to Settings
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-w-0 max-w-md p-6 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 transition-colors">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Setup Authenticator App</h2>

            {setupData ? (
                <div className="space-y-6">
                    <div className="text-center">
                        <p className="text-gray-600 dark:text-gray-300 mb-4">Scan this QR code with your authenticator app (like Google Authenticator or Authy).</p>
                        <div className="p-4 bg-white rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm inline-block mb-4">
                            <QRCodeSVG
                                value={setupData.totp_url}
                                size={200}
                                level="M"
                                includeMargin={true}
                            />
                        </div>
                        <div className="text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 p-2 rounded select-all break-all border border-gray-200 dark:border-gray-700">
                            Secret: {setupData.secret}
                        </div>
                    </div>

                    <form onSubmit={handleActivate} className="space-y-4 border-t border-gray-100 dark:border-gray-800 pt-6">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Enter the 6-digit code after scanning to verify.</p>
                        <div>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="000000"
                                className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-center tracking-widest text-lg font-mono"
                                required
                                maxLength={6}
                            />
                        </div>

                        {error && <p className="text-red-500 dark:text-red-400 text-sm text-center">{error}</p>}

                        <button
                            type="submit"
                            disabled={loading || code.length < 6}
                            className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Activating...' : 'Activate MFA'}
                        </button>
                    </form>
                </div>
            ) : (
                <div className="animate-pulse flex space-y-4 flex-col items-center py-8">
                    <div className="h-48 w-48 bg-gray-100 dark:bg-gray-800 rounded-lg"></div>
                    <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4"></div>
                </div>
            )}
        </div>
    );
};
