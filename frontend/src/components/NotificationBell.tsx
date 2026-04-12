import React, { useState, useCallback } from 'react';
import { Bell, ExternalLink, Calendar } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useNotificationContext } from '../context/NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import { useClickOutside } from '../hooks/useClickOutside';
import { useTranslation } from 'react-i18next';

export const NotificationBell: React.FC = () => {
    const { unreadCount, recentNotifications } = useNotificationContext();
    const [isOpen, setIsOpen] = useState(false);
    const { t } = useTranslation();

    const close = useCallback(() => setIsOpen(false), []);
    const ref = useClickOutside<HTMLDivElement>(close);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
                aria-label={t('notifications.title')}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-200 dark:border-slate-800 overflow-hidden animate-dropdown z-50">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('notifications.title')}</h3>
                        {unreadCount > 0 && (
                            <span className="text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                                {t('notifications.new', { count: unreadCount })}
                            </span>
                        )}
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        {recentNotifications.length > 0 ? (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {recentNotifications.map((notification, idx) => (
                                    <div
                                        key={notification.id || notification.uuid || idx}
                                        className={`px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${!notification.read_at ? 'bg-indigo-50/40 dark:bg-indigo-500/5' : ''}`}
                                    >
                                        <div className="flex gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate uppercase tracking-wider">
                                                        {notification.content?.type || notification.type || 'SYSTEM'}
                                                    </p>
                                                    <div className="flex items-center gap-1 text-slate-400 text-[10px]">
                                                        <Calendar size={10} />
                                                        {(() => {
                                                            try {
                                                                return notification.created_at
                                                                    ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
                                                                    : t('notifications.justNow');
                                                            } catch {
                                                                return t('notifications.justNow');
                                                            }
                                                        })()}
                                                    </div>
                                                </div>
                                                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed">
                                                    {notification.content?.message || notification.message}
                                                </p>
                                            </div>
                                            {!notification.read_at && (
                                                <div className="flex-shrink-0 pt-1">
                                                    <div className="h-2 w-2 rounded-full bg-indigo-500"></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="px-4 py-10 text-center">
                                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
                                    <Bell className="text-slate-300 dark:text-slate-600" size={20} />
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('notifications.allCaughtUp')}</p>
                            </div>
                        )}
                    </div>

                    <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                        <Link
                            to="/notifications"
                            onClick={close}
                            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                        >
                            {t('notifications.viewAll')}
                            <ExternalLink size={14} />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};
