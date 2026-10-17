import React, { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ALLAUTH_API } from '../modules/allauth/data';
import { AuthContext } from './context';
import type { AuthRefreshResult } from './context';
import type { User, LoginData, SignupData, AuthResponse, ConfigResponse, Flow, ProviderSignupData } from '../modules/allauth/types';
import {
    get,
    create,
    parseRequestOptionsFromJSON,
    parseCreationOptionsFromJSON,
} from '@github/webauthn-json/browser-ponyfill';

declare global {
    interface DocumentEventMap {
        'allauth.auth.change': CustomEvent<AuthResponse>;
    }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const queryClient = useQueryClient();
    const cachedUserId = React.useRef<string | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [config, setConfig] = useState<ConfigResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastAuthAt, setLastAuthAt] = useState<number | null>(null);
    const [pendingFlow, setPendingFlow] = useState<Flow | null>(null);
    const [meta, setMeta] = useState<AuthResponse['meta'] | null>(null);

    // Helper to extract pending flow from auth response
    const updateFromResponse = useCallback((res: AuthResponse) => {
        if (res.meta) {
            setMeta(res.meta);
        }
        if (res.data?.flows) {
            const pending = res.data.flows.find(f => f.is_pending) || null;
            setPendingFlow(pending);
        } else {
            setPendingFlow(null);
        }
        if (res.status === 200 && res.data?.user) {
            if (cachedUserId.current !== res.data.user.id) {
                queryClient.clear();
                cachedUserId.current = res.data.user.id;
            }
            setUser(res.data.user);
        } else if (res.meta?.is_authenticated === false) {
            queryClient.clear();
            cachedUserId.current = null;
            setUser(null);
            setLastAuthAt(null);
        }
    }, [queryClient]);

    const refresh = useCallback(async (silent: boolean = false): Promise<AuthRefreshResult> => {
        if (!silent) setLoading(true);
        try {
            const [sessionRes, configRes] = await Promise.all([
                ALLAUTH_API.getSession(),
                ALLAUTH_API.getConfig()
            ]);

            updateFromResponse(sessionRes);

            if (sessionRes.status === 200 && sessionRes.data?.user) {
                setUser(sessionRes.data.user);
                // Calculate last authentication time from methods
                const methods = sessionRes.data.methods || [];
                if (methods.length > 0) {
                    // Sort by 'at' descending to find the latest
                    const sorted = [...methods].sort((a, b) => b.at - a.at);
                    setLastAuthAt(sorted[0].at);
                }
            } else {
                setUser(null);
                setLastAuthAt(null);
            }

            if (configRes.status === 200 && configRes.data) {
                setConfig(configRes.data);
            }
            return { sessionRes, configRes };
        } catch (err) {
            setUser(null);
            setLastAuthAt(null);
            return { error: err };
        } finally {
            if (!silent) setLoading(false);
        }
    }, [updateFromResponse]);

    const mountedRef = React.useRef(false);

    useEffect(() => {
        if (mountedRef.current) return;
        mountedRef.current = true;
        refresh();
    }, [refresh]);

    useEffect(() => {
        function onAuthChanged(e: CustomEvent<AuthResponse>) {
            const msg = e.detail;
            updateFromResponse(msg);
        }

        document.addEventListener('allauth.auth.change', onAuthChanged);
        return () => {
            document.removeEventListener('allauth.auth.change', onAuthChanged);
        };
    }, [updateFromResponse]);

    const login = async (data: LoginData) => {
        const res = await ALLAUTH_API.login(data);
        updateFromResponse(res);
        if (res.status === 200) {
            await refresh();
        }
        return res;
    };

    const register = async (data: SignupData) => {
        const res = await ALLAUTH_API.signup(data);
        updateFromResponse(res);
        if (res.status === 200) {
            await refresh();
        }
        return res;
    };

    const logout = async () => {
        await ALLAUTH_API.logout();
        queryClient.clear();
        cachedUserId.current = null;
        setUser(null);
        setLastAuthAt(null);
    };

    const loginWithPasskey = async (captchaToken?: string) => {
        const optRes = await ALLAUTH_API.getWebAuthnRequestOptionsForLogin();
        if (optRes.status === 200 && optRes.data?.request_options) {
            const options = parseRequestOptionsFromJSON(optRes.data.request_options);
            const credential = await get(options);
            const res = await ALLAUTH_API.loginUsingWebAuthn(credential, captchaToken);
            if (res.status === 200) {
                await refresh();
            }
            return res;
        }
        return optRes;
    };

    const authenticateWithPasskey = async (captchaToken?: string) => {
        const optRes = await ALLAUTH_API.getWebAuthnRequestOptionsForAuthentication();
        if (optRes.status === 200 && optRes.data?.request_options) {
            const options = parseRequestOptionsFromJSON(optRes.data.request_options);
            const credential = await get(options);
            const res = await ALLAUTH_API.authenticateWebAuthn(credential, captchaToken);
            if (res.status === 200) {
                await refresh();
            }
            return res;
        }
        return optRes;
    };

    const signupWithPasskey = async (email: string, captchaToken?: string) => {
        const res = await ALLAUTH_API.signupByPasskey({ email }, captchaToken);
        return res;
    };

    const createPasskeyAtSignup = async (name: string, captchaToken?: string) => {
        const optRes = await ALLAUTH_API.getWebAuthnCreateOptionsAtSignup();
        if (optRes.status === 200 && optRes.data?.creation_options) {
            const options = parseCreationOptionsFromJSON(optRes.data.creation_options);
            const credential = await create(options);
            const res = await ALLAUTH_API.signupWebAuthnCredential(name, credential, captchaToken);
            if (res.status === 200) {
                await refresh();
            }
            return res;
        }
        return optRes;
    };

    const requestLoginCode = async (email: string, captchaToken?: string) => {
        const res = await ALLAUTH_API.requestLoginCode(email, captchaToken);
        updateFromResponse(res);
        return res;
    };

    const loginByCode = async (code: string, captchaToken?: string) => {
        const res = await ALLAUTH_API.confirmLoginCode(code, captchaToken);
        if (res.status === 200) {
            await refresh();
        }
        updateFromResponse(res);
        return res;
    };

    const needsReauthentication = () => {
        if (!lastAuthAt) return true;
        // Default timeout 5 minutes (300 seconds) if not verified against backend config
        // session.methods[].at is unix timestamp (seconds or milliseconds? User log showed 1767865342.4208095 which is seconds float)
        const now = Date.now() / 1000;
        const diff = now - lastAuthAt;
        return diff > 300;
    };

    const redirectToProvider = (providerId: string, callbackURL: string, process?: string, captchaToken?: string) => {
        ALLAUTH_API.redirectToProvider(providerId, callbackURL, process, captchaToken);
    };

    const providerSignup = async (data: ProviderSignupData, captchaToken?: string) => {
        const res = await ALLAUTH_API.providerSignup(data, captchaToken);
        updateFromResponse(res);
        if (res.status === 200) {
            await refresh();
        }
        return res;
    };

    if (loading) {
        return (
            <></>
            // <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 transition-colors">
            //     {/* Simple spinner or generic loader */}
            //     <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            // </div>
        )
    }

    return (
        <AuthContext.Provider value={{
            user, config, loading, pendingFlow, login, register, logout, refresh,
            needsReauthentication, loginWithPasskey, authenticateWithPasskey,
            signupWithPasskey, createPasskeyAtSignup, updateFromResponse,
            requestLoginCode, loginByCode, redirectToProvider, providerSignup,
            meta
        }}>
            {children}
        </AuthContext.Provider>
    );
};
