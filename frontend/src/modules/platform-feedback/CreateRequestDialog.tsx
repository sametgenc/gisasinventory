import { useId, useRef, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, Paperclip, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Modal, formControlClass } from '@/components/ui'
import { attachmentValidation, feedbackAccept, feedbackAreas, feedbackError, feedbackTypes, formatAttachmentSize, safeFeedbackPath, useCreateDevelopmentRequest, type DevelopmentRequest, type FeedbackArea, type FeedbackType } from '.'

export function CreateRequestDialog({ onClose, pagePath, onCreated }: { onClose: () => void; pagePath: string; onCreated?: (request: DevelopmentRequest) => void }) {
    const { t } = useTranslation()
    const formId = useId()
    const input = useRef<HTMLInputElement>(null)
    const mutation = useCreateDevelopmentRequest()
    const [type, setType] = useState<FeedbackType>('feature')
    const [area, setArea] = useState<FeedbackArea>('other')
    const [subject, setSubject] = useState('')
    const [description, setDescription] = useState('')
    const [solution, setSolution] = useState('')
    const [benefit, setBenefit] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [error, setError] = useState('')
    const [saved, setSaved] = useState<DevelopmentRequest | null>(null)
    const submitting = useRef(false)
    const capturedPath = useState(() => safeFeedbackPath(pagePath))[0]

    function pickFiles(picked: File[]) {
        const next = [...files, ...picked]
        const invalid = attachmentValidation(next)
        if (invalid) setError(t(`feedback.fileErrors.${invalid}`))
        else { setFiles(next); setError('') }
        if (input.current) input.current.value = ''
    }

    async function submit(event: FormEvent) {
        event.preventDefault()
        if (submitting.current || mutation.isPending) return
        if (!subject.trim() || !description.trim()) { setError(t('feedback.validationRequired')); return }
        const invalid = attachmentValidation(files)
        if (invalid) { setError(t(`feedback.fileErrors.${invalid}`)); return }
        submitting.current = true; setError('')
        const body = new FormData()
        body.append('type', type); body.append('area', area); body.append('subject', subject.trim())
        body.append('description', description.trim()); body.append('proposed_solution', solution.trim())
        body.append('expected_benefit', benefit.trim()); body.append('page_url', capturedPath)
        files.forEach(file => body.append('files', file))
        try { const result = await mutation.mutateAsync(body); setSaved(result); onCreated?.(result) }
        catch (cause) { setError(feedbackError(cause, t('feedback.errorGeneric'), t('feedback.rateLimited'))) }
        finally { submitting.current = false }
    }

    return <Modal isOpen title={saved ? t('feedback.savedTitle') : t('feedback.title')} onClose={onClose} closeDisabled={mutation.isPending} size="lg"
        footer={<div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <Link to="/development-requests" search={{ request: saved?.id }} onClick={mutation.isPending ? event => event.preventDefault() : onClose} aria-disabled={mutation.isPending || undefined} className={`text-sm font-medium text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-blue-300 ${mutation.isPending ? 'pointer-events-none opacity-50' : 'hover:underline'}`}>{saved ? t('feedback.track') : t('feedback.mine')}</Link>
            <div className="flex gap-2"><Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>{t(saved ? 'feedback.close' : 'feedback.cancel')}</Button>
                {!saved && <Button type="submit" form={formId} loading={mutation.isPending}>{t('feedback.submit')}</Button>}</div>
        </div>}>
        {saved ? <div role="status" className="space-y-3 py-4"><CheckCircle2 size={24} className="text-emerald-700 dark:text-emerald-300" aria-hidden /><p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{t('feedback.success')}</p><p className="break-words text-base font-semibold text-slate-900 dark:text-slate-100">{saved.subject}</p><p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('feedback.savedHelp')}</p></div>
            : <form id={formId} onSubmit={event => void submit(event)} noValidate className="space-y-5">
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('feedback.subtitle')}</p>
                <div className="grid gap-4 sm:grid-cols-2"><FormField label={t('feedback.typeLabel')}><select className={formControlClass} value={type} onChange={event => setType(event.target.value as FeedbackType)} disabled={mutation.isPending}>{feedbackTypes.map(value => <option key={value} value={value}>{t(`feedback.types.${value}`)}</option>)}</select></FormField>
                    <FormField label={t('feedback.areaLabel')} help={t('feedback.optional')}><select className={formControlClass} value={area} onChange={event => setArea(event.target.value as FeedbackArea)} disabled={mutation.isPending}>{feedbackAreas.map(value => <option key={value} value={value}>{t(`feedback.areas.${value}`)}</option>)}</select></FormField></div>
                <FormField label={t('feedback.subjectLabel')} required><input aria-required value={subject} onChange={event => setSubject(event.target.value)} maxLength={255} className={formControlClass} placeholder={t('feedback.subjectPlaceholder')} disabled={mutation.isPending} /></FormField>
                <FormField label={t('feedback.descriptionLabel')} required help={t('feedback.descriptionHelp')}><textarea aria-required value={description} onChange={event => setDescription(event.target.value)} rows={4} maxLength={10000} className={formControlClass} placeholder={t('feedback.descriptionPlaceholder')} disabled={mutation.isPending} /></FormField>
                <details className="rounded-md border border-slate-200 dark:border-slate-700"><summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-slate-100">{t('feedback.moreDetails')}</summary><div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-700">
                    <FormField label={t('feedback.solutionLabel')} help={t('feedback.solutionHelp')}><textarea rows={3} maxLength={5000} value={solution} onChange={event => setSolution(event.target.value)} className={formControlClass} disabled={mutation.isPending} /></FormField>
                    <FormField label={t('feedback.benefitLabel')} help={t('feedback.benefitHelp')}><textarea rows={2} maxLength={5000} value={benefit} onChange={event => setBenefit(event.target.value)} className={formControlClass} disabled={mutation.isPending} /></FormField>
                </div></details>
                <div className="space-y-2"><label htmlFor={`${formId}-files`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('feedback.attachmentsLabel')}</label><input id={`${formId}-files`} ref={input} type="file" multiple accept={feedbackAccept} onChange={event => pickFiles(Array.from(event.target.files ?? []))} className="sr-only" disabled={mutation.isPending} />
                    <Button variant="secondary" size="sm" disabled={mutation.isPending} onClick={() => input.current?.click()}><Paperclip size={16} aria-hidden />{t('feedback.attachFiles')}</Button>
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('feedback.attachmentsHint')}</p>
                    {!!files.length && <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700">{files.map((file, index) => <li key={`${file.name}:${index}`} className="flex min-w-0 items-center gap-3 px-3 py-2"><span className="min-w-0 flex-1 break-all text-sm text-slate-700 dark:text-slate-200">{file.name}</span><span className="shrink-0 text-xs text-slate-500">{formatAttachmentSize(file.size)}</span><button type="button" disabled={mutation.isPending} onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={t('feedback.removeFile', { name: file.name })} className="min-h-10 min-w-10 rounded-md text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-600"><X size={16} aria-hidden /></button></li>)}</ul>}
                </div>
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('feedback.privacyHelp')}</p>
                {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
            </form>}
    </Modal>
}
