export const Client = Object.freeze({
    APP: 'app',
    BROWSER: 'browser'
});

export const AuthProcess = Object.freeze({
    LOGIN: 'login',
    CONNECT: 'connect'
});

export const Flows = Object.freeze({
    LOGIN: 'login',
    LOGIN_BY_CODE: 'login_by_code',
    MFA_AUTHENTICATE: 'mfa_authenticate',
    MFA_REAUTHENTICATE: 'mfa_reauthenticate',
    MFA_TRUST: 'mfa_trust',
    MFA_WEBAUTHN_LOGIN: 'mfa_login_webauthn',
    MFA_WEBAUTHN_SIGNUP: 'mfa_signup_webauthn',
    PASSWORD_RESET_BY_CODE: 'password_reset_by_code',
    PROVIDER_REDIRECT: 'provider_redirect',
    PROVIDER_SIGNUP: 'provider_signup',
    REAUTHENTICATE: 'reauthenticate',
    SIGNUP: 'signup',
    VERIFY_EMAIL: 'verify_email',
});

export const AuthenticatorType = Object.freeze({
    TOTP: 'totp',
    RECOVERY_CODES: 'recovery_codes',
    WEBAUTHN: 'webauthn'
});
