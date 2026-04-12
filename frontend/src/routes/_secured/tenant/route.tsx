import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import type { RouterContext } from '../../__root'

export const Route = createFileRoute('/_secured/tenant')({
    beforeLoad: ({ context }) => {
        const auth = (context as RouterContext).auth
        const user = auth?.user
        if (!user) {
            throw redirect({ to: '/login', search: { redirect: undefined } })
        }
        const isTenantAdmin = user.role === 'tenant_admin' || user.is_superuser
        if (!isTenantAdmin) {
            throw redirect({ to: '/dashboard' })
        }
    },
    component: () => <Outlet />,
})
