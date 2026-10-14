import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { getApiErrorMessage } from '@/api/errors'
import {
    useNotificationsQuery,
    useNotificationMutations,
    useNotificationPreferences,
} from '../../modules/notification/hooks'
import { Bell, CheckCheck, Trash2, Clock, Inbox, FileText } from 'lucide-react'
import { exportReport } from '@/utils/report'
import { notificationPath, notificationTime } from '@/modules/notification/presentation'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
    PageHeader,
    Card,
    Button,
    EmptyState,
    Pagination,
} from '@/components/ui'

export const Route = createFileRoute('/_secured/notifications')({
    component: NotificationsPage,
})

function NotificationsPage() {
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const { data, isLoading: loading, isFetching, error } = useNotificationsQuery({ limit: pageSize, offset: (page - 1) * pageSize })
    const notifications = data?.results ?? []
    const { markAsRead, markAllAsRead, clearAll, deleteNotification } = useNotificationMutations()
    const { t, i18n } = useTranslation()
    const preferences = useNotificationPreferences()

    const handleMarkAsRead = (id: number) => { markAsRead.mutate(id) }
    const handleDeleteNotification = (id: number) => {
        deleteNotification.mutate(id, { onSuccess: () => {
            if (notifications.length === 1 && page > 1) setPage(page - 1)
        } })
    }
    const handleClearAll = () => { clearAll.mutate(undefined, { onSuccess: () => setPage(1) }) }
    const handleMarkAllAsRead = () => { markAllAsRead.mutate() }
    const requestError = error || markAsRead.error || deleteNotification.error || clearAll.error || markAllAsRead.error
    const lastPage = Math.max(1, Math.ceil((data?.count ?? 0) / pageSize))
    const paginationDisabled = isFetching || markAsRead.isPending || markAllAsRead.isPending || clearAll.isPending || deleteNotification.isPending

    if (!loading && data && page > lastPage) setPage(lastPage)

    return (
        <div className="w-full min-w-0 space-y-6">
            <PageHeader
                icon={<Bell size={22} />}
                title={t('notifications.title')}
                subtitle={t('notifications.subtitle')}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={<FileText size={16} />}
                            disabled={notifications.length === 0}
                            title={t('common.exportCurrentPage')}
                            onClick={() => exportReport(
                                notifications,
                                [
                                    { header: t('common.type'), value: (n) => n.content?.type || 'SYSTEM' },
                                    { header: t('notifications.title'), value: (n) => n.content?.title ?? '' },
                                    { header: t('common.description'), value: (n) => n.content?.message ?? n.message ?? '' },
                                    { header: t('common.status'), value: (n) => n.read_at ? t('common.active') : t('common.inactive') },
                                    { header: t('common.createdAt'), value: (n) => n.created_at ? new Date(n.created_at).toLocaleString() : '' },
                                ],
                                'notifications_report',
                            )}
                        >
                            {t('common.exportCurrentPage')}
                        </Button>
                        <Button
                            variant="secondary"
                            icon={<CheckCheck size={16} className="text-blue-500" />}
                            onClick={handleMarkAllAsRead}
                            loading={markAllAsRead.isPending}
                        >
                            {t('notifications.markAllRead')}
                        </Button>
                        <Button
                            variant="danger"
                            icon={<Trash2 size={16} />}
                            onClick={handleClearAll}
                            loading={clearAll.isPending}
                        >
                            {t('notifications.clearAll')}
                        </Button>
                    </>
                }
            />

            <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={t('notifications.emailPreference')}>
                {preferences.query.isError ? <div role="alert" className="text-sm text-red-600 dark:text-red-300"><p>{t('notifications.preferencesFailed')}</p><Button variant="ghost" size="sm" onClick={() => void preferences.query.refetch()}>{t('catalog.retry')}</Button></div> : <label className="flex items-start gap-3">
                    <input type="checkbox" checked={preferences.query.data?.email_notifications_enabled ?? false} disabled={preferences.query.isLoading || preferences.update.isPending} onChange={event => preferences.update.mutate({ email_notifications_enabled: event.target.checked })} className="mt-1 h-4 w-4 shrink-0 accent-blue-700" />
                    <span className="min-w-0"><span className="block text-sm font-medium text-slate-900 dark:text-white">{t('notifications.emailPreference')}</span><span className="mt-1 block text-sm leading-5 text-slate-500 dark:text-slate-400">{t('notifications.emailPreferenceHelp')}</span></span>
                </label>}
                {preferences.update.isError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-300">{t('notifications.actionFailed')}</p>}
            </section>

            <Card className="overflow-hidden">
                {requestError && <p role="alert" className="p-4 text-red-600 dark:text-red-400">{getApiErrorMessage(requestError)}</p>}
                {loading ? (
                    <div className="py-16 flex flex-col items-center justify-center space-y-3">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-slate-400">{t('notifications.loading')}</p>
                    </div>
                ) : notifications.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {notifications.map((notification) => (
                            <div
                                key={notification.id || notification.uuid}
                                className={`px-4 py-4 flex flex-wrap gap-3 transition-colors relative group sm:px-5 ${!notification.read_at ? 'bg-blue-50/30 dark:bg-blue-500/5' : ''}`}
                            >
                                <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${!notification.read_at ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                    <Bell size={18} />
                                </div>

                                <div className="flex-1 min-w-0 basis-[65%]">
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                            {notification.content?.type || 'SYSTEM'}
                                        </span>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                            <Clock size={11} />
                                            {notificationTime(notification.created_at, i18n.language, t('notifications.justNow'))}
                                        </div>
                                    </div>
                                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">
                                        {notification.content?.title || t('notifications.title')}
                                    </h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                                        {notification.content?.message || notification.message}
                                    </p>
                                    {notification.email_status && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('notifications.emailStatusLabel')}: {t(`notifications.emailStatuses.${notification.email_status}`)}</p>}
                                    <Link to={notificationPath(notification)} className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline dark:text-blue-300">{t('notifications.openRelated')}</Link>
                                </div>

                                <div className="flex w-full flex-wrap items-start justify-end gap-2 sm:w-auto">
                                    {!notification.read_at && (
                                        <button
                                            type="button"
                                            onClick={() => handleMarkAsRead(notification.id)}
                                            disabled={markAsRead.isPending}
                                            aria-label={`${t('notifications.markAsRead')}: ${notification.content?.title || t('notifications.title')}`}
                                            className="p-1.5 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                            title={t('notifications.markAsRead')}
                                        >
                                            <CheckCheck size={16} className="inline-block" /> <span className="ml-1 text-xs">{t('notifications.markAsRead')}</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteNotification(notification.id)}
                                        disabled={deleteNotification.isPending}
                                        aria-label={`${t('notifications.deleteNotification')}: ${notification.content?.title || t('notifications.title')}`}
                                        className="p-1.5 rounded-md text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                        title={t('notifications.deleteNotification')}
                                    >
                                        <Trash2 size={16} className="inline-block" /> <span className="ml-1 text-xs">{t('common.delete')}</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon={<Inbox size={40} />}
                        title={t('notifications.noNotifications')}
                        description={t('notifications.emptyMessage')}
                    />
                )}
                <Pagination page={page} pageSize={pageSize} totalItems={data?.count ?? 0} onPageChange={setPage}
                    pageSizeOptions={[10, 25, 50, 100]} onPageSizeChange={setPageSize}
                    itemLabel={t('pagination.notifications')} disabled={paginationDisabled} />
            </Card>
        </div>
    )
}
