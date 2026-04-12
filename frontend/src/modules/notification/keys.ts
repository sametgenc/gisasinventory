export const notificationKeys = {
    all: ['notifications'] as const,
    lists: () => [...notificationKeys.all, 'lists'] as const,
    list: (filters: any) => [...notificationKeys.lists(), filters] as const,
    details: () => [...notificationKeys.all, 'details'] as const,
    detail: (id: number | string) => [...notificationKeys.details(), id] as const,
    unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
    recent: () => [...notificationKeys.all, 'recent'] as const,
};
