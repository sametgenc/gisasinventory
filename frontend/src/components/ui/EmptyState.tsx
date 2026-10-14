import React from 'react'
import { cn } from './tokens'

export interface EmptyStateProps {
    icon?: React.ReactNode
    title: React.ReactNode
    description?: React.ReactNode
    action?: React.ReactNode
    className?: string
    /** Use `compact` inside tight rows (e.g. DataTable empty body). */
    compact?: boolean
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    action,
    className,
    compact = false,
}) => (
    <div
        className={cn(
            'flex flex-col items-center text-center',
            compact ? 'py-10 px-4' : 'py-16 px-6',
            className,
        )}
    >
        {icon && (
            <div className={cn('mb-3 text-slate-400 dark:text-slate-500 [&>svg]:h-7 [&>svg]:w-7', compact && 'mb-2')}>
                {icon}
            </div>
        )}
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        {description && (
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400 mt-1 max-w-md">{description}</p>
        )}
        {action && <div className="mt-4">{action}</div>}
    </div>
)
