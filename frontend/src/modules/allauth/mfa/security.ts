import type { AuthResponse, Authenticator } from '../types'

export type VerificationMethod = 'password' | 'totp' | 'passkey' | 'recovery'

/** Return only local paths, including after percent decoding and URL normalization. */
export function safeReturnPath(value: unknown, fallback = '/dashboard'): string {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback
    try {
        const decoded = decodeURIComponent(value)
        if (decoded.startsWith('//') || decoded.includes('\\') || [...decoded].some(character => character.charCodeAt(0) <= 32)) return fallback
        const url = new URL(value, 'https://inventory.invalid')
        if (url.origin !== 'https://inventory.invalid') return fallback
        if (url.pathname === '/auth/reauthenticate' || url.pathname === '/login') return fallback
        return `${url.pathname}${url.search}${url.hash}`
    } catch {
        return fallback
    }
}

export function reauthenticationMethods(authenticators: Authenticator[], hasPassword: boolean, mfaOnly: boolean): VerificationMethod[] {
    return [
        authenticators.some(a => a.type === 'totp') && 'totp',
        authenticators.some(a => a.type === 'webauthn') && 'passkey',
        hasPassword && !mfaOnly && 'password',
    ].filter(Boolean) as VerificationMethod[]
}

export function pendingMfaMethods(types: string[] = []): VerificationMethod[] {
    return [types.includes('totp') && 'totp', types.includes('webauthn') && 'passkey', types.includes('recovery_codes') && 'recovery'].filter(Boolean) as VerificationMethod[]
}

export function securityErrorKey(response: AuthResponse, fallback = 'mfa.errors.verify'): string {
    if (response.status === 429) return 'mfa.errors.rateLimit'
    if (response.status === 401 && response.data?.flows?.some(flow => flow.id === 'reauthenticate' || flow.id === 'mfa_reauthenticate')) return 'mfa.errors.reauthenticate'
    return fallback
}
