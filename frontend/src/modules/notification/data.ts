import api from '@/api/client';
import type { NotificationData, UnreadCountResponse, PaginatedResponse } from './types';

export const NOTIFICATION_API = {
    getUnreadCount: async () => {
        const res = await api.get<UnreadCountResponse>('/api/notifications/unread_count/');
        return res.data;
    },

    getRecent: async (limit = 10) => {
        const res = await api.get<PaginatedResponse<NotificationData> | NotificationData[]>(`/api/notifications/?limit=${limit}`);
        const data = res.data;
        return Array.isArray(data) ? data : data.results;
    },

    list: async (params?: any) => {
        const res = await api.get<PaginatedResponse<NotificationData> | NotificationData[]>('/api/notifications/', { params });
        const data = res.data;
        return Array.isArray(data) ? data : data.results;
    },

    markAsRead: async (id: number) => {
        await api.post(`/api/notifications/${id}/mark_as_read/`);
    },

    markAllAsRead: async () => {
        await api.post('/api/notifications/mark_all_as_read/');
    },

    clearAll: async () => {
        await api.post('/api/notifications/clear_all/');
    },

    delete: async (id: number) => {
        await api.delete(`/api/notifications/${id}/`);
    },
};
