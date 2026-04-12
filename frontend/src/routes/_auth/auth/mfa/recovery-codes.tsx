import { createFileRoute, redirect } from '@tanstack/react-router'
import { RecoveryCodes } from '@/modules/allauth/mfa/RecoveryCodes'
import { ALLAUTH_API } from '@/modules/allauth/data'

export const Route = createFileRoute('/_auth/auth/mfa/recovery-codes')({
    component: RecoveryCodes,
    loader: async ({ location }) => {
        try {
            const res = await ALLAUTH_API.getRecoveryCodes()
            if (res.status === 200) {
                return { codes: res.data?.unused_codes || [] }
            } else if (res.status === 401) {
                const flows = res.data?.flows || []
                if (flows.some((f: any) => f.id === 'reauthenticate' || f.id === 'mfa_reauthenticate')) {
                    throw redirect({
                        to: '/auth/reauthenticate',
                        search: { next: location.href },
                    })
                }
            } else if (res.status === 404) {
                // MFA not enabled or no recovery codes
                throw redirect({ to: '/account/authenticators' })
            }
            return { codes: [] }
        } catch (e) {
            if (e instanceof Response || (e as any)?.isRedirect) {
                throw e
            }
            return { codes: [] }
        }
    },
})
