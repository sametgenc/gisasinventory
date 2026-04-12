import { createFileRoute } from '@tanstack/react-router';
import {
    useNotificationsQuery,
    useNotificationMutations
} from '../../modules/notification/hooks';
import { Bell, CheckCheck, Trash2, Clock, Inbox } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_secured/notifications')({
    component: NotificationsPage,
});

function NotificationsPage() {
    const { data: notifications = [], isLoading: loading } = useNotificationsQuery();
    const { markAsRead, markAllAsRead, clearAll, deleteNotification } = useNotificationMutations();
    const { t } = useTranslation();

    const handleMarkAsRead = async (id: number) => {
        try {
            await markAsRead.mutateAsync(id);
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    const handleDeleteNotification = async (id: number) => {
        try {
            await deleteNotification.mutateAsync(id);
        } catch (error) {
            console.error('Failed to delete notification:', error);
        }
    };

    const handleClearAll = async () => {
        try {
            await clearAll.mutateAsync();
        } catch (error) {
            console.error('Failed to clear all notifications:', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await markAllAsRead.mutateAsync();
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    return (
        <div className="w-full min-w-0 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Bell className="text-indigo-500" size={24} />
                        {t('notifications.title')}
                    </h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400 text-sm">{t('notifications.subtitle')}</p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleMarkAllAsRead}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        <CheckCheck size={16} className="text-indigo-500" />
                        {t('notifications.markAllRead')}
                    </button>
                    <button
                        onClick={handleClearAll}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                    >
                        <Trash2 size={16} />
                        {t('notifications.clearAll')}
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {loading ? (
                    <div className="py-16 flex flex-col items-center justify-center space-y-3">
                        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-slate-400">{t('notifications.loading')}</p>
                    </div>
                ) : notifications.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {notifications.map((notification) => (
                            <div
                                key={notification.id || notification.uuid}
                                className={`px-5 py-4 flex gap-4 transition-colors relative group ${!notification.read_at ? 'bg-indigo-50/30 dark:bg-indigo-500/5' : ''}`}
                            >
                                <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${!notification.read_at ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                    <Bell size={18} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
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
                                            onClick={() => handleMarkAsRead(notification.id)}
                                            className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                                            title={t('notifications.markAsRead')}
                                        >
                                            <CheckCheck size={16} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDeleteNotification(notification.id)}
                                        className="p-1.5 rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                        title={t('notifications.deleteNotification')}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-20 text-center">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 mb-4">
                            <Inbox className="text-slate-300 dark:text-slate-600" size={28} />
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">{t('notifications.noNotifications')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">{t('notifications.emptyMessage')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
