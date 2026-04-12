import React from 'react';
import { useAuth } from '../../../auth/context';
import type { Authenticator } from '../types';
import { Shield, Smartphone, KeyRound, ArrowRight } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { WebAuthnManager } from './WebAuthnManager';

interface AuthenticatorsProps {
    authenticators: Authenticator[];
    onUpdate: () => void;
}

export const Authenticators: React.FC<AuthenticatorsProps> = ({ authenticators, onUpdate }) => {
    const { config } = useAuth();

    const totpAuth = authenticators.find(a => a.type === 'totp');
    // Check if webauthn is supported in config
    const webAuthnSupported = config?.mfa?.supported_types?.includes('webauthn');

    return (
        <div className="w-full min-w-0 max-w-3xl space-y-6">
            <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
                    <Shield size={24} />
                </div>
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Two-Factor Authentication</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">Secure your account with additional verification methods.</p>
                </div>
            </div>

            {/* WebAuthn / Passkeys */}
            {webAuthnSupported && (
                <WebAuthnManager authenticators={authenticators} onUpdate={onUpdate} />
            )}

            {/* Authenticator App (TOTP) */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-6 transition-colors">
                <div className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-xl text-orange-600 dark:text-orange-400">
                            <Smartphone size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Authenticator App</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                                Use an app like Google Authenticator to generate verification codes.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {totpAuth ? (
                            <Link
                                to="/account/totp-setup"
                                className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
                            >
                                Manage
                            </Link>
                        ) : (
                            <Link
                                to="/account/totp-setup"
                                className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white font-semibold rounded-xl hover:bg-black dark:hover:bg-gray-600 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                            >
                                Set Up <ArrowRight size={16} />
                            </Link>
                        )}
                    </div>
                </div>
                {totpAuth && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center text-sm">
                        <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            Active
                        </span>
                        <span className="text-gray-400 dark:text-gray-500">
                            Added on {new Date(parseInt(totpAuth.created_at) * 1000).toLocaleDateString()}
                        </span>
                    </div>
                )}
            </div>

            {/* Recovery Codes - Only show if MFA is enabled */}
            {authenticators.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors">
                    <div className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl text-blue-600 dark:text-blue-400">
                                <KeyRound size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recovery Codes</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                                    Use these codes to access your account if you lose your device.
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/auth/mfa/recovery-codes"
                            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
                        >
                            View Codes
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};
