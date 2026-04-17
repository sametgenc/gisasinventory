import React, { useState } from 'react';
import { ALLAUTH_API } from '../data';
import { Link } from '@tanstack/react-router';
import { Route } from '../../../routes/_auth/auth/mfa/recovery-codes';
import { useSensitiveAction } from './useSensitiveAction';
import { RefreshCw, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AllauthLikeResponse {
    status: number;
    data?: { unused_codes?: string[] };
    errors?: Array<{ message?: string }>;
}

// The allauth data module types the response loosely, so we wrap it.
const callGenerateRecoveryCodes = (): Promise<AllauthLikeResponse> =>
    (ALLAUTH_API as unknown as { generateRecoveryCodes: () => Promise<AllauthLikeResponse> }).generateRecoveryCodes();

export const RecoveryCodes: React.FC = () => {
    const { t } = useTranslation();
    const { codes: initialCodes } = Route.useLoaderData();
    const [codes, setCodes] = useState<string[]>(initialCodes || []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { execute } = useSensitiveAction();

    const handleGenerate = () => {
        execute(async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await callGenerateRecoveryCodes();
                if (res.status === 200) {
                    setCodes(res.data?.unused_codes || []);
                } else {
                    setError(res.errors?.[0]?.message || t('mfa.recovery.generateFailed'));
                }
            } catch (err: unknown) {
                const message = (err as { message?: string })?.message || t('mfa.recovery.errorOccurred');
                setError(message);
            } finally {
                setLoading(false);
            }
        });
    };

    if (loading && codes.length === 0) {
        return (
            <div className="max-w-2xl mx-auto mt-8 p-8 bg-white rounded-2xl shadow-sm border border-gray-100 animate-pulse text-center">
                <div className="h-8 bg-gray-100 rounded w-1/3 mx-auto mb-4"></div>
                <div className="h-4 bg-gray-50 rounded w-1/2 mx-auto mb-8"></div>
                <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-10 bg-gray-50 rounded-lg"></div>)}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50 dark:bg-gray-950 transition-colors">
            <div className="max-w-2xl w-full p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">{t('mfa.recovery.title')}</h2>
                    <p className="mt-2 text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                        {t('mfa.recovery.subtitle')}
                    </p>
                    <div className="mt-4 inline-flex items-center px-4 py-2 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wider rounded-full border border-amber-100 dark:border-amber-900/20">
                        {t('mfa.recovery.storeSafely')}
                    </div>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl border border-red-100 dark:border-red-800 text-sm flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-8">
                    {codes.map((code, index) => (
                        <div
                            key={index}
                            className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl font-mono text-center text-gray-800 dark:text-gray-200 text-lg tracking-widest shadow-sm hover:bg-white dark:hover:bg-gray-700 hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-default"
                        >
                            {code}
                        </div>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex space-x-3 w-full sm:w-auto">
                        <button
                            onClick={() => window.print()}
                            className="flex-1 sm:flex-none px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-black dark:hover:bg-gray-600 transition-colors font-medium flex items-center justify-center gap-2"
                        >
                            <Printer size={16} />
                            {t('mfa.recovery.print')}
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            className="flex-1 sm:flex-none px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            {loading ? t('mfa.recovery.generating') : t('mfa.recovery.regenerate')}
                        </button>
                    </div>
                    <Link to="/account/authenticators" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                        {t('mfa.recovery.backToSecurity')}
                    </Link>
                </div>
            </div>
        </div>
    );
};
