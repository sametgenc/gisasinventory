type AccountError = { code?: string; param?: string }
type AccountResponse = { status?: number; errors?: AccountError[] }

/** Translate stable API codes; server prose may use a different language or contain internal details. */
export function accountErrorKey(value: unknown, fallback: string): string {
    if (!value || typeof value !== 'object') return fallback
    const candidate = value as AccountResponse & { response?: { status?: number; data?: AccountResponse } }
    const response = candidate.response?.data ?? candidate
    const status = response.status ?? candidate.response?.status
    if (status === 429) return 'account.errors.rateLimit'
    const error = response.errors?.[0]
    if (!error) return fallback
    const codes: Record<string, string> = {
        password_too_short: 'account.errors.passwordTooShort',
        password_too_common: 'account.errors.passwordTooCommon',
        password_entirely_numeric: 'account.errors.passwordNumeric',
        password_too_similar: 'account.errors.passwordSimilar',
        password_incorrect: 'account.errors.currentPasswordIncorrect',
        email_taken: 'account.errors.emailTaken',
        email_unique: 'account.errors.emailTaken',
        invalid_code: 'account.errors.invalidCode',
        code_expired: 'account.errors.invalidCode',
        invalid_email: 'account.errors.invalidEmail',
    }
    if (error.code && codes[error.code]) return codes[error.code]
    if (error.code === 'invalid' && error.param === 'email') return 'account.errors.invalidEmail'
    if ((error.code === 'invalid_password' || error.code === 'invalid') && error.param === 'current_password') return 'account.errors.currentPasswordIncorrect'
    return fallback
}
