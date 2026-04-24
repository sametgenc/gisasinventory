import api from '@/api/client';
import type {
    PlatformRelease,
    PlatformReleaseAttachment,
    PlatformReleaseInput,
} from './types';

const BASE = '/api/platform-releases';

export const platformReleasesApi = {
    list: async (): Promise<PlatformRelease[]> => {
        const res = await api.get(`${BASE}/`);
        return res.data;
    },

    listPublic: async (): Promise<PlatformRelease[]> => {
        const res = await api.get(`${BASE}/public/`);
        return res.data;
    },

    get: async (id: string): Promise<PlatformRelease> => {
        const res = await api.get(`${BASE}/${id}/`);
        return res.data;
    },

    create: async (data: PlatformReleaseInput): Promise<PlatformRelease> => {
        const res = await api.post(`${BASE}/`, data);
        return res.data;
    },

    update: async (
        id: string,
        data: Partial<PlatformReleaseInput>,
    ): Promise<PlatformRelease> => {
        const res = await api.patch(`${BASE}/${id}/`, data);
        return res.data;
    },

    delete: async (id: string): Promise<void> => {
        await api.delete(`${BASE}/${id}/`);
    },

    publish: async (id: string): Promise<PlatformRelease> => {
        const res = await api.post(`${BASE}/${id}/publish/`);
        return res.data;
    },

    unpublish: async (id: string): Promise<PlatformRelease> => {
        const res = await api.post(`${BASE}/${id}/unpublish/`);
        return res.data;
    },

    uploadAttachments: async (
        id: string,
        files: File[],
    ): Promise<PlatformReleaseAttachment[]> => {
        const formData = new FormData();
        for (const f of files) formData.append('files', f);
        const res = await api.post(`${BASE}/${id}/attachments/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data;
    },

    deleteAttachment: async (
        releaseId: string,
        attachmentId: string,
    ): Promise<void> => {
        await api.delete(`${BASE}/${releaseId}/attachments/${attachmentId}/`);
    },
};
