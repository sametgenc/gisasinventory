import { formatDistanceToNow } from 'date-fns'
import { enUS, tr } from 'date-fns/locale'
import type { NotificationData } from './types'

export function notificationPath(notification: NotificationData): string {
    const value = notification.content?.url
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || [...value].some(char => char.charCodeAt(0) < 32)) return '/notifications'
    return value
}

export function notificationTime(value: string | undefined, language: string, fallback: string): string {
    if (!value || Number.isNaN(new Date(value).getTime())) return fallback
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: language.startsWith('tr') ? tr : enUS })
}
