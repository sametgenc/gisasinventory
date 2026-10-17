import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Modal, formControlClass } from '@/components/ui'
import { extractApiError } from '@/utils/errors'
import type { SharedEquipment } from '@/modules/assets/types'
import { localToday, usageCopy, useCreateUsageRequest } from '@/modules/assets/usage'
import { useDraftGuard } from '@/hooks/useDraftGuard'

export function UsageRequestModal({ equipment, onClose, unavailable, onRetry, retrying = false }: {
    equipment?: SharedEquipment
    onClose: () => void
    unavailable?: 'unknown' | 'withdrawn'
    onRetry?: () => void
    retrying?: boolean
}) {
    const { t, i18n } = useTranslation()
    const copy = usageCopy[i18n.language.startsWith('tr') ? 'tr' : 'en']
    const [start, setStart] = useState(localToday)
    const [end, setEnd] = useState(localToday)
    const [quantity, setQuantity] = useState('1')
    const [purpose, setPurpose] = useState('')
    const [error, setError] = useState('')
    const [createdId, setCreatedId] = useState('')
    const [invalidField, setInvalidField] = useState<'quantity' | 'start' | 'end' | null>(null)
    const quantityRef = useRef<HTMLInputElement>(null)
    const startRef = useRef<HTMLInputElement>(null)
    const endRef = useRef<HTMLInputElement>(null)
    const trackRef = useRef<HTMLAnchorElement>(null)
    const mutation = useCreateUsageRequest()
    const [initialDates] = useState({ start, end })
    const { requestClose, confirmation } = useDraftGuard({ dirty: !createdId && (start !== initialDates.start || end !== initialDates.end || quantity !== '1' || purpose !== ''), busy: mutation.isPending, onClose })
    useEffect(() => { if (createdId) trackRef.current?.focus() }, [createdId])

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (mutation.isPending || createdId || !equipment || unavailable) return
        const count = Number(quantity)
        if (!/^\d+$/.test(quantity) || !Number.isSafeInteger(count) || count < 1 || count > (equipment.sharing_quantity ?? 0)) {
            setError(copy.invalidQuantity); setInvalidField('quantity'); quantityRef.current?.focus(); return
        }
        if (!start || start < localToday()) { setError(copy.invalidDates); setInvalidField('start'); startRef.current?.focus(); return }
        if (!end || end < start) { setError(copy.invalidDates); setInvalidField('end'); endRef.current?.focus(); return }
        setError(''); setInvalidField(null)
        try {
            const result = await mutation.mutateAsync({ asset: equipment.id, start_date: start, end_date: end, quantity: count, purpose: purpose.trim() })
            setCreatedId(result.id)
        } catch (cause) { setError(extractApiError(cause, copy.sendError)) }
    }

    return <Modal isOpen title={createdId ? copy.successTitle : copy.request} onClose={requestClose} closeDisabled={mutation.isPending} size="md"
        footer={<div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <Button variant="secondary" onClick={requestClose} disabled={mutation.isPending}>{createdId ? copy.close : copy.cancel}</Button>
            {!createdId && <Button type="submit" form="usage-create-form" loading={mutation.isPending} disabled={!equipment || !!unavailable}>{copy.send}</Button>}
        </div>}>
        {confirmation}
        {createdId ? <div className="space-y-4">
            <p role="status" className="text-sm leading-6 text-slate-700 dark:text-slate-200">{copy.successDescription}</p>
            <Link ref={trackRef} to="/shared-usage" search={{ request: createdId }} onClick={onClose} className="inline-flex min-h-10 items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:ring-2">{copy.openRequest}</Link>
        </div> : <form id="usage-create-form" onSubmit={submit} noValidate className="space-y-5">
            {(unavailable || !equipment) && <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><p>{t(unavailable === 'withdrawn' ? 'sharedEquipment.requestWithdrawn' : 'sharedEquipment.requestUnavailable')}</p>{onRetry && <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry} disabled={retrying || mutation.isPending}>{t('sharedEquipment.retry')}</Button>}</div>}
            {equipment && !unavailable && <div className="border-l-2 border-blue-600 pl-3">
                <p className="break-words text-base font-semibold text-slate-900 dark:text-slate-100">{equipment.sharing_title || equipment.asset_type_name}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{equipment.tenant_name} · {copy.offered}: {equipment.sharing_quantity}</p>
            </div>}
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.ownerApproval}</p>
            {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
            <fieldset disabled={mutation.isPending} className="min-w-0 space-y-4">
                <FormField label={copy.quantity} required error={invalidField === 'quantity' ? error : undefined}><input ref={quantityRef} type="text" inputMode="numeric" className={formControlClass} value={quantity} onChange={event => { setQuantity(event.target.value); if (invalidField === 'quantity') { setInvalidField(null); setError('') } }} /></FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label={copy.start} required error={invalidField === 'start' ? error : undefined}><input ref={startRef} type="date" min={localToday()} className={formControlClass} value={start} onChange={event => { setStart(event.target.value); if (invalidField === 'start') { setInvalidField(null); setError('') } }} /></FormField>
                    <FormField label={copy.end} required error={invalidField === 'end' ? error : undefined}><input ref={endRef} type="date" min={start || localToday()} className={formControlClass} value={end} onChange={event => { setEnd(event.target.value); if (invalidField === 'end') { setInvalidField(null); setError('') } }} /></FormField>
                </div>
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.datesHelp}</p>
                <FormField label={copy.purpose} help={copy.purposeHelp}><textarea rows={3} maxLength={1000} className={formControlClass} value={purpose} onChange={event => setPurpose(event.target.value)} /></FormField>
            </fieldset>
        </form>}
    </Modal>
}
