export const ALLAUTH_KEYS = {
    all: ['allauth'] as const,
    session: () => [...ALLAUTH_KEYS.all, 'session'] as const,
    config: () => [...ALLAUTH_KEYS.all, 'config'] as const,
    mfa: () => [...ALLAUTH_KEYS.all, 'mfa'] as const,
    authenticators: () => [...ALLAUTH_KEYS.mfa(), 'authenticators'] as const,
};
