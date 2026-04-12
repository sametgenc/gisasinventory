import { createFileRoute, redirect } from '@tanstack/react-router'
import { ALLAUTH_API } from '@/modules/allauth/data'
import type { TOTPSetup as ITOTPSetup } from '@/modules/allauth/types'
import { TOTPSetup } from '@/modules/allauth/mfa/TOTPSetup'
import type { RouterContext } from '../../__root'

export const Route = createFileRoute('/_secured/account/totp-setup')({
    component: TOTPSetup,
    staleTime: 10000,
    beforeLoad: ({ context, location }) => {
        const auth = (context as unknown as RouterContext).auth
        if (auth?.needsReauthentication()) {
            throw redirect({
                to: '/auth/reauthenticate',
                search: { next: location.pathname }
            })
        }
    },
    loader: async ({ context }) => {
        const { queryClient } = context as unknown as RouterContext
        try {
            // Use cached authenticators if available
            const authenticators = await queryClient.ensureQueryData({
                queryKey: ['authenticators'],
                queryFn: async () => {
                    const res = await ALLAUTH_API.getAuthenticators()
                    return (res.status === 200 && Array.isArray(res.data)) ? res.data : []
                },
                staleTime: 10000,
            })

            const existing = authenticators.find((a: any) => a.type === 'totp')

            if (existing) {
                return {
                    mode: 'manage' as const,
                    authenticator: existing,
                    setupData: null
                }
            }

            // Only fetch setup data if no existing TOTP
            const setupRes = await ALLAUTH_API.setupTOTP()
            const data = setupRes.status === 200 ? setupRes.data : setupRes.meta

            if (data && (data as any).secret) {
                return {
                    mode: 'setup' as const,
                    authenticator: null,
                    setupData: data as unknown as ITOTPSetup
                }
            }

            return { mode: 'error' as const, setupData: null, authenticator: null }
        } catch (e) {
            console.error('Failed to load TOTP data', e)
            return { mode: 'error' as const, setupData: null, authenticator: null }
        }
    },
})
