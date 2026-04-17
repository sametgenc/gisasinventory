import { createFileRoute } from '@tanstack/react-router'
import {
    useNotificationsQuery,
    useNotificationMutations,
} from '../../modules/notification/hooks'
import { Bell, CheckCheck, Trash2, Clock, Inbox } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import {
    PageHeader,
    Card,
    Button,
    EmptyState,
} from '@/components/ui'

export const Route = createFileRoute('/_secured/notifications')({
    component: NotificationsPage,
})

function NotificationsPage() {
    const { data: notifications = [], isLoading: loading } = useNotificationsQuery()
    const { markAsRead, markAllAsRead, clearAll, deleteNotification } = useNotificationMutations()
    const { t } = useTranslation()

    const handleMarkAsRead = (id: number) => { void markAsRead.mutateAsync(id) }
    const handleDeleteNotification = (id: number) => { void deleteNotification.mutateAsync(id) }
    const handleClearAll = () => { void clearAll.mutateAsync() }
    const handleMarkAllAsRead = () => { void markAllAsRead.mutateAsync() }

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

            <Card className="overflow-hidden">
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
                                className={`px-5 py-4 flex gap-4 transition-colors relative group ${!notification.read_at ? 'bg-blue-50/30 dark:bg-blue-500/5' : ''}`}
                            >
                                <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${!notification.read_at ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                    <Bell size={18} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                            {notification.content?.type || 'SYSTEM'}
                                        </span>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                            <Clock size={11} />
                                            {notification.created_at ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true }) : t('notifications.justNow')}
                                        </div>
                                    </div>
                                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">
                                        {notification.content?.title || t('notifications.title')}
                                    </h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                                        {notification.content?.message || notification.message}
                                    </p>
                                </div>

                                <div className="flex-shrink-0 flex items-start gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!notification.read_at && (
                                        <button
                                            type="button"
                                            onClick={() => handleMarkAsRead(notification.id)}
                                            className="p-1.5 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                            title={t('notifications.markAsRead')}
                                        >
                                            <CheckCheck size={16} />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteNotification(notification.id)}
                                        className="p-1.5 rounded-md text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                        title={t('notifications.deleteNotification')}
                                    >
                                        <Trash2 size={16} />
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
            </Card>
        </div>
    )
}
