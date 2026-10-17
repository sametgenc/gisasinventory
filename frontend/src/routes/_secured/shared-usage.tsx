import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { isAxiosError } from 'axios'
import { ClipboardList } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/context'
import { Button, EmptyState, FormField, Modal, PageHeader, Pagination, formControlClass } from '@/components/ui'
import { extractApiError } from '@/utils/errors'
import { useDraftGuard } from '@/hooks/useDraftGuard'
import {
    canUseSharedUsage, usageCopy, usageDate, useUsageAction, useUsageRequest, useUsageRequests,
    type UsageAction, type UsageDirection, type UsageRequest, type UsageStatus,
} from '@/modules/assets/usage'

const statusValues: UsageStatus[] = ['requested', 'approved', 'active', 'returned', 'rejected', 'cancelled']

export const Route = createFileRoute('/_secured/shared-usage')({
    validateSearch: (search: Record<string, unknown>): { request?: string; direction?: UsageDirection; status?: UsageStatus; page?: number } => ({
        request: typeof search.request === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.request) ? search.request : undefined,
        direction: search.direction === 'received' || search.direction === 'sent' ? search.direction : undefined,
        status: typeof search.status === 'string' && statusValues.includes(search.status as UsageStatus) ? search.status as UsageStatus : undefined,
        page: Number.isSafeInteger(Number(search.page)) && Number(search.page) > 1 ? Number(search.page) : undefined,
    }),
    component: SharedUsagePage,
})

const boxClass = 'rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'

function SharedUsagePage() {
    const { user } = useAuth()
    const { i18n } = useTranslation()
    const copy = usageCopy[i18n.language.startsWith('tr') ? 'tr' : 'en']
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const direction = search.direction ?? 'sent'
    const status = search.status ?? ''
    const page = search.page ?? 1
    const changeSearch = (changes: Partial<typeof search>) => void navigate({ search: previous => ({ ...previous, ...changes }) })
    const canUse = canUseSharedUsage(user)
    const scope = `${user?.id ?? ''}:${user?.tenant_id ?? user?.tenant_slug ?? ''}`
    const query = useUsageRequests(scope, { direction, status, page }, canUse)
    const tabsId = useId()
    const directionTabs = useRef<Partial<Record<UsageDirection, HTMLButtonElement | null>>>({})

    function changeDirection(event: KeyboardEvent<HTMLButtonElement>, current: UsageDirection) {
        let next: UsageDirection
        if (event.key === 'Home') next = 'sent'
        else if (event.key === 'End') next = 'received'
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = current === 'sent' ? 'received' : 'sent'
        else return
        event.preventDefault()
        directionTabs.current[next]?.focus()
        changeSearch({ direction: next, page: undefined })
    }

    return <div className="mx-auto max-w-6xl">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        {!canUse ? <div className={boxClass}><EmptyState icon={<ClipboardList />} title={copy.noAccount} description={copy.noAccountHelp} /></div> : <>
            <p className="mb-4 text-sm leading-6 text-slate-500 dark:text-slate-400">{copy.institutionScope}</p>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div role="tablist" aria-label={copy.title} className="flex min-w-0 flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
                    {(['sent', 'received'] as const).map(value => <button key={value} role="tab" id={`${tabsId}-${value}`} aria-controls={`${tabsId}-panel`} aria-selected={direction === value}
                        ref={element => { directionTabs.current[value] = element }} tabIndex={direction === value ? 0 : -1} onKeyDown={event => changeDirection(event, value)}
                        onClick={() => changeSearch({ direction: value, page: undefined })} className={`min-h-11 border-b-2 px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-blue-600 ${direction === value ? 'border-blue-600 text-slate-900 dark:border-blue-400 dark:text-slate-100' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>{copy[value]}</button>)}
                </div>
                <FormField label={copy.status} className="w-full sm:w-60"><select className={formControlClass} value={status} onChange={event => changeSearch({ status: event.target.value as UsageStatus || undefined, page: undefined })}>
                    <option value="">{copy.allStatuses}</option>{statusValues.map(value => <option key={value} value={value}>{copy.statuses[value]}</option>)}
                </select></FormField>
            </div>
            <section role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${direction}`} aria-busy={query.isFetching}>
                {query.isPending ? <p role="status" className="py-12 text-center text-sm text-slate-500">{copy.loading}</p>
                    : query.isError ? <div role="alert" className={boxClass}><EmptyState title={copy.error} action={<Button variant="secondary" onClick={() => { if (page > 1) changeSearch({ page: undefined }); else void query.refetch() }}>{copy.retry}</Button>} /></div>
                        : !query.data?.results.length ? <div className={boxClass}><EmptyState title={status ? copy.emptyFiltered : copy.empty} description={status ? copy.emptyFilteredHelp : direction === 'received' ? copy.emptyReceivedHelp : copy.emptyHelp}
                            action={status ? <Button variant="secondary" onClick={() => changeSearch({ status: undefined, page: undefined })}>{copy.clearStatus}</Button> : undefined} /></div>
                            : <div className={`${boxClass} overflow-hidden`}>
                                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {query.data.results.map(usage => <article key={usage.id} className="grid min-w-0 items-center gap-4 p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                                        <div className="min-w-0">
                                            <h2 className="break-words text-base font-semibold text-slate-900 dark:text-slate-100">{usage.listing_snapshot.title}</h2>
                                            <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{direction === 'sent' ? usage.owner_tenant_name : usage.requester_tenant_name}</p>
                                            <span className="mt-2 inline-flex rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">{copy.statuses[usage.status]}</span>
                                            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.createdBy}: {usage.requested_by_display || copy.creatorUnavailable}</p>
                                            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{copy.nextStep}: {copy.nextSteps[usage.status]}</p>
                                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.responsible}: {['requested', 'approved', 'active'].includes(usage.status) ? `${usage.owner_tenant_name} ${copy.ownerManager}` : copy.noAction}</p>
                                        </div>
                                        <div className="text-sm leading-6 text-slate-700 dark:text-slate-200">
                                            <p>{copy.quantity}: <strong className="font-semibold tabular-nums">{usage.quantity.toLocaleString(i18n.language)}</strong></p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{usageDate(usage.start_date, i18n.language)} – {usageDate(usage.end_date, i18n.language)}</p>
                                        </div>
                                        <Button variant="secondary" className="w-full md:w-auto" onClick={() => changeSearch({ request: usage.id })}>{copy.view}</Button>
                                    </article>)}
                                </div>
                                <Pagination page={page} pageSize={24} totalItems={query.data.count} onPageChange={value => changeSearch({ page: value > 1 ? value : undefined })} itemLabel={copy.records} disabled={query.isFetching} />
                            </div>}
            </section>
            {search.request && <UsageDetails key={`${scope}:${search.request}`} scope={scope} id={search.request} onClose={() => changeSearch({ request: undefined })} />}
        </>}
    </div>
}

