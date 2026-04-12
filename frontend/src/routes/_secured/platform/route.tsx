import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import type { RouterContext } from '../../__root'

export const Route = createFileRoute('/_secured/platform')({
    beforeLoad: ({ context }) => {
        const auth = (context as RouterContext).auth
        // Only allow platform admins (superusers) to access admin routes
        if (!auth?.user?.is_superuser) {
            throw redirect({ to: '/dashboard' })
        }
    },
    component: () => <Outlet />,
})
