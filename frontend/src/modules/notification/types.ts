export interface NotificationContent {
    title?: string;
    message?: string;
    type?: string;
    url?: string;
    [key: string]: unknown;
}

export interface NotificationData {
    id: number;
    uuid: string;
    message: string;
    content: NotificationContent;
    type: string;
    created_at: string;
    read_at?: string | null;
    email_status?: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped' | 'preview';
}

export interface NotificationPreferences {
    email_notifications_enabled: boolean;
    preferred_language: 'tr' | 'en';
}

export interface UnreadCountResponse {
    unread_count: number;
}

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}
