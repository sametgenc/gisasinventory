import { useState, useCallback, useRef, useEffect, useId, type CSSProperties } from 'react'
import { Bell, ArrowRight } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useNotificationContext } from '../context/notification-context'
import { useNotificationMutations } from '@/modules/notification/hooks'
import { notificationPath, notificationTime } from '@/modules/notification/presentation'
import type { NotificationData } from '@/modules/notification/types'
import { useClickOutside } from '../hooks/useClickOutside'
import { useTranslation } from 'react-i18next'

export function NotificationBell() {
    const { unreadCount, recentNotifications } = useNotificationContext()
    const { markAsRead } = useNotificationMutations()
    const [isOpen, setIsOpen] = useState(false)
    const [openError, setOpenError] = useState(false)
    const [position, setPosition] = useState<CSSProperties>({})
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const trigger = useRef<HTMLButtonElement>(null)
    const regionId = useId()
    const close = useCallback(() => setIsOpen(false), [])
    const ref = useClickOutside<HTMLDivElement>(close)

    useEffect(() => {
        if (!isOpen) return
        const dismiss = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); close(); trigger.current?.focus() }
        }
        document.addEventListener('keydown', dismiss)
        window.addEventListener('resize', close)
        return () => { document.removeEventListener('keydown', dismiss); window.removeEventListener('resize', close) }
    }, [isOpen, close])

    const toggle = () => {
        const bounds = trigger.current?.getBoundingClientRect()
        if (bounds) {
            const width = Math.min(384, window.innerWidth - 32)
            setPosition({ width, left: Math.max(16, Math.min(bounds.right - width, window.innerWidth - width - 16)), top: bounds.bottom + 8 })
        }
        markAsRead.reset()
        setOpenError(false)
        setIsOpen(value => !value)
    }
    const openNotification = async (notification: NotificationData) => {
        if (markAsRead.isPending) return
        try {
            if (!notification.read_at) await markAsRead.mutateAsync(notification.id)
            await navigate({ to: notificationPath(notification) })
            close()
        } catch { setOpenError(true) }
    }

    return <div className="relative" ref={ref}>
        <button type="button" ref={trigger} onClick={toggle} aria-label={t('notifications.title')} aria-expanded={isOpen} aria-controls={regionId} className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
            <Bell size={20} aria-hidden />
            {unreadCount > 0 && <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-0.5 text-[10px] font-bold text-white dark:border-slate-900">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>
        {isOpen && <section id={regionId} aria-label={t('notifications.title')} style={position} className="fixed z-50 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700"><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('notifications.title')}</h2>{unreadCount > 0 && <span className="text-xs text-slate-500">{t('notifications.new', { count: unreadCount })}</span>}</div>
            {(markAsRead.isError || openError) && <p role="alert" className="px-4 py-3 text-sm text-red-600 dark:text-red-300">{t('notifications.actionFailed')}</p>}
            <div className="max-h-[min(60dvh,24rem)] overflow-y-auto">
                {recentNotifications.length ? recentNotifications.map(notification => <button key={notification.id} type="button" disabled={markAsRead.isPending} onClick={() => void openNotification(notification)} className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:opacity-60 dark:border-slate-800 dark:hover:bg-slate-800 ${!notification.read_at ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}`}>
                    <div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-semibold leading-5 text-slate-900 dark:text-white [overflow-wrap:anywhere]">{notification.content?.title || t('notifications.title')}</p>{!notification.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600"><span className="sr-only">{t('notifications.unread')}</span></span>}</div>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600 dark:text-slate-300">{notification.content?.message || notification.message}</p>
                    <p className="mt-2 text-xs text-slate-500">{notificationTime(notification.created_at, i18n.language, t('notifications.justNow'))}</p>
                </button>) : <div className="px-4 py-8 text-center text-sm text-slate-500"><Bell size={20} className="mx-auto mb-2" aria-hidden />{t('notifications.allCaughtUp')}</div>}
            </div>
            <div className="border-t border-slate-200 p-2 dark:border-slate-700"><Link to="/notifications" onClick={close} className="flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-slate-50 dark:text-blue-300 dark:hover:bg-slate-800">{t('notifications.viewAll')}<ArrowRight size={14} aria-hidden /></Link></div>
        </section>}
    </div>
}
