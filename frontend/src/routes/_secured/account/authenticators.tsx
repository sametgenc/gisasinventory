import { createFileRoute, useRouter, redirect } from '@tanstack/react-router'
import { Authenticators } from '@/modules/allauth/mfa/Authenticators'
import { ALLAUTH_API } from '@/modules/allauth/data'
import type { Authenticator } from '@/modules/allauth/types'
import type { RouterContext } from '../../__root'

export const Route = createFileRoute('/_secured/account/authenticators')({
    component: AuthenticatorsPage,
    staleTime: 10000,
    beforeLoad: ({ context, location }) => {
        const auth = (context as unknown as RouterContext).auth
        if (auth?.needsReauthentication()) throw redirect({ to: '/auth/reauthenticate', search: { next: location.pathname, mfa: false } })
    },
    loader: async ({ context }) => {
        const { queryClient } = context as unknown as RouterContext
        try {
            const data = await queryClient.ensureQueryData({
                queryKey: ['authenticators'],
                queryFn: async () => {
                    const res = await ALLAUTH_API.getAuthenticators()
                    if (res.status !== 200 || !Array.isArray(res.data)) throw new Error('authenticators_unavailable')
                    return res.data as Authenticator[]
                },
                staleTime: 10000,
            })
            return { authenticators: data, loadFailed: false }
        } catch { return { authenticators: [] as Authenticator[], loadFailed: true } }
    },
})

function AuthenticatorsPage() {
    const { authenticators, loadFailed } = Route.useLoaderData()
    const router = useRouter()
    return <Authenticators authenticators={authenticators} loadFailed={loadFailed} onUpdate={() => router.invalidate()} />
}
