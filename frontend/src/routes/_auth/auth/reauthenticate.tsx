import { createFileRoute } from '@tanstack/react-router'
import { Reauthenticate } from '@/modules/allauth/mfa/Reauthenticate'

export const Route = createFileRoute('/_auth/auth/reauthenticate')({
    component: Reauthenticate,
    validateSearch: (search: Record<string, unknown>) => {
        return {
            next: search.next as string | undefined,
        }
    },
})
