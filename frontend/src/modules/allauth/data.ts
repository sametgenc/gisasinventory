import api from '@/api/client';
import type { AuthenticationPublicKeyCredential, AuthenticationResponseJSON, RegistrationPublicKeyCredential, RegistrationResponseJSON } from '@github/webauthn-json/browser-ponyfill';
import type { AuthResponse, ChangePasswordData, ConfigResponse, LoginData, ProviderAccount, ProviderSignupData, SignupData } from './types';

type AuthenticationCredential = AuthenticationPublicKeyCredential | AuthenticationResponseJSON;
type RegistrationCredential = RegistrationPublicKeyCredential | RegistrationResponseJSON;

const captchaData = (token?: string) => token ? { captcha_token: token } : {};

export const ALLAUTH_API = {
    reauthenticate: async (password: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/reauthenticate', { password });
        return res.data;
    },

    getSession: async () => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/auth/session');
        return res.data;
    },

    login: async (data: LoginData) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/login', data);
        return res.data;
    },

    signup: async (data: SignupData) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/signup', data);
        return res.data;
    },

    requestLoginCode: async (email: string, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/code/request', { email, ...captchaData(captchaToken) });
        return res.data;
    },

    confirmLoginCode: async (code: string, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/code/confirm', { code, ...captchaData(captchaToken) });
        return res.data;
    },

    logout: async () => {
        await api.delete('/_allauth/browser/v1/auth/session');
    },

    getConfig: async () => {
        const res = await api.get<AuthResponse<ConfigResponse>>('/_allauth/browser/v1/config');
        return res.data;
    },

    getAuthenticators: async () => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/account/authenticators');
        return res.data;
    },

    setupTOTP: async () => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/account/authenticators/totp');
        return res.data;
    },

    activateTOTP: async (code: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/account/authenticators/totp', { code });
        return res.data;
    },

    deleteTOTP: async () => {
        const res = await api.delete<AuthResponse>('/_allauth/browser/v1/account/authenticators/totp');
        return res.data;
    },

    authenticateMFA: async (code: string, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/2fa/authenticate', { code, ...captchaData(captchaToken) });
        return res.data;
    },

    mfaReauthenticate: async (code: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/2fa/reauthenticate', { code });
        return res.data;
    },

    getRecoveryCodes: async () => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/account/authenticators/recovery-codes');
        return res.data;
    },

    generateRecoveryCodes: async () => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/account/authenticators/recovery-codes', {});
        return res.data;
    },

    requestPasswordReset: async (email: string, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/password/request', { email, ...captchaData(captchaToken) });
        return res.data;
    },

    resetPassword: async (data: { key: string, password: string }, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/password/reset', { ...data, ...captchaData(captchaToken) });
        return res.data;
    },

    validatePasswordResetKey: async (key: string) => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/auth/password/reset', {
            headers: { 'X-Password-Reset-Key': key }
        });
        return res.data;
    },

    resetPasswordByCode: async (code: string, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/password/reset', { key: code, ...captchaData(captchaToken) });
        return res.data;
    },

    requestEmailVerification: async (email: string) => {
        const res = await api.put<AuthResponse>('/_allauth/browser/v1/account/email', { email });
        return res.data;
    },

    verifyEmail: async (key: string, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/email/verify', { key, ...captchaData(captchaToken) });
        return res.data;
    },
    verifyEmailByCode: async (code: string, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/email/verify', { key: code, ...captchaData(captchaToken) });
        return res.data;
    },
    getEmailVerification: async (key: string) => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/auth/email/verify', {
            headers: { 'X-Email-Verification-Key': key }
        });
        return res.data;
    },

    getEmailAddresses: async () => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/account/email');
        return res.data;
    },

    addEmail: async (email: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/account/email', { email });
        return res.data;
    },

    deleteEmail: async (email: string) => {
        const res = await api.delete<AuthResponse>('/_allauth/browser/v1/account/email', { data: { email } });
        return res.data;
    },

    markEmailAsPrimary: async (email: string) => {
        const res = await api.patch<AuthResponse>('/_allauth/browser/v1/account/email', { email, primary: true });
        return res.data;
    },

    changePassword: async (data: ChangePasswordData) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/account/password/change', data);
        return res.data;
    },

    // WebAuthn
    getWebAuthnCreateOptions: async (passwordless: boolean = false) => {
        const url = `/_allauth/browser/v1/account/authenticators/webauthn${passwordless ? '?passwordless' : ''}`;
        const res = await api.get<AuthResponse>(url);
        return res.data;
    },

    addWebAuthnCredential: async (name: string, credential: RegistrationCredential) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/account/authenticators/webauthn', { name, credential });
        return res.data;
    },

    updateWebAuthnCredential: async (id: string, data: { name: string }) => {
        const res = await api.put<AuthResponse>('/_allauth/browser/v1/account/authenticators/webauthn', { id, ...data });
        return res.data;
    },

    deleteWebAuthnCredential: async (ids: string[]) => {
        const res = await api.delete<AuthResponse>('/_allauth/browser/v1/account/authenticators/webauthn', { data: { authenticators: ids } });
        return res.data;
    },

    getWebAuthnRequestOptionsForLogin: async () => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/auth/webauthn/login');
        return res.data;
    },

    loginUsingWebAuthn: async (credential: AuthenticationCredential, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/webauthn/login', { credential, ...captchaData(captchaToken) });
        return res.data;
    },

    reauthenticateUsingWebAuthn: async (credential: AuthenticationCredential) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/webauthn/reauthenticate', { credential });
        return res.data;
    },

    getWebAuthnRequestOptionsForReauthentication: async () => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/auth/webauthn/reauthenticate');
        return res.data;
    },

    getWebAuthnRequestOptionsForAuthentication: async () => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/auth/webauthn/authenticate');
        return res.data;
    },

    authenticateWebAuthn: async (credential: AuthenticationCredential, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/webauthn/authenticate', { credential, ...captchaData(captchaToken) });
        return res.data;
    },

    signupByPasskey: async (data: { email: string }, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/webauthn/signup', { ...data, ...captchaData(captchaToken) });
        return res.data;
    },

    getWebAuthnCreateOptionsAtSignup: async () => {
        const res = await api.get<AuthResponse>('/_allauth/browser/v1/auth/webauthn/signup');
        return res.data;
    },

    signupWebAuthnCredential: async (name: string, credential: RegistrationCredential, captchaToken?: string) => {
        const res = await api.put<AuthResponse>('/_allauth/browser/v1/auth/webauthn/signup', { name, credential, ...captchaData(captchaToken) });
        return res.data;
    },

    // Social Auth
    providerSignup: async (data: ProviderSignupData, captchaToken?: string) => {
        const res = await api.post<AuthResponse>('/_allauth/browser/v1/auth/provider/signup', { ...data, ...captchaData(captchaToken) });
        return res.data;
    },

    getProviderAccounts: async () => {
        const res = await api.get<AuthResponse<ProviderAccount[]>>('/_allauth/browser/v1/account/providers');
        return res.data;
    },

    disconnectProviderAccount: async (providerId: string, accountUid: string) => {
        const res = await api.delete<AuthResponse<ProviderAccount[]>>('/_allauth/browser/v1/account/providers', {
            data: { provider: providerId, account: accountUid }
        });
        return res.data;
    },

    // Helper for provider redirect (form post)
    redirectToProvider: (providerId: string, callbackURL: string, process: string = 'login', captchaToken?: string) => {
        const csrfToken = document.cookie
            .split('; ')
            .find((row) => row.startsWith('csrftoken='))
            ?.split('=')[1];

        const form = document.createElement('form');
        form.method = 'POST';
        // Use the configured base URL, or fallback if needed (though config should be set)
        const baseUrl = api.defaults.baseURL || '';
        form.action = `${baseUrl}/_allauth/browser/v1/auth/provider/redirect`;

        const data: Record<string, string> = {
            provider: providerId,
            callback_url: window.location.protocol + '//' + window.location.host + callbackURL,
            process: process,
        };

        if (captchaToken) data['cf-turnstile-response'] = captchaToken;

        if (csrfToken) {
            data.csrfmiddlewaretoken = csrfToken;
        }

        Object.keys(data).forEach(key => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = data[key];
            form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
    }
};


