import React, { useMemo, useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from './tokens'
import { Pagination } from './Pagination'
import { EmptyState } from './EmptyState'

export type ColumnAlign = 'left' | 'right' | 'center'

export interface ColumnDef<Row> {
    /** Stable identifier used for React keys and sort state. */
    key: string
    header: React.ReactNode
    /** Rendered cell content. */
    cell: (row: Row, rowIndex: number) => React.ReactNode
    align?: ColumnAlign
    /** Enable client-side sorting on this column. Requires `sortAccessor`. */
    sortable?: boolean
    /** Value extracted for sorting — string and number compared naturally. */
    sortAccessor?: (row: Row) => string | number | Date | null | undefined
    /** Tailwind className applied to the `<th>`. */
    headerClassName?: string
    /** Tailwind className applied to every `<td>` in this column. */
    cellClassName?: string
    /** Custom width, e.g. `w-32`. */
    widthClassName?: string
}

export interface DataTableProps<Row> {
    data: Row[]
    columns: ColumnDef<Row>[]
    /** Stable row identifier; defaults to `row.id` if present or the index. */
    getRowId?: (row: Row, index: number) => string | number
    /** Shown when data is empty after filtering. */
    emptyState?: React.ReactNode
    isLoading?: boolean
    /** Default page size. */
    pageSize?: number
    pageSizeOptions?: number[]
    /** Disable pagination entirely (renders all rows). */
    noPagination?: boolean
    /** Initial sort. */
    initialSort?: { key: string; direction: 'asc' | 'desc' }
    /** Row click handler — makes the row look clickable. */
    onRowClick?: (row: Row) => void
    className?: string
    /** Optional extra content rendered above the table (search, filters). */
    toolbar?: React.ReactNode
}

const alignClass: Record<ColumnAlign, string> = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
}

function defaultRowId<Row>(row: Row, index: number): string | number {
    const maybe = (row as { id?: string | number })?.id
    return maybe ?? index
}

/**
 * Unified table used across the app. Handles layout, hover, sticky header,
 * client-side sorting, pagination, loading skeleton, and empty state.
 */
export function DataTable<Row>({
    data,
    columns,
    getRowId = defaultRowId,
    emptyState,
    isLoading = false,
    pageSize: initialPageSize = 25,
    pageSizeOptions,
    noPagination = false,
    initialSort,
    onRowClick,
    className,
    toolbar,
}: DataTableProps<Row>) {
    const [sort, setSort] = useState(initialSort)
    const [pageSize, setPageSize] = useState(initialPageSize)
    const [page, setPage] = useState(1)

    // Reset to page 1 whenever filters/sort/data drastically change.
    const dataKey = data.length
    const sortKey = `${sort?.key ?? ''}-${sort?.direction ?? ''}`
    React.useEffect(() => {
        setPage(1)
    }, [dataKey, sortKey])

    const sortedData = useMemo(() => {
        if (!sort) return data
        const col = columns.find((c) => c.key === sort.key)
        if (!col?.sortAccessor) return data
        const accessor = col.sortAccessor
        const dir = sort.direction === 'asc' ? 1 : -1
        const copy = [...data]
        copy.sort((a, b) => {
            const av = accessor(a)
            const bv = accessor(b)
            if (av == null && bv == null) return 0
            if (av == null) return -1 * dir
            if (bv == null) return 1 * dir
            if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
            return String(av).localeCompare(String(bv)) * dir
        })
        return copy
    }, [data, columns, sort])

    const totalItems = sortedData.length
    const pagedData = useMemo(() => {
        if (noPagination) return sortedData
        const startIdx = (page - 1) * pageSize
        return sortedData.slice(startIdx, startIdx + pageSize)
    }, [sortedData, page, pageSize, noPagination])

    const toggleSort = (col: ColumnDef<Row>) => {
        if (!col.sortable || !col.sortAccessor) return
        setSort((current) => {
            if (!current || current.key !== col.key) return { key: col.key, direction: 'asc' }
            if (current.direction === 'asc') return { key: col.key, direction: 'desc' }
            return undefined
        })
    }

    return (
        <div
            className={cn(
                'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden',
                className,
            )}
        >
            {toolbar && (
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">{toolbar}</div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                            {columns.map((col) => {
                                const isSorted = sort?.key === col.key
                                const sortIcon = !col.sortable ? null
                                    : isSorted
                                        ? sort!.direction === 'asc'
                                            ? <ArrowUp size={12} />
                                            : <ArrowDown size={12} />
                                        : <ArrowUpDown size={12} className="opacity-40" />
                                return (
                                    <th
                                        key={col.key}
                                        scope="col"
                                        className={cn(
                                            'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap',
                                            alignClass[col.align ?? 'left'],
                                            col.widthClassName,
                                            col.headerClassName,
                                        )}
                                    >
                                        {col.sortable ? (
                                            <button
                                                type="button"
                                                onClick={() => toggleSort(col)}
                                                className={cn(
                                                    'inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors',
                                                    col.align === 'right' && 'ml-auto',
                                                )}
                                            >
                                                <span>{col.header}</span>
                                                {sortIcon}
                                            </button>
                                        ) : (
                                            col.header
                                        )}
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {isLoading ? (
                            <>
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i}>
                                        {columns.map((col, ci) => (
                                            <td key={ci} className={cn('px-4 py-3', alignClass[col.align ?? 'left'])}>
                                                <div className="h-3.5 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </>
                        ) : pagedData.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-4">
                                    {emptyState ?? <EmptyState compact title="—" />}
                                </td>
                            </tr>
                        ) : (
                            pagedData.map((row, rowIndex) => {
                                const rid = getRowId(row, rowIndex)
                                return (
                                    <tr
                                        key={String(rid)}
                                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                                        className={cn(
                                            'hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors',
                                            onRowClick && 'cursor-pointer',
                                        )}
                                    >
                                        {columns.map((col) => (
                                            <td
                                                key={col.key}
                                                className={cn(
                                                    'px-4 py-3 text-slate-700 dark:text-slate-200',
                                                    alignClass[col.align ?? 'left'],
                                                    col.cellClassName,
                                                )}
                                            >
                                                {col.cell(row, rowIndex)}
                                            </td>
                                        ))}
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {!noPagination && !isLoading && totalItems > 0 && (
                <Pagination
                    page={page}
                    pageSize={pageSize}
                    totalItems={totalItems}
                    pageSizeOptions={pageSizeOptions}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                />
            )}
        </div>
    )
}
