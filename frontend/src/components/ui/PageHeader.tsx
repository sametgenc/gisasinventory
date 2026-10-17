import React from 'react'
import { cn } from './tokens'

export interface PageHeaderProps {
    title: React.ReactNode
    subtitle?: React.ReactNode
    /** Section icon shown next to the title. */
    icon?: React.ReactNode
    /** Primary action button(s). Rendered at the right edge. */
    actions?: React.ReactNode
    /** Tabs / breadcrumbs / secondary nav placed above the title. */
    before?: React.ReactNode
    className?: string
    density?: 'comfortable' | 'compact'
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
    density = 'comfortable',
}) => (
    <div className={cn('flex flex-col', density === 'compact' ? 'mb-4 gap-2' : 'mb-6 gap-3', className)}>
        {before}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="flex items-start gap-3 min-w-0">
                {icon && (
                    <div className="shrink-0 mt-1 text-slate-500 dark:text-slate-400 [&>svg]:h-5 [&>svg]:w-5">
                        {icon}
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className={cn('font-semibold text-slate-900 dark:text-slate-100 tracking-tight break-words', density === 'compact' ? 'text-lg leading-6' : 'text-[22px] sm:text-2xl leading-8')}>
                        {title}
                    </h1>
                    {subtitle && (
                        <p className={cn('text-slate-500 dark:text-slate-400 mt-1 max-w-2xl', density === 'compact' ? 'text-xs leading-5' : 'text-sm leading-6')}>{subtitle}</p>
                    )}
                </div>
            </div>
            {actions && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:pt-0.5">{actions}</div>}
        </div>
    </div>
)
