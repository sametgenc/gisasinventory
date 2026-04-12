export interface NotificationContent {
    title?: string;
    message?: string;
    type?: string;
    [key: string]: any;
}

export interface NotificationData {
    id: number;
    uuid: string;
    message: string;
    content: NotificationContent;
    type: string;
    created_at: string;
    read_at?: string | null;
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
