import { type ReactNode } from 'react';
import {
    useUnreadCountQuery,
    useRecentNotificationsQuery,
    useNotificationSSE
} from '../modules/notification/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { notificationKeys } from '../modules/notification/keys';
import { NotificationContext } from './notification-context';

export function NotificationProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();
    const { data: unreadData } = useUnreadCountQuery();
    const { data: recentNotifications = [] } = useRecentNotificationsQuery();
    const { lastNotification, isConnected } = useNotificationSSE();

    const refreshNotifications = async () => {
        await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    };

    return (
        <NotificationContext.Provider value={{
            lastNotification,
            recentNotifications,
            unreadCount: unreadData?.unread_count ?? 0,
            isConnected,
            refreshNotifications
        }}>
            {children}
        </NotificationContext.Provider>
    );
}
