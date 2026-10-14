import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/context'
import { Button, EmptyState, FormField, PageHeader, Pagination, formControlClass } from '@/components/ui'
import { canUseDevelopmentRequests, feedbackDate, feedbackScope, feedbackStatuses, feedbackTypes, isFeedbackManager, useDevelopmentRequests, type FeedbackStatus, type FeedbackType } from '@/modules/platform-feedback'
import { CreateRequestDialog } from '@/modules/platform-feedback/CreateRequestDialog'
import { RequestDetails } from '@/modules/platform-feedback/RequestDetails'

export const Route = createFileRoute('/_secured/development-requests')({
    validateSearch: (search: Record<string, unknown>): { request?: string } => ({ request: typeof search.request === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.request) ? search.request : undefined }),
    component: DevelopmentRequestsPage,
})

function DevelopmentRequestsPage() {
    const { user } = useAuth()
    return <ScopedRequests key={feedbackScope(user)} />
}

function ScopedRequests() {
    const { user } = useAuth()
    const { t, i18n } = useTranslation()
    const [type, setType] = useState<FeedbackType | ''>('')
    const [status, setStatus] = useState<FeedbackStatus | ''>('')
    const [page, setPage] = useState(1)
    const [input, setInput] = useState('')
    const [search, setSearch] = useState('')
    const [create, setCreate] = useState(false)
    const routeSearch = Route.useSearch()
    const navigate = Route.useNavigate()
    const allowed = canUseDevelopmentRequests(user)
    const manager = isFeedbackManager(user)
    const scope = feedbackScope(user)
    const query = useDevelopmentRequests(scope, { type, status, search, page }, allowed)
    return <div className="mx-auto w-full max-w-6xl min-w-0">
        <PageHeader title={t('feedback.pageTitle')} subtitle={t(manager ? 'feedback.adminSubtitle' : 'feedback.pageSubtitle')} actions={allowed && <Button onClick={() => setCreate(true)}><Plus size={16} aria-hidden />{t('feedback.newRequest')}</Button>} />
        {!allowed ? <EmptyState icon={<ClipboardList />} title={t('feedback.noAccount')} description={t('feedback.noAccountHelp')} /> : <>
            <div className="mb-5 border-l-2 border-blue-600 pl-3"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t(manager ? 'feedback.allRequests' : 'feedback.mine')}</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t(manager ? 'feedback.adminScopeHelp' : 'feedback.scopeHelp')}</p></div>
            <form onSubmit={event => { event.preventDefault(); setSearch(input.trim()); setPage(1) }} className="mb-5 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <FormField label={t('feedback.searchLabel')}><input type="search" value={input} onChange={event => setInput(event.target.value)} maxLength={200} className={formControlClass} placeholder={t('feedback.searchPlaceholder')} /></FormField>
                <FormField label={t('feedback.typeLabel')}><select value={type} onChange={event => { setType(event.target.value as FeedbackType | ''); setPage(1) }} className={formControlClass}><option value="">{t('feedback.allTypes')}</option>{feedbackTypes.map(value => <option key={value} value={value}>{t(`feedback.types.${value}`)}</option>)}</select></FormField>
                <FormField label={t('feedback.statusLabel')}><select value={status} onChange={event => { setStatus(event.target.value as FeedbackStatus | ''); setPage(1) }} className={formControlClass}><option value="">{t('feedback.allStatuses')}</option>{feedbackStatuses.map(value => <option key={value} value={value}>{t(`feedback.statuses.${value}`)}</option>)}</select></FormField>
                <Button type="submit" variant="secondary"><Search size={16} aria-hidden />{t('feedback.searchSubmit')}</Button>
            </form>
            <section aria-label={t(manager ? 'feedback.allRequests' : 'feedback.mine')} aria-busy={query.isFetching}>
                {query.isPending ? <p role="status" className="py-12 text-center text-sm text-slate-500">{t('feedback.loading')}</p> : query.isError ? <div role="alert"><EmptyState title={t('feedback.listError')} action={<Button variant="secondary" onClick={() => { if (page > 1) setPage(1); else void query.refetch() }}>{t('feedback.retry')}</Button>} /></div> : !query.data?.results.length ? <EmptyState icon={<ClipboardList />} title={t('feedback.emptyTitle')} description={t('feedback.emptyHelp')} action={<Button variant="secondary" onClick={() => setCreate(true)}>{t('feedback.newRequest')}</Button>} /> : <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">{query.data.results.map(record => <article key={record.id} className="grid min-w-0 gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,.55fr)_auto] md:items-center"><div className="min-w-0"><p className="text-xs text-slate-500 dark:text-slate-400">{t(`feedback.types.${record.type}`)} · {t(`feedback.areas.${record.area}`)}</p><h2 className="mt-1 break-words text-base font-semibold text-slate-900 dark:text-slate-100">{record.subject}</h2><p className="mt-2 break-words text-xs text-slate-500 dark:text-slate-400">{manager ? `${record.tenant_name || t('feedback.platformAccount')} · ` : ''}{feedbackDate(record.created_at, i18n.language)}</p></div><div className="space-y-2 text-sm"><span className="inline-flex rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">{t(`feedback.statuses.${record.status}`)}</span>{manager && <p className="break-words text-xs text-slate-500 dark:text-slate-400">{record.assigned_to_email || t('feedback.unassigned')}</p>}</div><Button variant="secondary" className="w-full md:w-auto" onClick={() => void navigate({ search: { request: record.id } })}>{t('feedback.view')}</Button></article>)}</div>
                    <Pagination page={page} pageSize={24} totalItems={query.data.count} onPageChange={setPage} itemLabel={t('feedback.records')} disabled={query.isFetching} />
                </div>}
            </section>
            {create && <CreateRequestDialog pagePath="/development-requests" onClose={() => setCreate(false)} />}
            {routeSearch.request && <RequestDetails key={`${scope}:${routeSearch.request}`} scope={scope} manager={manager} id={routeSearch.request} onClose={() => void navigate({ search: { request: undefined } })} />}
        </>}
    </div>
}
