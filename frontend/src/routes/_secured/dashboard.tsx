import { createFileRoute } from '@tanstack/react-router'
import { OverviewDashboard } from '@/components/OverviewDashboard'

export const Route = createFileRoute('/_secured/dashboard')({ component: OverviewDashboard })
