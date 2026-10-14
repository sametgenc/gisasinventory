import { createFileRoute, Navigate, Outlet, redirect, useLocation } from '@tanstack/react-router'
import { useAuth } from '@/auth/context'
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
                    redirect: location.href,
                },
            })
        }
    },
    component: SecuredLayout,
})

function SecuredLayout() {
    const { user, loading } = useAuth()
    const location = useLocation()
    if (loading) return null
    if (!user) return <Navigate to="/login" search={{ redirect: location.href }} replace />
    return <Outlet />
}
