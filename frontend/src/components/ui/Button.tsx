import React from 'react'
import { cn, focusRingClass } from './tokens'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
    loading?: boolean
    /** Icon shown at the start of the label. */
    icon?: React.ReactNode
    /** Icon shown at the end of the label. */
    endIcon?: React.ReactNode
    /** Render as a span-like element (keeps the same visuals, useful inside menus). */
    as?: 'button' | 'span'
}

const variantClass: Record<ButtonVariant, string> = {
    primary: 'border border-blue-700 bg-blue-600 hover:bg-blue-700 text-white',
    secondary:
        'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800',
    danger: 'border border-red-700 bg-red-600 hover:bg-red-700 text-white',
    ghost:
        'border border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
}

const sizeClass: Record<ButtonSize, string> = {
    sm: 'min-h-8 px-3 py-1.5 text-xs rounded-md gap-1.5',
    md: 'min-h-10 px-4 py-2 text-sm rounded-md gap-2',
}

/**
 * Canonical Button primitive. Every actionable control in the app uses this
 * so the colour, shape, focus ring, disabled and loading states stay consistent.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = 'primary',
        size = 'md',
        loading = false,
        disabled,
        icon,
        endIcon,
        children,
        className,
        type = 'button',
        ...rest
    },
    ref,
) {
    const isDisabled = disabled || loading
    return (
        <button
            ref={ref}
            type={type}
            disabled={isDisabled}
            className={cn(
                'inline-flex items-center justify-center font-medium leading-5 transition-colors',
                variantClass[variant],
                sizeClass[size],
                focusRingClass,
                isDisabled && 'opacity-65 cursor-not-allowed',
                className,
            )}
            {...rest}
        >
            {loading ? (
                <span
                    className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin"
                    aria-hidden="true"
                />
            ) : icon}
            {children}
            {!loading && endIcon}
        </button>
    )
})
