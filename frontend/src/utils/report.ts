/**
 * Lightweight client-side report exporter.
 *
 * Produces an Excel-compatible CSV file (UTF-8 with BOM and CRLF line endings)
 * so it opens cleanly in Excel, Numbers, LibreOffice, and Google Sheets —
 * without adding a heavy spreadsheet library to the bundle.
 */

export type ReportColumn<T> = {
    header: string
    value: (row: T) => string | number | boolean | null | undefined | Date
}

function formatCell(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return ''
        return value.toISOString()
    }
    if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
    return String(value)
}

function escapeCSV(value: string): string {
    const needsQuote = /[",\n\r;]/.test(value)
    const escaped = value.replace(/"/g, '""')
    return needsQuote ? `"${escaped}"` : escaped
}

function buildCSV<T>(rows: T[], columns: ReportColumn<T>[]): string {
    const lines: string[] = []
    lines.push(columns.map((c) => escapeCSV(c.header)).join(';'))
    for (const row of rows) {
        const cells = columns.map((c) => escapeCSV(formatCell(c.value(row))))
        lines.push(cells.join(';'))
    }
    return lines.join('\r\n')
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '') || 'report'
}

function timestamp(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

export function exportReport<T>(
    rows: T[],
    columns: ReportColumn<T>[],
    baseName: string,
): void {
    const csv = buildCSV(rows, columns)
    // UTF-8 BOM so Excel detects Turkish characters correctly.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    downloadBlob(blob, `${sanitizeFilename(baseName)}_${timestamp()}.csv`)
}
