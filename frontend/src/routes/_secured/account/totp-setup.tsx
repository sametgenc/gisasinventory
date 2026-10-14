import { createFileRoute, redirect } from '@tanstack/react-router'
import { ALLAUTH_API } from '@/modules/allauth/data'
import type { Authenticator } from '@/modules/allauth/types'
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
            const authenticators = await queryClient.ensureQueryData({
                queryKey: ['authenticators'],
                queryFn: async () => {
                    const res = await ALLAUTH_API.getAuthenticators()
                    if (res.status !== 200 || !Array.isArray(res.data)) throw new Error('authenticators_unavailable')
                    return res.data as Authenticator[]
                },
                staleTime: 10000,
            })

            const existing = authenticators.find(a => a.type === 'totp')

            if (existing) {
                return {
                    mode: 'manage' as const,
                    authenticator: existing,
                    setupData: null
                }
            }

            // Only fetch setup data if no existing TOTP
            const setupRes = await ALLAUTH_API.setupTOTP()
            const data = (setupRes.status === 200 ? setupRes.data : setupRes.meta) as Record<string, unknown> | undefined

            if (data && typeof data.secret === 'string' && typeof data.totp_url === 'string' && data.secret && data.totp_url.startsWith('otpauth://')) {
                return {
                    mode: 'setup' as const,
                    authenticator: null,
                    setupData: { secret: data.secret, totp_url: data.totp_url }
                }
            }

            return { mode: 'error' as const, setupData: null, authenticator: null }
        } catch {
            return { mode: 'error' as const, setupData: null, authenticator: null }
        }
    },
})
