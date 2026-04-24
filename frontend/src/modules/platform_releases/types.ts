export type PlatformReleaseType =
    | 'feature'
    | 'bugfix'
    | 'improvement'
    | 'announcement';

export type PlatformReleaseStatus = 'draft' | 'published';

export interface PlatformReleaseAttachment {
    id: string;
    original_name: string;
    size: number;
    content_type: string;
    url: string | null;
    uploaded_at: string;
}

export interface PlatformRelease {
    id: string;
    version: string;
    type: PlatformReleaseType;
    title: string;
    body: string;
    status: PlatformReleaseStatus;
    published_at: string | null;
    created_by: number | null;
    created_by_email: string | null;
    created_at: string;
    updated_at: string;
    attachments: PlatformReleaseAttachment[];
}

export interface PlatformReleaseInput {
    version: string;
    type: PlatformReleaseType;
    title: string;
    body?: string;
    status?: PlatformReleaseStatus;
}
