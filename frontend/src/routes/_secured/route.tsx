import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import type { RouterContext } from '../__root'


export const Route = createFileRoute('/_secured')({
    beforeLoad: ({ context, location }) => {
        const auth = (context as RouterContext).auth
        if (auth?.loading) {
            return
        }
        if (!auth?.user) {
            throw redirect({
                to: '/login',
                search: {
                    redirect: location.pathname,
                },
            })
        }
    },
    component: () => (
        <Outlet />
    ),
})

