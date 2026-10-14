import { createFileRoute } from '@tanstack/react-router'
import { Reauthenticate } from '@/modules/allauth/mfa/Reauthenticate'
import { safeReturnPath } from '@/modules/allauth/mfa/security'

export const Route = createFileRoute('/_auth/auth/reauthenticate')({
    component: Reauthenticate,
    validateSearch: (search: Record<string, unknown>): { next: string; mfa?: boolean } => {
        return {
            next: safeReturnPath(search.next),
            mfa: search.mfa === true || search.mfa === 'true',
        }
    },
})
