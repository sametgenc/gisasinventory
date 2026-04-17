/**
 * Shared Tailwind className strings used by UI primitives.
 * Anything that would otherwise be copy-pasted across components lives here so the look stays consistent.
 */

export const cardClass =
    'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm'

export const headingClass = 'text-slate-900 dark:text-white font-semibold'
export const bodyTextClass = 'text-slate-600 dark:text-slate-300'
export const mutedTextClass = 'text-slate-400 dark:text-slate-500'

export const focusRingClass =
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-slate-950'

export const dividerClass = 'border-slate-100 dark:border-slate-800'

/** cn() helper: compact, no deps, filters out falsy tokens. */
export function cn(...tokens: Array<string | false | null | undefined>): string {
    return tokens.filter(Boolean).join(' ')
}
