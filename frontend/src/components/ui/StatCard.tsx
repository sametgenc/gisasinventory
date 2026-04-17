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
    neutral: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
    info: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    success: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    danger: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
}

export const StatCard: React.FC<StatCardProps> = ({
    label,
    value,
    icon,
    tone = 'neutral',
    hint,
    className,
}) => (
    <div className={cn(cardClass, 'p-4 flex items-center gap-3', className)}>
        {icon && (
            <div className={cn('p-2.5 rounded-lg shrink-0', toneClass[tone])}>{icon}</div>
        )}
        <div className="min-w-0">
            <p className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">{value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{label}</p>
            {hint && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{hint}</p>}
        </div>
    </div>
)
