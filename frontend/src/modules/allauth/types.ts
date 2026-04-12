export interface User {
    id: string;
    username: string;
    email: string;
    display?: string;
    has_usable_password?: boolean;
    is_superuser?: boolean;
    role?: 'platform_admin' | 'tenant_admin' | 'tenant_user';
    tenant_slug?: string | null;
    tenant_name?: string | null;
}

export interface SessionData {
    user: User | null;
    status: number;
}

export interface Flow {
    id: string;
    is_pending?: boolean;
    types?: string[];
    [key: string]: any;
}

export interface AuthResponse {
    status: number;
    data?: {
        user?: User;
        methods?: Array<{
            method: string;
            at: number;
            [key: string]: any;
        }>;
        flows?: Flow[];
        [key: string]: any;
    };
    meta?: {
        is_authenticated: boolean;
        flows?: Array<{
            id: string;
            [key: string]: any;
        }>;
    };
    errors?: Array<{
        message: string;
        code: string;
        param?: string;
    }>;
}

export interface LoginData {
    username?: string;
    email?: string;
    password?: string;
}

export interface SignupData {
    username: string;
    email: string;
    password?: string;
    password1?: string;
    password2?: string;
}

export interface Authenticator {
    type: 'totp' | 'recovery_codes' | 'webauthn';
    id: string;
    created_at: string;
    last_used_at: string | null;
}

export interface TOTPSetup {
    secret: string;
    totp_url: string;
}

export interface MFAAuthenticateResponse extends AuthResponse {
    data: {
        authenticators: Authenticator[];
        [key: string]: any;
    };
}

export interface SocialProvider {
    id: string;
    name: string;
    client_id: string;
    auth_url: string;
}

export interface ConfigResponse {
    account: {
        email_verification: 'mandatory' | 'optional' | 'none';
        login_by_code_enabled: boolean;
        email_verification_by_code_enabled: boolean;
        password_reset_by_code_enabled: boolean;
    };
    socialaccount: {
        providers: SocialProvider[];
    };
    mfa: {
        supported_types: ('totp' | 'recovery_codes' | 'webauthn')[];
        passkey_login_enabled: boolean;
        passkey_signup_enabled?: boolean;
    };
}
