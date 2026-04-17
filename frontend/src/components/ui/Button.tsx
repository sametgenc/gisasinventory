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
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
    secondary:
        'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
    ghost:
        'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
}

const sizeClass: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs rounded-md gap-1.5',
    md: 'px-4 py-2 text-sm rounded-lg gap-2',
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
                'inline-flex items-center justify-center font-medium transition-colors active:scale-[0.99]',
                variantClass[variant],
                sizeClass[size],
                focusRingClass,
                isDisabled && 'opacity-60 cursor-not-allowed',
                className,
            )}
            {...rest}
        >
            {loading ? (
                <span
                    className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/60 border-t-white animate-spin"
                    aria-hidden="true"
                />
            ) : icon}
            {children}
            {!loading && endIcon}
        </button>
    )
})