function UsageDetails({ scope, id, onClose }: { scope: string; id: string; onClose: () => void }) {
    const { i18n } = useTranslation()
    const copy = usageCopy[i18n.language.startsWith('tr') ? 'tr' : 'en']
    const query = useUsageRequest(scope, id, true)
    const mutation = useUsageAction()
    const [action, setAction] = useState<UsageAction | null>(null)
    const [note, setNote] = useState('')
    const [error, setError] = useState('')
    const [feedback, setFeedback] = useState('')
    const usage = !query.isError ? query.data : undefined
    const selectedAction = action && usage?.allowed_actions.includes(action) ? action : null
    const locked = mutation.isPending || query.isFetching
    const draft = useDraftGuard({ dirty: note !== '', busy: mutation.isPending, onClose })
    const close = () => draft.requestAction(onClose, { navigates: true })
    const noteRef = useRef<HTMLTextAreaElement>(null)
    const confirmRef = useRef<HTMLButtonElement>(null)
    const feedbackRef = useRef<HTMLParagraphElement>(null)

    useEffect(() => {
        if (selectedAction) (['approve', 'reject', 'cancel'].includes(selectedAction) ? noteRef.current : confirmRef.current)?.focus()
    }, [selectedAction])
    useEffect(() => { if (feedback) feedbackRef.current?.focus() }, [feedback])

    async function completeAction() {
        if (!usage || !selectedAction || locked) return
        setError(''); setFeedback('')
        try {
            await mutation.mutateAsync({ id: usage.id, action: selectedAction, note: note.trim() })
            setAction(null); setNote(''); setFeedback(copy.completed)
        } catch (cause) {
            setError(extractApiError(cause, copy.actionError))
            if (isAxiosError(cause) && [403, 404, 409].includes(cause.response?.status ?? 0)) {
                setAction(null)
                await query.refetch()
                setFeedback(copy.changed)
            }
        }
    }

    return <Modal isOpen title={copy.details} onClose={close} closeDisabled={mutation.isPending} size="lg"
        footer={<div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <Button variant="secondary" onClick={close} disabled={mutation.isPending}>{copy.close}</Button>
            {!selectedAction && usage?.allowed_actions.map(value => <Button key={value} variant={value === 'approve' || value === 'handover' || value === 'receive' ? 'primary' : 'secondary'} disabled={locked} onClick={() => { setAction(value); setError(''); setFeedback(''); setNote('') }}>{copy.actions[value]}</Button>)}
            {selectedAction && <Button ref={confirmRef} variant={selectedAction === 'reject' || selectedAction === 'cancel' ? 'danger' : 'primary'} loading={mutation.isPending} disabled={query.isFetching} onClick={() => void completeAction()}>{copy.confirm}</Button>}
        </div>}>
        {draft.confirmation}
        {query.isPending ? <p role="status" className="text-sm text-slate-500">{copy.loading}</p> : !usage ? <div role="alert" className="space-y-4"><p className="text-sm text-slate-700 dark:text-slate-200">{copy.detailError}</p><Button variant="secondary" onClick={() => void query.refetch()}>{copy.retry}</Button></div> : <div className="space-y-5">
            <div className="border-l-2 border-blue-600 pl-3">
                <h3 className="break-words text-lg font-semibold text-slate-900 dark:text-slate-100">{usage.listing_snapshot.title}</h3>
                <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">{copy.statuses[usage.status]}</p>
            </div>
            <UsageProgress usage={usage} />
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <Detail label={copy.owner} value={usage.owner_tenant_name} /><Detail label={copy.requester} value={usage.requester_tenant_name} />
                <Detail label={copy.createdBy} value={usage.requested_by_display || copy.creatorUnavailable} />
                <Detail label={copy.quantity} value={usage.quantity.toLocaleString(i18n.language)} />
                <Detail label={copy.period} value={`${usageDate(usage.start_date, i18n.language)} – ${usageDate(usage.end_date, i18n.language)}`} />
            </dl>
            <div className="border-t border-slate-200 pt-4 dark:border-slate-700"><h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">{copy.purpose}</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{usage.purpose || copy.noPurpose}</p></div>
            <div><h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">{copy.terms}</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{usage.listing_snapshot.sharing_note || copy.noTerms}</p></div>
            {usage.decision_note && <div><h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">{copy.note}</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{usage.decision_note}</p></div>}
            {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
            {feedback && <p ref={feedbackRef} role="status" tabIndex={-1} className="rounded-sm text-sm text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-slate-300">{feedback}</p>}
            {selectedAction && <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{copy.actions[selectedAction]}</h4><Button variant="ghost" size="sm" onClick={() => draft.requestAction(() => { setAction(null); setNote('') })} disabled={mutation.isPending}>{copy.cancel}</Button></div>
                        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.actionHelp[selectedAction]}</p>
                        {(['approve', 'reject', 'cancel'] as UsageAction[]).includes(selectedAction) && <FormField label={copy.note} help={copy.noteHelp}><textarea ref={noteRef} rows={2} maxLength={1000} className={formControlClass} value={note} disabled={mutation.isPending} onChange={event => setNote(event.target.value)} /></FormField>}
                </div>
            </div>}
        </div>}
    </Modal>
}

function Detail({ label, value }: { label: string; value: string }) {
    return <div className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words font-medium text-slate-900 dark:text-slate-100">{value}</dd></div>
}

function UsageProgress({ usage }: { usage: UsageRequest }) {
    const { i18n } = useTranslation()
    const copy = usageCopy[i18n.language.startsWith('tr') ? 'tr' : 'en']
    const steps = ['requested', 'approved', 'active', 'returned'] as const
    const current = steps.indexOf(usage.status as typeof steps[number])
    return <section aria-label={copy.progress} className="space-y-3">
        {current >= 0 && <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">{steps.map((value, index) => <li key={value} aria-current={index === current ? 'step' : undefined} className={`border-t-2 pt-2 text-xs leading-5 ${index <= current ? 'border-blue-600 font-medium text-slate-800 dark:border-blue-400 dark:text-slate-100' : 'border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500'}`}>{index + 1}. {copy.statuses[value]}</li>)}</ol>}
        <div className="space-y-1 text-xs leading-5 text-slate-600 dark:text-slate-300"><p><span className="font-medium">{copy.nextStep}: </span>{copy.nextSteps[usage.status]}</p><p>{copy.responsible}: {current >= 0 && usage.status !== 'returned' ? `${usage.owner_tenant_name} ${copy.ownerManager}` : copy.noAction}</p><p className="text-slate-500 dark:text-slate-400">{copy.reservation[usage.status]}</p></div>
    </section>
}
