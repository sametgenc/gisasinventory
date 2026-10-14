import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import api from '@/api/client'
import type { User } from '@/modules/allauth/types'
import type { SharedEquipment } from './types'

export type UsageStatus = 'requested' | 'approved' | 'active' | 'returned' | 'rejected' | 'cancelled'
export type UsageAction = 'approve' | 'reject' | 'cancel' | 'handover' | 'receive'
export type UsageDirection = 'sent' | 'received'
export interface UsageSnapshot {
    title: string
    asset_type_name: string
    catalog_code: string | null
    category_code: string
    sharing_capacity: string
    sharing_note: string
    sharing_availability_note: string
    sharing_contact_name: string
    sharing_contact_email: string
    sharing_contact_phone: string
}
export interface UsageRequest {
    id: string
    asset: string | null
    owner_tenant: number
    owner_tenant_name: string
    requester_tenant: number
    requester_tenant_name: string
    requested_by: number | null
    listing_snapshot: UsageSnapshot
    start_date: string
    end_date: string
    quantity: number
    purpose: string
    status: UsageStatus
    status_label: string
    decision_note: string
    approved_at: string | null
    handed_over_at: string | null
    returned_at: string | null
    closed_at: string | null
    created_at: string
    updated_at: string
    allowed_actions: UsageAction[]
}
export interface UsageCreateInput {
    asset: string
    start_date: string
    end_date: string
    quantity: number
    purpose: string
}
interface UsagePage { count: number; next: string | null; previous: string | null; results: UsageRequest[] }

export function canUseSharedUsage(user: User | null): boolean {
    return !!user && !!user.tenant_slug && (user.role === 'tenant_admin' || user.role === 'tenant_user')
}

export function canRequestEquipment(user: User | null, equipment: SharedEquipment): boolean {
    const ownEquipment = user?.tenant_id != null ? user.tenant_id === equipment.tenant : user?.tenant_name === equipment.tenant_name
    return canUseSharedUsage(user) && !ownEquipment
        && Number.isSafeInteger(equipment.sharing_quantity) && (equipment.sharing_quantity ?? 0) > 0
        && equipment.sharing_availability !== 'unavailable'
}

const retryUsage = (failureCount: number, error: unknown) =>
    !(isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500) && failureCount < 2

export function useUsageRequests(scope: string, filters: { direction: UsageDirection; status: UsageStatus | ''; page: number }, enabled: boolean) {
    return useQuery({
        queryKey: ['shared-usage', scope, 'list', filters], enabled, retry: retryUsage,
        queryFn: async () => (await api.get<UsagePage>('/api/assets/usage-requests/', { params: filters })).data,
    })
}

export function useUsageRequest(scope: string, id: string, enabled: boolean) {
    return useQuery({
        queryKey: ['shared-usage', scope, 'detail', id], enabled: enabled && !!id, retry: retryUsage,
        queryFn: async () => (await api.get<UsageRequest>(`/api/assets/usage-requests/${encodeURIComponent(id)}/`)).data,
    })
}

export function useCreateUsageRequest() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (data: UsageCreateInput) => (await api.post<UsageRequest>('/api/assets/usage-requests/', data)).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shared-usage'] }),
    })
}

export function useUsageAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, action, note }: { id: string; action: UsageAction; note: string }) =>
            (await api.post<UsageRequest>(`/api/assets/usage-requests/${encodeURIComponent(id)}/${action}/`, { note })).data,
        onSuccess: async result => {
            queryClient.setQueriesData<UsageRequest>({ queryKey: ['shared-usage'], predicate: query => query.queryKey.at(-1) === result.id }, result)
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['shared-usage'] }),
                queryClient.invalidateQueries({ queryKey: ['notifications'] }),
            ])
        },
    })
}

