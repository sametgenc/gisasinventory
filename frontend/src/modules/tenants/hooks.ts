import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantsApi } from './data';
import type { TenantCreateInput, TenantUpdateInput, UserCreateInput } from './types';

// Query keys
export const tenantKeys = {
    all: ['tenants'] as const,
    list: () => [...tenantKeys.all, 'list'] as const,
    detail: (slug: string) => [...tenantKeys.all, 'detail', slug] as const,
    current: () => [...tenantKeys.all, 'current'] as const,
    users: (slug: string) => [...tenantKeys.all, 'users', slug] as const,
    availableUsers: () => [...tenantKeys.all, 'available-users'] as const,
    allUsers: () => [...tenantKeys.all, 'all-users'] as const,
    myUsers: () => [...tenantKeys.all, 'my-users'] as const,
};

// Hooks
export function useTenants() {
    return useQuery({
        queryKey: tenantKeys.list(),
        queryFn: tenantsApi.list,
    });
}

export function useTenant(slug: string) {
    return useQuery({
        queryKey: tenantKeys.detail(slug),
        queryFn: () => tenantsApi.get(slug),
        enabled: !!slug,
    });
}

export function useCurrentTenant() {
    return useQuery({
        queryKey: tenantKeys.current(),
        queryFn: tenantsApi.getCurrent,
    });
}

export function useTenantUsers(slug: string) {
    return useQuery({
        queryKey: tenantKeys.users(slug),
        queryFn: () => tenantsApi.getUsers(slug),
        enabled: !!slug,
    });
}

export function useAvailableUsers() {
    return useQuery({
        queryKey: tenantKeys.availableUsers(),
        queryFn: tenantsApi.getAvailableUsers,
    });
}

export function useCreateTenant() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: TenantCreateInput) => tenantsApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
        },
    });
}

export function useUpdateTenant() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ slug, data }: { slug: string; data: TenantUpdateInput }) =>
            tenantsApi.update(slug, data),
        onSuccess: (_data, { slug }) => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.detail(slug) });
        },
    });
}

export function useDeleteTenant() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (slug: string) => tenantsApi.delete(slug),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
        },
    });
}

export function useAssignUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ slug, userId }: { slug: string; userId: number }) =>
            tenantsApi.assignUser(slug, userId),
        onSuccess: (_data, { slug }) => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.users(slug) });
            queryClient.invalidateQueries({ queryKey: tenantKeys.availableUsers() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.allUsers() });
        },
    });
}

export function useRemoveUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ slug, userId }: { slug: string; userId: number }) =>
            tenantsApi.removeUser(slug, userId),
        onSuccess: (_data, { slug }) => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.users(slug) });
            queryClient.invalidateQueries({ queryKey: tenantKeys.availableUsers() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.allUsers() });
        },
    });
}

export function useCreateUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ slug, data }: { slug: string; data: UserCreateInput }) =>
            tenantsApi.createUser(slug, data),
        onSuccess: (_data, { slug }) => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.users(slug) });
            queryClient.invalidateQueries({ queryKey: tenantKeys.list() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.allUsers() });
        },
    });
}

export function useCreateUnassignedUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: UserCreateInput) => tenantsApi.createUnassignedUser(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.availableUsers() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.allUsers() });
        },
    });
}

export function useAllUsers() {
    return useQuery({
        queryKey: tenantKeys.allUsers(),
        queryFn: tenantsApi.getAllUsers,
    });
}

export function useMyUsers() {
    return useQuery({
        queryKey: tenantKeys.myUsers(),
        queryFn: tenantsApi.getMyUsers,
    });
}

export function useUpdateUserRole() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ userId, role }: { userId: number; role: string }) =>
            tenantsApi.updateUserRole(userId, role),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.allUsers() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.myUsers() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.all });
        },
    });
}

export type UpdateUserInput = Partial<{
    first_name: string;
    last_name: string;
    email: string;
    is_active: boolean;
    role: string;
    password: string;
}>;

export function useUpdateUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ userId, data }: { userId: number; data: UpdateUserInput }) =>
            tenantsApi.updateUser(userId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantKeys.allUsers() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.myUsers() });
            queryClient.invalidateQueries({ queryKey: tenantKeys.all });
        },
    });
}
