import React from 'react'
import { cn } from './tokens'

export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple'
export type BadgeSize = 'sm' | 'md'

export interface BadgeProps {
    variant?: BadgeVariant
    size?: BadgeSize
    icon?: React.ReactNode
    className?: string
    children: React.ReactNode
}

const variantClass: Record<BadgeVariant, string> = {
    neutral: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
    info: 'bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    success:
        'bg-emerald-50 dark:bg-emerald-900/15 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    warning:
        'bg-amber-50 dark:bg-amber-900/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    danger: 'bg-red-50 dark:bg-red-900/15 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
    purple:
        'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
}

const sizeClass: Record<BadgeSize, string> = {
    sm: 'text-[11px] px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-0.5 gap-1.5',
}

/** Compact status label used in tables, rows, and detail views. */
export const Badge: React.FC<BadgeProps> = ({
    variant = 'neutral',
    size = 'md',
    icon,
    className,
    children,
}) => (
    <span
        className={cn(
            'inline-flex items-center rounded font-medium leading-4 border',
            variantClass[variant],
            sizeClass[size],
            className,
        )}
    >
        {icon}
        {children}
    </span>
)
