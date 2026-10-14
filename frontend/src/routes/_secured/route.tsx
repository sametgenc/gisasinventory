import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/auth/context'
import type { RouterContext } from '../__root'
import { useEffect, useRef } from 'react'


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
    const navigate = useNavigate()
    // Keep the protected destination stable while the login navigation resolves.
    const redirectDestination = useRef(location.href)
    useEffect(() => {
        if (user && !location.pathname.startsWith('/login')) redirectDestination.current = location.href
    }, [user, location.href, location.pathname])
    useEffect(() => {
        if (!loading && !user) void navigate({ to: '/login', search: { redirect: redirectDestination.current }, replace: true })
    }, [loading, user, navigate])
    if (loading || !user) return null
    return <Outlet />
}