export function localToday(): string {
    const now = new Date()
    const year = now.getFullYear()
    return `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function usageDate(value: string, language: string): string {
    const date = new Date(`${value}T12:00:00`)
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language.startsWith('tr') ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export const usageCopy = {
    tr: {
        title: 'Kullanım talepleri', subtitle: 'Tersaneler arasında bedelsiz kullanım. Ekipman sahibinin onayı, teslim ve iade bu ekrandan takip edilir.',
        request: 'Bedelsiz kullanım talebi', send: 'Talebi gönder', ownerApproval: 'Talebi ekipman sahibi tersanenin yöneticisi onaylar. Onay gelmeden ekipman ayrılmış sayılmaz.',
        offered: 'Paylaşıma açılan adet', quantity: 'İstenen adet', start: 'Başlangıç tarihi', end: 'İade tarihi', datesHelp: 'Başlangıç ve iade günü kullanım süresine dahildir.',
        purpose: 'Ne için kullanacaksınız?', purposeHelp: 'Kısa açıklama isteğe bağlı. Yalnızca talebe katılan iki tersane görür.',
        successTitle: 'Talebiniz gönderildi', successDescription: 'Ekipman sahibinin onayı bekleniyor. Durum değişiklikleri size bildirilir.', openRequest: 'Talebi takip et',
        close: 'Kapat', cancel: 'Vazgeç', sent: 'Gönderdiğim talepler', received: 'Gelen talepler', allStatuses: 'Tüm durumlar', status: 'Talep durumu',
        statuses: { requested: 'Onay bekliyor', approved: 'Onaylandı', active: 'Teslim edildi', returned: 'İade alındı', rejected: 'Reddedildi', cancelled: 'İptal edildi' },
        actions: { approve: 'Onayla', reject: 'Reddet', cancel: 'Talebi iptal et', handover: 'Teslim et', receive: 'İade al' },
        actionHelp: { approve: 'Belirtilen tarih ve adedi onaylayın. Ekipman bu kullanım için ayrılacak.', reject: 'Talep kapanacak; ekipman ayrılmayacak.', cancel: 'Talep kapanacak; ayrılan adet yeniden kullanılabilir olacak.', handover: 'Ekipmanı teslim ettiğinizde onaylayın. Kullanım başlayacak.', receive: 'Ekipmanı geri aldığınızda onaylayın. Kullanım kapanacak ve adet yeniden uygun olacak.' },
        confirm: 'İşlemi tamamla', note: 'Açıklama', noteHelp: 'İsteğe bağlı. Talebe katılan tersaneler görür.', details: 'Talep ayrıntıları', view: 'Talebi aç', owner: 'Ekipman sahibi', requester: 'Talep eden tersane',
        period: 'Kullanım tarihleri', terms: 'Paylaşım koşulları', noPurpose: 'Açıklama eklenmemiş.', noTerms: 'Koşullar ekipman sahibiyle görüşülerek belirlenir.',
        progress: 'Onay → Teslim → İade', loading: 'Talepler yükleniyor…', error: 'Talepler yüklenemedi.', detailError: 'Talep açılamadı. Tersane yetkinizi ve talebi kontrol edin.',
        retry: 'Tekrar dene', empty: 'Henüz talep yok', emptyHelp: 'Ortak ekipman listesinden uygun ekipmanı seçip kullanım talebi gönderin.', sharedList: 'Ortak ekipmanlara dön',
        noAccount: 'Tersane hesabı gerekir', noAccountHelp: 'Kullanım talepleri yalnızca talebe katılan tersanelerin kullanıcılarına açıktır.', records: 'talep',
        invalidQuantity: 'Adet pozitif tam sayı olmalı ve paylaşıma açılan adedi aşmamalı.', invalidDates: 'Başlangıç bugün veya sonrası, iade tarihi başlangıç veya sonrası olmalı.',
        sendError: 'Talep gönderilemedi. Bilgileri kontrol edip tekrar deneyin.', actionError: 'İşlem tamamlanamadı. Talebin son durumunu kontrol edin.', changed: 'Talep yenilendi. Son durumu kontrol edip işlemi yeniden seçin.',
        completed: 'İşlem tamamlandı.', paused: 'Bu talep kapandı.', waitingOwner: 'Ekipman sahibi tersanenin onayı bekleniyor.', waitingDelivery: 'Onaylandı. Ekipman sahibi teslimi kaydedecek.', waitingReturn: 'Kullanım sürüyor. Ekipman sahibi geri aldığında iadeyi kaydedecek.',
    },
    en: {
        title: 'Usage requests', subtitle: 'Free shared use between shipyards. Track owner approval, handover and return here.',
        request: 'Request free shared use', send: 'Send request', ownerApproval: 'The equipment owner’s shipyard manager approves the request. Equipment is reserved after approval.',
        offered: 'Quantity offered', quantity: 'Quantity requested', start: 'Start date', end: 'Return date', datesHelp: 'Both the start and return dates are included.',
        purpose: 'What will you use it for?', purposeHelp: 'Optional short explanation. Only the two participating shipyards can see it.',
        successTitle: 'Request sent', successDescription: 'Waiting for the owner’s approval. You will be notified when the status changes.', openRequest: 'Track request',
        close: 'Close', cancel: 'Cancel', sent: 'Requests sent', received: 'Requests received', allStatuses: 'All statuses', status: 'Request status',
        statuses: { requested: 'Awaiting approval', approved: 'Approved', active: 'Handed over', returned: 'Return received', rejected: 'Rejected', cancelled: 'Cancelled' },
        actions: { approve: 'Approve', reject: 'Reject', cancel: 'Cancel request', handover: 'Hand over', receive: 'Receive return' },
        actionHelp: { approve: 'Approve these dates and quantity. Equipment will be reserved for this use.', reject: 'The request will close without reserving equipment.', cancel: 'The request will close and reserved quantity will be released.', handover: 'Confirm after handing over the equipment. Shared use will begin.', receive: 'Confirm after receiving the equipment back. Shared use will close and quantity will be available again.' },
        confirm: 'Complete action', note: 'Explanation', noteHelp: 'Optional. Visible to the participating shipyards.', details: 'Request details', view: 'Open request', owner: 'Equipment owner', requester: 'Requesting shipyard',
        period: 'Usage dates', terms: 'Sharing terms', noPurpose: 'No explanation added.', noTerms: 'Agree terms with the equipment owner.',
        progress: 'Approval → Handover → Return', loading: 'Loading requests…', error: 'Requests could not be loaded.', detailError: 'Request could not be opened. Check your shipyard access and request.',
        retry: 'Try again', empty: 'No requests yet', emptyHelp: 'Choose equipment from the shared list and send a usage request.', sharedList: 'Back to shared equipment',
        noAccount: 'Shipyard account required', noAccountHelp: 'Usage requests are available only to users of the participating shipyards.', records: 'requests',
        invalidQuantity: 'Quantity must be a positive whole number within the offered quantity.', invalidDates: 'Start must be today or later. Return must be on or after the start.',
        sendError: 'Request could not be sent. Check the details and try again.', actionError: 'Action could not be completed. Check the latest request status.', changed: 'Request refreshed. Review the latest status and select the action again.',
        completed: 'Action completed.', paused: 'This request is closed.', waitingOwner: 'Waiting for the equipment owner’s approval.', waitingDelivery: 'Approved. The equipment owner will record the handover.', waitingReturn: 'Shared use is in progress. The owner will record the return after receiving the equipment.',
    },
} as const
