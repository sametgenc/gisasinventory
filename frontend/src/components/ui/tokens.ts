/**
 * Shared Tailwind className strings used by UI primitives.
 * Anything that would otherwise be copy-pasted across components lives here so the look stays consistent.
 */

export const cardClass =
    'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md'

export const headingClass = 'text-slate-900 dark:text-slate-100 font-semibold'
export const bodyTextClass = 'text-slate-600 dark:text-slate-300'
export const mutedTextClass = 'text-slate-500 dark:text-slate-400'

export const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

export const dividerClass = 'border-slate-200 dark:border-slate-700'

/** cn() helper: compact, no deps, filters out falsy tokens. */
export function cn(...tokens: Array<string | false | null | undefined>): string {
    return tokens.filter(Boolean).join(' ')
}
