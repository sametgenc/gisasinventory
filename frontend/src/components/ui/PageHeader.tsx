import React from 'react'
import { cn } from './tokens'

export interface PageHeaderProps {
    title: React.ReactNode
    subtitle?: React.ReactNode
    /** Icon shown in a subtle blue badge next to the title. */
    icon?: React.ReactNode
    /** Primary action button(s). Rendered at the right edge. */
    actions?: React.ReactNode
    /** Tabs / breadcrumbs / secondary nav placed above the title. */
    before?: React.ReactNode
    className?: string
}

/**
 * One consistent page header across the app. Use at the top of every secured route.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    icon,
    actions,
    before,
    className,
}) => (
    <div className={cn('mb-6 flex flex-col gap-3', className)}>
        {before}
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
                {icon && (
                    <div className="shrink-0 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                        {icon}
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight truncate">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
                    )}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
    </div>
)
