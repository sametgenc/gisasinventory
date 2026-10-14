import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import api from '@/api/client'
import { extractApiError } from '@/utils/errors'
import type { User } from '@/modules/allauth/types'

export type FeedbackType = 'bug' | 'feature' | 'suggestion'
export type FeedbackArea = 'inventory' | 'excel' | 'sharing' | 'account' | 'other'
export type FeedbackStatus = 'open' | 'in_review' | 'planned' | 'in_progress' | 'done' | 'wont_fix'
export type FeedbackPriority = 'low' | 'normal' | 'high'
export const feedbackTypes: FeedbackType[] = ['feature', 'suggestion', 'bug']
export const feedbackAreas: FeedbackArea[] = ['inventory', 'excel', 'sharing', 'account', 'other']
export const feedbackStatuses: FeedbackStatus[] = ['open', 'in_review', 'planned', 'in_progress', 'done', 'wont_fix']
export const feedbackPriorities: FeedbackPriority[] = ['low', 'normal', 'high']
export interface FeedbackAttachment { id: string; original_name: string; size: number; content_type: string; url: string; uploaded_at: string }
export interface FeedbackHistory { id: string; kind: 'created' | 'message' | 'status' | 'assignment' | 'priority'; body: string; before: Record<string, unknown> | string | null; after: Record<string, unknown> | string | null; created_by: string | number | null; created_by_email: string | null; created_by_display: string | null; created_at: string }
export interface DevelopmentRequest {
    id: string; type: FeedbackType; subject: string; description: string; proposed_solution: string; expected_benefit: string;
    area: FeedbackArea; status: FeedbackStatus; priority: FeedbackPriority; page_url: string; user_agent: string;
    submitted_by: number | string | null; submitted_by_email: string | null; tenant: number | null; tenant_name: string | null;
    assigned_to: number | string | null; assigned_to_email: string | null; assigned_to_display: string | null; created_at: string; updated_at: string;
    attachments: FeedbackAttachment[]; history: FeedbackHistory[]; allowed_actions: string[];
}
export interface FeedbackPage { count: number; results: DevelopmentRequest[]; next: string | null; previous: string | null }
export interface FeedbackFilters { type: FeedbackType | ''; status: FeedbackStatus | ''; search: string; page: number }
export interface ManagementOptions { assignees: { id: number | string; email: string; name: string }[]; statuses: { value: FeedbackStatus; label: string }[]; priorities: { value: FeedbackPriority; label: string }[] }

export function isFeedbackManager(user: User | null): boolean {
    return !!user?.is_superuser && user.tenant_id == null && !user.tenant_slug
}
export function canUseDevelopmentRequests(user: User | null): boolean {
    return !!user && (isFeedbackManager(user) || (!!user.tenant_slug && ['tenant_admin', 'tenant_user'].includes(user.role ?? '')))
}
export function feedbackScope(user: User | null): string { return `${user?.id ?? ''}:${user?.tenant_id ?? user?.tenant_slug ?? ''}:${isFeedbackManager(user)}` }

export function feedbackError(error: unknown, fallback: string, rateLimited: string): string {
    return isAxiosError(error) && error.response?.status === 429 ? rateLimited : extractApiError(error, fallback)
}

/** Capture only harmless application paths; authentication keys and all search/hash data stay out. */
export function safeFeedbackPath(pathname: string): string {
    const paths = ['/dashboard', '/assets', '/assets/types', '/shared-equipment', '/shared-usage', '/help', '/development-requests', '/notifications', '/account/email', '/account/password', '/account/authenticators', '/platform/tenants', '/platform/users', '/platform/settings', '/tenant/users']
    return paths.includes(pathname) ? pathname : ''
}

const retry = (count: number, error: unknown) => !(isAxiosError(error) && (error.response?.status ?? 0) >= 400 && (error.response?.status ?? 0) < 500) && count < 2
export function useDevelopmentRequests(scope: string, filters: FeedbackFilters, enabled: boolean) {
    return useQuery({ queryKey: ['development-requests', scope, 'list', filters], enabled, retry,
        queryFn: async () => (await api.get<FeedbackPage>('/api/platform-feedback/', { params: filters })).data })
}
export function useDevelopmentRequest(scope: string, id: string, enabled: boolean) {
    return useQuery({ queryKey: ['development-requests', scope, 'detail', id], enabled, retry,
        queryFn: async () => (await api.get<DevelopmentRequest>(`/api/platform-feedback/${encodeURIComponent(id)}/`)).data })
}
export function useFeedbackManagement(scope: string, enabled: boolean) {
    return useQuery({ queryKey: ['development-requests', scope, 'management'], enabled, retry,
        queryFn: async () => (await api.get<ManagementOptions>('/api/platform-feedback/management_options/')).data })
}
export function useCreateDevelopmentRequest() {
    const client = useQueryClient()
    return useMutation({ mutationFn: async (data: FormData) => (await api.post<DevelopmentRequest>('/api/platform-feedback/', data)).data,
        onSuccess: async () => { await client.invalidateQueries({ queryKey: ['development-requests'] }) } })
}
export function useFeedbackAction() {
    const client = useQueryClient()
    return useMutation({ mutationFn: async ({ id, action, data }: { id: string; action: 'messages' | 'triage'; data: Record<string, unknown> }) =>
        (await api.post<DevelopmentRequest>(`/api/platform-feedback/${encodeURIComponent(id)}/${action}/`, data)).data,
        onSuccess: async result => {
            client.setQueriesData<DevelopmentRequest>({ queryKey: ['development-requests'], predicate: query => query.queryKey.at(-1) === result.id }, result)
            await Promise.all([client.invalidateQueries({ queryKey: ['development-requests'] }), client.invalidateQueries({ queryKey: ['notifications'] })])
        } })
}
export function feedbackDate(value: string, language: string): string {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(language.startsWith('tr') ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
export function formatAttachmentSize(bytes: number): string { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB` }

export const feedbackAccept = '.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.xlsx,.docx'
export function attachmentValidation(files: File[]): 'count' | 'extension' | 'size' | 'total' | null {
    if (files.length > 5) return 'count'
    const extensions = feedbackAccept.split(',')
    if (files.some(file => !extensions.some(ext => file.name.toLowerCase().endsWith(ext)))) return 'extension'
    if (files.some(file => file.size > 5 * 1024 * 1024)) return 'size'
    if (files.reduce((sum, file) => sum + file.size, 0) > 15 * 1024 * 1024) return 'total'
    return null
}
