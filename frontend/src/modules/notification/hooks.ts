import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NOTIFICATION_API } from './data';
import { notificationKeys } from './keys';
import { useAuth } from '@/auth/context';
import type { NotificationData } from './types';

export function useUnreadCountQuery() {
    const { user } = useAuth();
    return useQuery({
        queryKey: notificationKeys.unreadCount(),
        queryFn: NOTIFICATION_API.getUnreadCount,
        enabled: !!user,
        staleTime: 30000, // 30 seconds
    });
}

export function useRecentNotificationsQuery(limit = 10) {
    const { user } = useAuth();
    return useQuery({
        queryKey: notificationKeys.recent(),
        queryFn: () => NOTIFICATION_API.getRecent(limit),
        enabled: !!user,
        staleTime: 60000, // 1 minute
    });
}

export function useNotificationsQuery(params?: any) {
    const { user } = useAuth();
    return useQuery({
        queryKey: notificationKeys.list(params),
        queryFn: () => NOTIFICATION_API.list(params),
        enabled: !!user,
        staleTime: 60000,
    });
}

export function useNotificationMutations() {
    const queryClient = useQueryClient();

    const markAsRead = useMutation({
        mutationFn: NOTIFICATION_API.markAsRead,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        },
    });

    const markAllAsRead = useMutation({
        mutationFn: NOTIFICATION_API.markAllAsRead,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        },
    });

    const clearAll = useMutation({
        mutationFn: NOTIFICATION_API.clearAll,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        },
    });

    const deleteNotification = useMutation({
        mutationFn: NOTIFICATION_API.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        },
    });

    return { markAsRead, markAllAsRead, clearAll, deleteNotification };
}

export function useNotificationSSE() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [isConnected, setIsConnected] = useState(false);
    const [lastNotification, setLastNotification] = useState<NotificationData | null>(null);
    const [retryAttempt, setRetryAttempt] = useState(0);
    const activeRef = useRef(false);

    useEffect(() => {
        if (!user) {
            setIsConnected(false);
            return;
        }

        activeRef.current = true;
        let isAborted = false;

        const protocol = window.location.protocol;
        const host = window.location.host;
        const eventSource = new EventSource(`${protocol}//${host}/api/notifications/stream/`, { withCredentials: true });

        console.log(`SSE: Initializing connection (Attempt ${retryAttempt + 1})...`);

        eventSource.onopen = () => {
            console.log('SSE: Connected');
            setIsConnected(true);
            setRetryAttempt(0);
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('SSE: Notification received:', data);

                if (data.type !== 'silent' && data.type !== 'ping') {
                    // Invalidate everything under 'notifications' key
                    // This includes unreadCount, lists, details, etc.
                    queryClient.invalidateQueries({ queryKey: notificationKeys.all });
                }

                setLastNotification(data);

                // We can also opt to manually update the cache here if we want to avoid ANY request
                // but invalidating is safer and TanStack Query will handle the refetch efficiently.
            } catch (error) {
                console.error('SSE: Error parsing notification:', error);
            }
        };

        eventSource.onerror = () => {
            if (eventSource.readyState === EventSource.CLOSED) {
                console.warn('SSE: Connection closed. Scheduling retry...');
                setIsConnected(false);
                eventSource.close();

                if (!isAborted && activeRef.current) {
                    const delay = Math.min(1000 * Math.pow(2, retryAttempt), 30000);
                    setTimeout(() => {
                        if (!isAborted && activeRef.current) setRetryAttempt(prev => prev + 1);
                    }, delay);
                }
            }
        };

        return () => {
            isAborted = true;
            activeRef.current = false;
            eventSource.close();
            setIsConnected(false);
        };
    }, [user, retryAttempt, queryClient]);

    return { isConnected, lastNotification };
}
