import { createContext, useContext } from 'react';
import type { User, LoginData, SignupData, AuthResponse, ConfigResponse, Flow, ProviderSignupData } from '../modules/allauth/types';

export interface AuthRefreshResult {
    sessionRes?: AuthResponse;
    configRes?: AuthResponse<ConfigResponse>;
    error?: unknown;
}

export interface AuthContextType {
    user: User | null;
    config: ConfigResponse | null;
    loading: boolean;
    pendingFlow: Flow | null;
    login: (data: LoginData) => Promise<AuthResponse>;
    register: (data: SignupData) => Promise<AuthResponse>;
    loginWithPasskey: (captchaToken?: string) => Promise<AuthResponse>;
    authenticateWithPasskey: (captchaToken?: string) => Promise<AuthResponse>;
    signupWithPasskey: (email: string, captchaToken?: string) => Promise<AuthResponse>;
    createPasskeyAtSignup: (name: string, captchaToken?: string) => Promise<AuthResponse>;
    logout: () => Promise<void>;
    refresh: (silent?: boolean) => Promise<AuthRefreshResult>;
    needsReauthentication: () => boolean;
    updateFromResponse: (res: AuthResponse) => void;
    requestLoginCode: (email: string, captchaToken?: string) => Promise<AuthResponse>;
    loginByCode: (code: string, captchaToken?: string) => Promise<AuthResponse>;
    redirectToProvider: (providerId: string, callbackURL: string, process?: string, captchaToken?: string) => void;
    providerSignup: (data: ProviderSignupData, captchaToken?: string) => Promise<AuthResponse>;
    meta: AuthResponse['meta'] | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
