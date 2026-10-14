import { Link } from '@tanstack/react-router'
import { Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/context'
import { Button, Card, PageHeader } from '@/components/ui'
import type { Authenticator } from '../types'
import { WebAuthnManager } from './WebAuthnManager'
import { SecurityError } from './SecurityPanel'

export function Authenticators({ authenticators, onUpdate, loadFailed = false }: { authenticators: Authenticator[]; onUpdate: () => void; loadFailed?: boolean }) {
    const { t } = useTranslation()
    const { config } = useAuth()
    const totp = authenticators.some(a => a.type === 'totp')
    const enabled = totp || authenticators.some(a => a.type === 'webauthn')
    const linkClass = 'inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-blue-300'
    return <div className="w-full min-w-0 max-w-3xl space-y-5">
        <PageHeader icon={<Shield size={22} />} title={t('mfa.title')} subtitle={t('mfa.description')} />
        {loadFailed ? <><SecurityError>{t('mfa.errors.load')}</SecurityError><Button onClick={onUpdate}>{t('mfa.retry')}</Button></> : <>
            <p role="status" className={`rounded-md border p-4 text-sm ${enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300'}`}>{t(enabled ? 'mfa.enabled' : 'mfa.disabled')}</p>
            <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 max-w-lg"><h2 className="font-semibold text-slate-900 dark:text-white">{t('mfa.setup.appTitle')}</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t('mfa.setup.description')}</p></div><Link to="/account/totp-setup" className={linkClass}>{t(totp ? 'mfa.manage' : 'mfa.setup.title')}</Link></div></Card>
            {config?.mfa?.supported_types?.includes('webauthn') && <WebAuthnManager authenticators={authenticators} onUpdate={onUpdate} />}
            {enabled && <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 max-w-lg"><h2 className="font-semibold text-slate-900 dark:text-white">{t('mfa.recovery.title')}</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t('mfa.recovery.subtitle')}</p></div><Link to="/auth/mfa/recovery-codes" className={linkClass}>{t('mfa.setup.openRecovery')}</Link></div></Card>}
        </>}
    </div>
}
