import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn, focusRingClass } from './tokens'

export interface PaginationProps {
    /** 1-based current page. */
    page: number
    pageSize: number
    totalItems: number
    pageSizeOptions?: number[]
    onPageChange: (page: number) => void
    onPageSizeChange?: (size: number) => void
    className?: string
}

/** Canonical pagination bar used by `DataTable`. */
export const Pagination: React.FC<PaginationProps> = ({
    page,
    pageSize,
    totalItems,
    pageSizeOptions = [10, 25, 50, 100],
    onPageChange,
    onPageSizeChange,
    className,
}) => {
    const { t } = useTranslation()
    const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(pageSize, 1)))
    const currentPage = Math.min(Math.max(1, page), totalPages)
    const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
    const end = Math.min(currentPage * pageSize, totalItems)

    const go = (p: number) => onPageChange(Math.min(Math.max(1, p), totalPages))

    return (
        <div
            className={cn(
                'flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900',
                className,
            )}
        >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {t('pagination.showing', { start, end, total: totalItems })}
                </span>
                {onPageSizeChange && (
                    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        {t('pagination.perPage')}
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                const next = Number(e.target.value)
                                onPageSizeChange(next)
                                onPageChange(1)
                            }}
                            className={cn('min-h-8 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200', focusRingClass)}
                        >
                            {pageSizeOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
            <div className="flex items-center gap-1">
                <PageBtn label={t('pagination.first', 'First')} disabled={currentPage <= 1} onClick={() => go(1)}>
                    <ChevronsLeft size={14} />
                </PageBtn>
                <PageBtn label={t('pagination.previous', 'Previous')} disabled={currentPage <= 1} onClick={() => go(currentPage - 1)}>
                    <ChevronLeft size={14} />
                </PageBtn>
                <span className="px-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    {t('pagination.page', { page: currentPage, total: totalPages })}
                </span>
                <PageBtn label={t('pagination.next', 'Next')} disabled={currentPage >= totalPages} onClick={() => go(currentPage + 1)}>
                    <ChevronRight size={14} />
                </PageBtn>
                <PageBtn label={t('pagination.last', 'Last')} disabled={currentPage >= totalPages} onClick={() => go(totalPages)}>
                    <ChevronsRight size={14} />
                </PageBtn>
            </div>
        </div>
    )
}

function PageBtn({
    children,
    onClick,
    disabled,
    label,
}: {
    children: React.ReactNode
    onClick: () => void
    disabled?: boolean
    label: string
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300',
                'hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors',
                focusRingClass,
            )}
        >
            {children}
        </button>
    )
}
