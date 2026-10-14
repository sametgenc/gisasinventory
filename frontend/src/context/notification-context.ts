import { createContext, useContext } from 'react'
import type { NotificationData } from '@/modules/notification/types'

interface NotificationContextType {
    lastNotification: NotificationData | null
    recentNotifications: NotificationData[]
    unreadCount: number
    isConnected: boolean
    refreshNotifications: () => Promise<void>
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function useNotificationContext() {
    const context = useContext(NotificationContext)
    if (!context) throw new Error('useNotificationContext must be used within a NotificationProvider')
    return context
}
