import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetsApi } from './data';
import type { AssetTypeCreateInput, AssetCreateInput } from './types';

// Query keys
export const assetKeys = {
    all: ['assets'] as const,
    types: () => [...assetKeys.all, 'types'] as const,
    typeDetail: (id: string) => [...assetKeys.all, 'types', id] as const,
    items: () => [...assetKeys.all, 'items'] as const,
    itemsByType: (typeId: string) => [...assetKeys.all, 'items', 'byType', typeId] as const,
    itemDetail: (id: string) => [...assetKeys.all, 'items', id] as const,
};

// Asset Type Hooks
export function useAssetTypes() {
    return useQuery({
        queryKey: assetKeys.types(),
        queryFn: assetsApi.listTypes,
    });
}

export function useAssetType(id: string) {
    return useQuery({
        queryKey: assetKeys.typeDetail(id),
        queryFn: () => assetsApi.getType(id),
        enabled: !!id,
    });
}

export function useCreateAssetType() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: AssetTypeCreateInput) => assetsApi.createType(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: assetKeys.types() });
        },
    });
}

export function useUpdateAssetType() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<AssetTypeCreateInput> }) =>
            assetsApi.updateType(id, data),
        onSuccess: (_data, { id }) => {
            queryClient.invalidateQueries({ queryKey: assetKeys.types() });
            queryClient.invalidateQueries({ queryKey: assetKeys.typeDetail(id) });
        },
    });
}

export function useDeleteAssetType() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => assetsApi.deleteType(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: assetKeys.types() });
        },
    });
}

// Asset Hooks
export function useAssets(assetTypeId?: string) {
    return useQuery({
        queryKey: assetTypeId ? assetKeys.itemsByType(assetTypeId) : assetKeys.items(),
        queryFn: () => assetsApi.listAssets(assetTypeId),
    });
}

export function useAsset(id: string) {
    return useQuery({
        queryKey: assetKeys.itemDetail(id),
        queryFn: () => assetsApi.getAsset(id),
        enabled: !!id,
    });
}

export function useCreateAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: AssetCreateInput) => assetsApi.createAsset(data),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: assetKeys.items() });
            queryClient.invalidateQueries({ queryKey: assetKeys.itemsByType(result.asset_type) });
        },
    });
}

export function useUpdateAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<AssetCreateInput> }) =>
            assetsApi.updateAsset(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: assetKeys.items() });
        },
    });
}

export function useDeleteAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => assetsApi.deleteAsset(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: assetKeys.items() });
        },
    });
}
