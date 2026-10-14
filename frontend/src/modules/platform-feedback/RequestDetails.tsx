import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip } from 'lucide-react'
import { isAxiosError } from 'axios'
import { Button, FormField, Modal, formControlClass } from '@/components/ui'
import { feedbackDate, feedbackError, feedbackPriorities, feedbackStatuses, formatAttachmentSize, useDevelopmentRequest, useFeedbackAction, useFeedbackManagement, type DevelopmentRequest, type FeedbackHistory, type FeedbackPriority, type FeedbackStatus } from '.'

export function RequestDetails({ scope, id, manager, onClose }: { scope: string; id: string; manager: boolean; onClose: () => void }) {
    const { t, i18n } = useTranslation()
    const query = useDevelopmentRequest(scope, id, true)
    const mutation = useFeedbackAction()
    const [reply, setReply] = useState('')
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const submitting = useRef(false)
    const record = !query.isError ? query.data : undefined
    const locked = mutation.isPending || query.isFetching

    async function sendReply() {
        if (!record || locked || submitting.current) return
        if (!reply.trim()) { setError(t('feedback.replyRequired')); return }
        submitting.current = true; setError(''); setNotice('')
        try { await mutation.mutateAsync({ id, action: 'messages', data: { body: reply.trim() } }); setReply(''); setNotice(t('feedback.replySaved')) }
        catch (cause) {
            setError(feedbackError(cause, t('feedback.errorGeneric'), t('feedback.rateLimited')))
            if (isAxiosError(cause) && [403, 404].includes(cause.response?.status ?? 0)) await query.refetch()
        } finally { submitting.current = false }
    }

    return <Modal isOpen title={t('feedback.detailsTitle')} size="xl" onClose={onClose} closeDisabled={mutation.isPending} footer={<div className="flex justify-end px-5 py-4"><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>{t('feedback.close')}</Button></div>}>
        {query.isPending ? <p role="status" className="text-sm text-slate-500">{t('feedback.loading')}</p> : !record ? <div role="alert" className="space-y-4"><p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{t('feedback.detailError')}</p><Button variant="secondary" onClick={() => void query.refetch()}>{t('feedback.retry')}</Button></div> : <div className="space-y-6">
            <div className="space-y-3"><h3 className="break-words text-lg font-semibold text-slate-900 dark:text-slate-100">{record.subject}</h3><div className="flex flex-wrap gap-2 text-xs"><span className="rounded border border-slate-300 px-2 py-1 text-slate-700 dark:border-slate-600 dark:text-slate-200">{t(`feedback.statuses.${record.status}`)}</span><span className="px-1 py-1 text-slate-500 dark:text-slate-400">{t(`feedback.types.${record.type}`)} · {t(`feedback.areas.${record.area}`)}</span></div>
                <dl className="grid gap-4 text-sm sm:grid-cols-2"><Info label={t('feedback.created')} value={feedbackDate(record.created_at, i18n.language)} /><Info label={t('feedback.updated')} value={feedbackDate(record.updated_at, i18n.language)} />
                    <Info label={t('feedback.assigned')} value={record.assigned_to_display || record.assigned_to_email || t('feedback.unassigned')} /><Info label={t('feedback.priority')} value={t(`feedback.priorities.${record.priority}`)} />
                    {manager && <><Info label={t('feedback.author')} value={record.submitted_by_email || t('feedback.deletedUser')} /><Info label={t('feedback.shipyard')} value={record.tenant_name || t('feedback.platformAccount')} /></>}
                </dl></div>
            <div className="space-y-5 border-t border-slate-200 pt-5 dark:border-slate-700"><Text label={t('feedback.descriptionLabel')} value={record.description} />{record.proposed_solution && <Text label={t('feedback.solutionLabel')} value={record.proposed_solution} />}{record.expected_benefit && <Text label={t('feedback.benefitLabel')} value={record.expected_benefit} />}</div>
            {!!record.attachments.length && <section aria-label={t('feedback.attachmentsLabel')} className="space-y-2"><h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('feedback.attachmentsLabel')}</h4><ul className="space-y-2">{record.attachments.map(file => <li key={file.id} className="flex min-w-0 items-start gap-2 text-sm"><Paperclip size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden /><a href={file.url} className="min-w-0 break-all text-blue-700 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-blue-300" download rel="noopener noreferrer">{file.original_name}</a><span className="shrink-0 text-xs leading-6 text-slate-500">{formatAttachmentSize(file.size)}</span></li>)}</ul></section>}
            {manager && record.allowed_actions.includes('triage') && <Triage key={`${record.status}:${record.priority}:${record.assigned_to ?? ''}`} scope={scope} record={record} onBusyError={setError} onSaved={() => setNotice(t('feedback.triageSaved'))} onBusy={locked} mutate={mutation.mutateAsync} />}
            <section aria-label={t('feedback.historyTitle')} className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700"><h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('feedback.historyTitle')}</h4>
                {!record.history.length ? <p className="text-sm text-slate-500">{t('feedback.noHistory')}</p> : <ol className="space-y-4 border-l border-slate-300 pl-4 dark:border-slate-600">{record.history.map(entry => <li key={entry.id} className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="text-sm font-medium text-slate-800 dark:text-slate-100">{entry.kind === 'message' ? t('feedback.history.message') : historyLabel(entry, t)}</span><time dateTime={entry.created_at} className="text-xs text-slate-500 dark:text-slate-400">{feedbackDate(entry.created_at, i18n.language)}</time></div><p className="break-all text-xs text-slate-500 dark:text-slate-400">{entry.created_by_display || entry.created_by_email || t('feedback.deletedUser')}</p>{entry.body && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{entry.body}</p>}</li>)}</ol>}
            </section>
            {record.allowed_actions.includes('message') && <div className="space-y-3"><FormField label={t('feedback.replyLabel')} help={t('feedback.replyHelp')}><textarea rows={3} maxLength={5000} className={formControlClass} value={reply} onChange={event => setReply(event.target.value)} disabled={mutation.isPending} /></FormField><Button disabled={locked} loading={mutation.isPending} onClick={() => void sendReply()}>{t('feedback.replySubmit')}</Button></div>}
            {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
            {notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}
        </div>}
    </Modal>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words text-slate-800 dark:text-slate-100">{value}</dd></div> }
function Text({ label, value }: { label: string; value: string }) { return <section><h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{value}</p></section> }
function historyLabel(entry: FeedbackHistory, t: (key: string) => string): string {
    const value = typeof entry.after === 'string' ? entry.after : entry.after?.[entry.kind === 'assignment' ? 'assigned_to_email' : entry.kind]
    if (entry.kind === 'status' && typeof value === 'string' && feedbackStatuses.includes(value as FeedbackStatus)) return `${t('feedback.history.status')}: ${t(`feedback.statuses.${value}`)}`
    if (entry.kind === 'priority' && typeof value === 'string' && feedbackPriorities.includes(value as FeedbackPriority)) return `${t('feedback.history.priority')}: ${t(`feedback.priorities.${value}`)}`
    return t(`feedback.history.${entry.kind}`)
}

function Triage({ scope, record, onBusyError, onSaved, onBusy, mutate }: { scope: string; record: DevelopmentRequest; onBusyError: (value: string) => void; onSaved: () => void; onBusy: boolean; mutate: (input: { id: string; action: 'messages' | 'triage'; data: Record<string, unknown> }) => Promise<DevelopmentRequest> }) {
    const { t } = useTranslation()
    const options = useFeedbackManagement(scope, true)
    const [status, setStatus] = useState(record.status)
    const [priority, setPriority] = useState(record.priority)
    const [assigned, setAssigned] = useState(String(record.assigned_to ?? ''))
    const [note, setNote] = useState('')
    const submitting = useRef(false)
    async function save() {
        if (onBusy || submitting.current || !options.data) return
        submitting.current = true; onBusyError('')
        try { await mutate({ id: record.id, action: 'triage', data: { status, priority, assigned_to: assigned ? Number(assigned) : null, note: note.trim() } }); setNote(''); onSaved() }
        catch (cause) { onBusyError(feedbackError(cause, t('feedback.errorGeneric'), t('feedback.rateLimited'))) }
        finally { submitting.current = false }
    }
    return <section aria-label={t('feedback.triageTitle')} className="space-y-4 rounded-md border border-slate-300 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-950"><h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('feedback.triageTitle')}</h4>
        <div className="grid gap-4 sm:grid-cols-3"><FormField label={t('feedback.statusLabel')}><select className={formControlClass} value={status} disabled={onBusy || !options.data} onChange={event => setStatus(event.target.value as FeedbackStatus)}>{feedbackStatuses.map(value => <option key={value} value={value}>{t(`feedback.statuses.${value}`)}</option>)}</select></FormField>
            <FormField label={t('feedback.priority')}><select className={formControlClass} value={priority} disabled={onBusy || !options.data} onChange={event => setPriority(event.target.value as FeedbackPriority)}>{feedbackPriorities.map(value => <option key={value} value={value}>{t(`feedback.priorities.${value}`)}</option>)}</select></FormField>
            <FormField label={t('feedback.assigned')}><select className={formControlClass} value={assigned} disabled={onBusy || !options.data} onChange={event => setAssigned(event.target.value)}><option value="">{t('feedback.unassigned')}</option>{record.assigned_to && !options.data?.assignees.some(user => String(user.id) === String(record.assigned_to)) && <option value={record.assigned_to}>{record.assigned_to_email}</option>}{options.data?.assignees.map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</select></FormField></div>
        <FormField label={t('feedback.triageNote')} help={t('feedback.triageNoteHelp')}><textarea rows={2} maxLength={5000} value={note} onChange={event => setNote(event.target.value)} disabled={onBusy} className={formControlClass} /></FormField>
        {options.isError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t('feedback.optionsError')} <button type="button" className="underline" onClick={() => void options.refetch()}>{t('feedback.retry')}</button></p>}
        <Button variant="secondary" disabled={onBusy || !options.data} onClick={() => void save()}>{t('feedback.triageSubmit')}</Button>
    </section>
}
