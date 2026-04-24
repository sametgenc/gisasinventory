import api from '@/api/client';
import type { Tenant, TenantCreateInput, TenantUpdateInput, TenantUser, UserCreateInput } from './types';

export interface BulkImportResult {
    message: string;
    success_count: number;
    error_count: number;
    errors: { row: number; errors: string[] }[];
}

// API functions for tenants
export const tenantsApi = {
    // Get all tenants
    list: async (): Promise<Tenant[]> => {
        const response = await api.get('/api/tenants/');
        return response.data;
    },

    // Get tenant by slug
    get: async (slug: string): Promise<Tenant> => {
        const response = await api.get(`/api/tenants/${slug}/`);
        return response.data;
    },

    // Get current user's tenant
    getCurrent: async (): Promise<Tenant> => {
        const response = await api.get('/api/tenants/current/');
        return response.data;
    },

    // Create a new tenant
    create: async (data: TenantCreateInput): Promise<Tenant> => {
        const response = await api.post('/api/tenants/', data);
        return response.data;
    },

    // Update a tenant
    update: async (slug: string, data: TenantUpdateInput): Promise<Tenant> => {
        const response = await api.patch(`/api/tenants/${slug}/`, data);
        return response.data;
    },

    // Delete a tenant
    delete: async (slug: string): Promise<void> => {
        await api.delete(`/api/tenants/${slug}/`);
    },

    // Get users in a tenant
    getUsers: async (slug: string): Promise<TenantUser[]> => {
        const response = await api.get(`/api/tenants/${slug}/users/`);
        return response.data;
    },

    // Get available users
    getAvailableUsers: async (): Promise<TenantUser[]> => {
        const response = await api.get('/api/tenants/available-users/');
        return response.data;
    },

    // Assign user to tenant
    assignUser: async (slug: string, userId: number): Promise<void> => {
        await api.post(`/api/tenants/${slug}/assign-user/`, { user_id: userId });
    },

    // Remove user from tenant
    removeUser: async (slug: string, userId: number): Promise<void> => {
        await api.post(`/api/tenants/${slug}/remove-user/`, { user_id: userId });
    },

    // Create user in tenant
    createUser: async (slug: string, data: UserCreateInput): Promise<TenantUser> => {
        const response = await api.post(`/api/tenants/${slug}/create-user/`, data);
        return response.data;
    },

    // Create unassigned user
    createUnassignedUser: async (data: UserCreateInput): Promise<TenantUser> => {
        const response = await api.post('/api/tenants/create-user-unassigned/', data);
        return response.data;
    },

    // Get all users (platform admin)
    getAllUsers: async (): Promise<TenantUser[]> => {
        const response = await api.get('/api/tenants/all-users/');
        return response.data;
    },

    // Get current tenant's users (tenant admin)
    getMyUsers: async (): Promise<TenantUser[]> => {
        const response = await api.get('/api/tenants/my-users/');
        return response.data;
    },

    // Update user role
    updateUserRole: async (userId: number, role: string): Promise<TenantUser> => {
        const response = await api.patch(`/api/tenants/update-user-role/${userId}/`, { role });
        return response.data;
    },

    // Partial user update (role, is_active, password, name, email)
    updateUser: async (
        userId: number,
        data: Partial<{
            first_name: string;
            last_name: string;
            email: string;
            is_active: boolean;
            role: string;
            password: string;
        }>,
    ): Promise<TenantUser> => {
        const response = await api.patch(`/api/tenants/update-user/${userId}/`, data);
        return response.data;
    },

    // ============ BULK IMPORT/EXPORT ============

    // Download tenant template
    downloadTenantsTemplate: async (): Promise<Blob> => {
        const response = await api.get('/api/tenants/export-tenants-template/', {
            responseType: 'blob'
        });
        return response.data;
    },

    // Download users template
    downloadUsersTemplate: async (): Promise<Blob> => {
        const response = await api.get('/api/tenants/export-users-template/', {
            responseType: 'blob'
        });
        return response.data;
    },

    // Bulk import tenants
    bulkImportTenants: async (file: File): Promise<BulkImportResult> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/api/tenants/bulk-import-tenants/', formData);
        return response.data;
    },

    // Bulk import users
    bulkImportUsers: async (file: File): Promise<BulkImportResult> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/api/tenants/bulk-import-users/', formData);
        return response.data;
    },

    // Export tenants
    exportTenants: async (): Promise<Blob> => {
        const response = await api.get('/api/tenants/export-tenants/', {
            responseType: 'blob'
        });
        return response.data;
    },

    // Export users
    exportUsers: async (): Promise<Blob> => {
        const response = await api.get('/api/tenants/export-users/', {
            responseType: 'blob'
        });
        return response.data;
    },
};

