import { useRef, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button, ConfirmationModal } from '@/components/ui'
import { Route } from '@/routes/_auth/auth/mfa/recovery-codes'
import { ALLAUTH_API } from '../data'
import { useSensitiveAction } from './useSensitiveAction'
import { SecurityError, SecurityPanel } from './SecurityPanel'
import { securityErrorKey } from './security'

export function RecoveryCodes() {
    const { t } = useTranslation()
    const router = useRouter()
    const data = Route.useLoaderData()
    const [replacement, setReplacement] = useState<string[] | null>(null)
    const codes = replacement ?? data.codes
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const busy = useRef(false)
    const { execute, handleResponse } = useSensitiveAction()
    const generate = () => {
        if (busy.current) return
        execute(async () => {
            if (busy.current) return
            busy.current = true
            setLoading(true)
            setError(null)
            try {
                const res = await ALLAUTH_API.generateRecoveryCodes()
                if (!await handleResponse(res)) return
                if (res.status !== 200 || !Array.isArray(res.data?.unused_codes)) { setError(t(securityErrorKey(res, 'mfa.recovery.generateFailed'))); return }
                setReplacement(res.data.unused_codes)
                setCopied(false)
                setConfirmOpen(false)
            } catch { setError(t('mfa.errors.connection')) }
            finally { busy.current = false; setLoading(false) }
        })
    }
    const copy = async () => {
        try { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true) }
        catch { setError(t('mfa.recovery.copyFailed')) }
    }
    const download = () => {
        const url = URL.createObjectURL(new Blob([`${t('mfa.recovery.title')}\n\n${codes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url
        link.download = 'gisas-recovery-codes.txt'
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    return <SecurityPanel title={t('mfa.recovery.title')} description={t('mfa.recovery.subtitle')}>
        {data.loadFailed && replacement === null ? <><SecurityError>{t('mfa.errors.load')}</SecurityError><Button onClick={() => router.invalidate()}>{t('mfa.retry')}</Button></> : <>
            <p className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">{t('mfa.recovery.storeSafely')}</p>
            {error && !confirmOpen && <SecurityError>{error}</SecurityError>}
            {codes.length ? <><ul className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label={t('mfa.recovery.title')}>{codes.map(code => <li key={code} className="break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">{code}</li>)}</ul><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={copy} disabled={loading}>{t(copied ? 'mfa.recovery.copied' : 'mfa.recovery.copy')}</Button><Button variant="secondary" onClick={download} disabled={loading}>{t('mfa.recovery.download')}</Button><Button variant="secondary" onClick={() => window.print()} disabled={loading}>{t('mfa.recovery.print')}</Button></div></> : <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{t('mfa.recovery.empty')}</p>}
            <Button className="mt-5" variant="secondary" onClick={() => { setError(null); setConfirmOpen(true) }} loading={loading}>{t('mfa.recovery.regenerate')}</Button>
            <ConfirmationModal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={generate} title={t('mfa.recovery.regenerate')} message={t('mfa.recovery.replaceWarning')} isLoading={loading} error={error} type="warning" />
        </>}
        <Link to="/account/authenticators" className="mt-5 block text-sm text-blue-700 dark:text-blue-300">{t('mfa.recovery.backToSecurity')}</Link>
    </SecurityPanel>
}
