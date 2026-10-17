import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import type { RouterContext } from '../../__root'
import { isGlobalAdministrator } from '@/auth/permissions'

export const Route = createFileRoute('/_secured/tenant')({
    beforeLoad: ({ context }) => {
        const auth = (context as RouterContext).auth
        const user = auth?.user
        if (!user) {
            throw redirect({ to: '/login', search: { redirect: undefined } })
        }
        const isTenantAdmin = isGlobalAdministrator(user) || (user.role === 'tenant_admin' && !!(user.tenant_slug || user.tenant_id))
        if (!isTenantAdmin) {
            throw redirect({ to: '/dashboard' })
        }
    },
    component: () => <Outlet />,
})
