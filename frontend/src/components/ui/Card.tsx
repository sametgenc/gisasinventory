import React from 'react'
import { cn, cardClass, dividerClass } from './tokens'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    padded?: boolean
    hoverable?: boolean
}

/** Standard bordered surface used across the app. */
export const Card: React.FC<CardProps> = ({
    padded = false,
    hoverable = false,
    className,
    children,
    ...rest
}) => (
    <div
        className={cn(
            cardClass,
            padded && 'p-5',
            hoverable && 'hover:border-slate-300 dark:hover:border-slate-700 transition-colors',
            className,
        )}
        {...rest}
    >
        {children}
    </div>
)

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
    title: React.ReactNode
    description?: React.ReactNode
    actions?: React.ReactNode
    icon?: React.ReactNode
}

export const CardHeader: React.FC<CardHeaderProps> = ({
    title,
    description,
    actions,
    icon,
    className,
    ...rest
}) => (
    <div
        className={cn(
            'flex items-start justify-between gap-3 px-5 py-4 border-b',
            dividerClass,
            className,
        )}
        {...rest}
    >
        <div className="flex items-center gap-3 min-w-0">
            {icon && <div className="shrink-0">{icon}</div>}
            <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">{title}</h2>
                {description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
                )}
            </div>
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
)

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
    className,
    children,
    ...rest
}) => (
    <div className={cn('p-5', className)} {...rest}>
        {children}
    </div>
)
