import type { User } from '@/modules/allauth/types'

/** Mirrors the server's global administrator boundary; a role label grants no access. */
export function isGlobalAdministrator(user: User | null | undefined): boolean {
    return !!user?.is_superuser && !user.tenant_slug && user.tenant_id == null
}
