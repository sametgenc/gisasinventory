import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_secured/platform/tenants')({
    component: () => <Outlet />,
})
