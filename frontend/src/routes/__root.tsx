import { createRootRoute } from '@tanstack/react-router'
import type { AuthContextType } from '../auth/context'
import { RootLayout } from '../components/RootLayout'
import type { QueryClient } from '@tanstack/react-query'

export interface RouterContext {
    auth: AuthContextType
    queryClient: QueryClient
}

export const Route = createRootRoute<RouterContext>({
    component: RootLayout
})
