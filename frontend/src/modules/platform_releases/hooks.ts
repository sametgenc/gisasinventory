import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformReleasesApi } from './data';
import type { PlatformReleaseInput } from './types';

export const platformReleaseKeys = {
    all: ['platform-releases'] as const,
    list: () => [...platformReleaseKeys.all, 'list'] as const,
    publicList: () => [...platformReleaseKeys.all, 'public'] as const,
    detail: (id: string) => [...platformReleaseKeys.all, 'detail', id] as const,
};

export function usePlatformReleases() {
    return useQuery({
        queryKey: platformReleaseKeys.list(),
        queryFn: platformReleasesApi.list,
    });
}

export function usePublicPlatformReleases() {
    return useQuery({
        queryKey: platformReleaseKeys.publicList(),
        queryFn: platformReleasesApi.listPublic,
    });
}

export function useCreatePlatformRelease() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: PlatformReleaseInput) => platformReleasesApi.create(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: platformReleaseKeys.all });
        },
    });
}

export function useUpdatePlatformRelease() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<PlatformReleaseInput> }) =>
            platformReleasesApi.update(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: platformReleaseKeys.all });
        },
    });
}

export function useDeletePlatformRelease() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => platformReleasesApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: platformReleaseKeys.all });
        },
    });
}

export function usePublishPlatformRelease() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => platformReleasesApi.publish(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: platformReleaseKeys.all });
        },
    });
}

export function useUnpublishPlatformRelease() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => platformReleasesApi.unpublish(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: platformReleaseKeys.all });
        },
    });
}

export function useUploadPlatformReleaseAttachments() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, files }: { id: string; files: File[] }) =>
            platformReleasesApi.uploadAttachments(id, files),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: platformReleaseKeys.all });
        },
    });
}

export function useDeletePlatformReleaseAttachment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ releaseId, attachmentId }: { releaseId: string; attachmentId: string }) =>
            platformReleasesApi.deleteAttachment(releaseId, attachmentId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: platformReleaseKeys.all });
        },
    });
}
