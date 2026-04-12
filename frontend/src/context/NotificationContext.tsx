import { createContext, useContext, type ReactNode } from 'react';
import {
    useUnreadCountQuery,
    useRecentNotificationsQuery,
    useNotificationSSE
} from '../modules/notification/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { notificationKeys } from '../modules/notification/keys';

interface NotificationContextType {
    lastNotification: any;
    recentNotifications: any[];
    unreadCount: number;
    isConnected: boolean;
    refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

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

export function useNotificationContext() {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotificationContext must be used within a NotificationProvider');
    }
    return context;
}
