import { createFileRoute, redirect } from '@tanstack/react-router'
import { RecoveryCodes } from '@/modules/allauth/mfa/RecoveryCodes'
import { ALLAUTH_API } from '@/modules/allauth/data'

export const Route = createFileRoute('/_auth/auth/mfa/recovery-codes')({
    component: RecoveryCodes,
    loader: async ({ location }) => {
        let res
        try { res = await ALLAUTH_API.getRecoveryCodes() }
        catch { return { codes: [] as string[], loadFailed: true } }
        if (res.status === 200 && Array.isArray(res.data?.unused_codes)) return { codes: res.data.unused_codes as string[], loadFailed: false }
        if (res.status === 401 && res.data?.flows?.some(flow => flow.id === 'reauthenticate' || flow.id === 'mfa_reauthenticate')) {
            throw redirect({ to: '/auth/reauthenticate', search: { next: location.href, mfa: false } })
        }
        if (res.status === 404) throw redirect({ to: '/account/authenticators' })
        return { codes: [] as string[], loadFailed: true }
    },
})
