import { isAxiosError } from 'axios'

export function extractApiError(error: unknown, fallback: string): string {
    if (!isAxiosError(error) || !error.response?.data || typeof error.response.data !== 'object') return fallback
    const data: Record<string, unknown> = error.response.data
    if (typeof data.detail === 'string') return data.detail
    const messages = Object.values(data).flatMap(value => {
        if (typeof value === 'string') return [value]
        if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
        if (value && typeof value === 'object') return Object.values(value).flatMap(item => Array.isArray(item) ? item.filter((entry): entry is string => typeof entry === 'string') : typeof item === 'string' ? [item] : [])
        return []
    })
    return messages.length ? messages.join('; ') : fallback
}
