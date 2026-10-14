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
    itemLabel?: string
    disabled?: boolean
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
    itemLabel,
    disabled = false,
    className,
}) => {
    const { t } = useTranslation()
    const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(pageSize, 1)))
    const currentPage = Math.min(Math.max(1, page), totalPages)
    const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
    const end = Math.min(currentPage * pageSize, totalItems)
    const sizes = [...new Set([...pageSizeOptions, pageSize])]
        .filter(size => Number.isInteger(size) && size > 0)
        .sort((a, b) => a - b)
    const numberedPages = getNumberedPages(currentPage, totalPages)

    const go = (p: number) => onPageChange(Math.min(Math.max(1, p), totalPages))

    return (
        <nav
            aria-label={t('pagination.navigation')}
            aria-busy={disabled || undefined}
            className={cn(
                'flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                className,
            )}
        >
            <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
                <div aria-live="polite" aria-atomic="true" className="space-y-0.5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{itemLabel ?? t('pagination.records')}</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{t('pagination.showing', { start, end, total: totalItems })}</p>
                </div>
                {onPageSizeChange && (
                    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        {t('pagination.perPage')}
                        <select
                            value={pageSize}
                            disabled={disabled}
                            onChange={(e) => {
                                const next = Number(e.target.value)
                                onPageSizeChange(next)
                                onPageChange(1)
                            }}
                            className={cn('min-h-10 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 disabled:cursor-wait disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200', focusRingClass)}
                        >
                            {sizes.map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                <PageBtn label={t('pagination.first', 'First')} disabled={disabled || currentPage <= 1} onClick={() => go(1)}>
                    <ChevronsLeft size={16} aria-hidden="true" />
                </PageBtn>
                <PageBtn label={t('pagination.previous', 'Previous')} disabled={disabled || currentPage <= 1} onClick={() => go(currentPage - 1)}>
                    <ChevronLeft size={16} aria-hidden="true" />
                    <span className="hidden lg:inline">{t('pagination.previous')}</span>
                </PageBtn>
                <div className="hidden items-center gap-1 sm:flex">
                    {numberedPages.map((number, index) => {
                        const previous = numberedPages[index - 1]
                        return <React.Fragment key={number}>
                            {previous !== undefined && number - previous > 1 && <span aria-hidden="true" className="px-1 text-slate-400">…</span>}
                            <PageBtn label={t('pagination.goToPage', { page: number })} current={number === currentPage} disabled={disabled} onClick={() => go(number)}>{number}</PageBtn>
                        </React.Fragment>
                    })}
                </div>
                <span className="px-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums sm:hidden">
                    {t('pagination.page', { page: currentPage, total: totalPages })}
                </span>
                <PageBtn label={t('pagination.next', 'Next')} disabled={disabled || currentPage >= totalPages} onClick={() => go(currentPage + 1)}>
                    <span className="hidden lg:inline">{t('pagination.next')}</span>
                    <ChevronRight size={16} aria-hidden="true" />
                </PageBtn>
                <PageBtn label={t('pagination.last', 'Last')} disabled={disabled || currentPage >= totalPages} onClick={() => go(totalPages)}>
                    <ChevronsRight size={16} aria-hidden="true" />
                </PageBtn>
            </div>
        </nav>
    )
}

function getNumberedPages(current: number, total: number): number[] {
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
    const start = Math.max(2, Math.min(current - 1, total - 3))
    return [1, start, start + 1, start + 2, total]
}

function PageBtn({
    children,
    onClick,
    disabled,
    label,
    current = false,
}: {
    children: React.ReactNode
    onClick: () => void
    disabled?: boolean
    label: string
    current?: boolean
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            aria-current={current ? 'page' : undefined}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-sm font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                current ? 'border-blue-700 bg-blue-700 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                focusRingClass,
            )}
        >
            {children}
        </button>
    )
}
