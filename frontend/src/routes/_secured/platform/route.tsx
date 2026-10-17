import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import type { RouterContext } from '../../__root'
import { isGlobalAdministrator } from '@/auth/permissions'

export const Route = createFileRoute('/_secured/platform')({
    beforeLoad: ({ context }) => {
        const auth = (context as RouterContext).auth
        // Only allow platform admins (superusers) to access admin routes
        if (!isGlobalAdministrator(auth?.user)) {
            throw redirect({ to: '/dashboard' })
        }
    },
    component: () => <Outlet />,
})
