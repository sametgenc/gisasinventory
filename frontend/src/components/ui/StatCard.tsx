import React from 'react'
import { cn, cardClass } from './tokens'

export type StatCardTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface StatCardProps {
    label: React.ReactNode
    value: React.ReactNode
    icon?: React.ReactNode
    tone?: StatCardTone
    hint?: React.ReactNode
    className?: string
}

const toneClass: Record<StatCardTone, string> = {
    neutral: 'text-slate-500 dark:text-slate-400',
    info: 'text-blue-600 dark:text-blue-300',
    success: 'text-emerald-700 dark:text-emerald-300',
    warning: 'text-amber-700 dark:text-amber-300',
    danger: 'text-red-700 dark:text-red-300',
}

export const StatCard: React.FC<StatCardProps> = ({
    label,
    value,
    icon,
    tone = 'neutral',
    hint,
    className,
}) => (
    <div className={cn(cardClass, 'p-5 flex items-start justify-between gap-4', className)}>
        <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-5">{label}</p>
            <p className="mt-1 text-[28px] font-semibold tabular-nums text-slate-900 dark:text-slate-100 leading-9">{value}</p>
            {hint && <p className="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
        </div>
        {icon && (
            <div className={cn('mt-1 shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]', toneClass[tone])}>{icon}</div>
        )}
    </div>
)
