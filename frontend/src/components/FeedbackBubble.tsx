import { useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { MessageSquarePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/context'
import { canUseDevelopmentRequests, feedbackScope } from '@/modules/platform-feedback'
import { CreateRequestDialog } from '@/modules/platform-feedback/CreateRequestDialog'

export function FeedbackBubble() {
    const { user } = useAuth()
    const { t } = useTranslation()
    const pathname = useRouterState({ select: state => state.location.pathname })
    const [open, setOpen] = useState(false)
    if (!canUseDevelopmentRequests(user) || pathname === '/development-requests') return null
    return <div className="fixed bottom-4 right-4 z-40 print:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label={t('feedback.bubbleTitle')} className="flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><MessageSquarePlus size={18} aria-hidden /><span className="hidden text-sm font-medium sm:inline">{t('feedback.bubbleTitle')}</span></button>
        {open && <CreateRequestDialog key={feedbackScope(user)} pagePath={pathname} onClose={() => setOpen(false)} />}
    </div>
}
