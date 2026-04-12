// Tenant types for the multi-tenant system

export interface Tenant {
    id: number;
    name: string;
    slug: string;
    description: string;
    address: string;
    phone: string;
    email: string;
    is_active: boolean;
    user_count: number;
    created_at: string;
    updated_at: string;
}

export interface TenantCreateInput {
    name: string;
}

export interface TenantUpdateInput {
    name?: string;
    description?: string;
    address?: string;
    phone?: string;
    email?: string;
    is_active?: boolean;
}

export interface TenantUser {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    is_active: boolean;
    date_joined: string;
    last_login: string | null;
    tenant_name: string | null;
    tenant_slug: string | null;
}

export interface UserCreateInput {
    username: string;
    email: string;
    password: string;
    role?: string;
}
