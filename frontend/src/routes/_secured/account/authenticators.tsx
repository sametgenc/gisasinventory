import { createFileRoute, useRouter, redirect } from '@tanstack/react-router'
import { Authenticators } from '@/modules/allauth/mfa/Authenticators'
import { ALLAUTH_API } from '@/modules/allauth/data'
import type { RouterContext } from '../../__root'

export const Route = createFileRoute('/_secured/account/authenticators')({
    component: AuthenticatorsPage,
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
            const data = await queryClient.ensureQueryData({
                queryKey: ['authenticators'],
                queryFn: async () => {
                    const res = await ALLAUTH_API.getAuthenticators()
                    if (res.status === 200 && Array.isArray(res.data)) {
                        return res.data
                    }
                    return []
                },
                staleTime: 10000,
            })
            return { authenticators: data }
        } catch (e) {
            console.error('Failed to load authenticators', e)
            return { authenticators: [] }
        }
    },
})

function AuthenticatorsPage() {
    const { authenticators } = Route.useLoaderData()
    const router = useRouter()

    const handleUpdate = () => {
        router.invalidate()
    }

    return <Authenticators authenticators={authenticators} onUpdate={handleUpdate} />
}
