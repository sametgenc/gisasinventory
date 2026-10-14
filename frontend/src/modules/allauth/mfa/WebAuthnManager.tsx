import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { create, parseCreationOptionsFromJSON } from '@github/webauthn-json/browser-ponyfill'
import { Button, Card, ConfirmationModal, FormField, formControlClass } from '@/components/ui'
import { ALLAUTH_API } from '../data'
import type { Authenticator, AuthResponse } from '../types'
import { useSensitiveAction } from './useSensitiveAction'
import { SecurityError } from './SecurityPanel'
import { securityErrorKey } from './security'

type SecurityKey = Authenticator & { name?: string; is_passwordless?: boolean }
export function WebAuthnManager({ authenticators, onUpdate }: { authenticators: Authenticator[]; onUpdate: () => void }) {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const { execute, handleResponse } = useSensitiveAction()
    const [adding, setAdding] = useState(false)
    const [name, setName] = useState('')
    const [passwordless, setPasswordless] = useState(false)
    const [editing, setEditing] = useState<SecurityKey | null>(null)
    const [removing, setRemoving] = useState<SecurityKey | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const busy = useRef(false)
    const keys = authenticators.filter(a => a.type === 'webauthn') as SecurityKey[]
    const mutate = (action: () => Promise<AuthResponse>, complete: () => void) => {
        if (busy.current) return
        execute(async () => {
            if (busy.current) return
            busy.current = true
            setLoading(true)
            setError(null)
            try {
                const res = await action()
                if (!await handleResponse(res)) return
                if (res.status !== 200) { setError(t(securityErrorKey(res, 'mfa.keys.failed'))); return }
                complete()
                await queryClient.invalidateQueries({ queryKey: ['authenticators'] })
                onUpdate()
            } catch { setError(t('mfa.errors.passkey')) }
            finally { busy.current = false; setLoading(false) }
        })
    }
    const add = () => mutate(async () => {
        const options = await ALLAUTH_API.getWebAuthnCreateOptions(passwordless)
        if (options.status !== 200 || !options.data?.creation_options) return options
        const credential = await create(parseCreationOptionsFromJSON(options.data.creation_options))
        return ALLAUTH_API.addWebAuthnCredential(name.trim(), credential)
    }, () => { setAdding(false); setName('') })
    return <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900 dark:text-white">{t('mfa.keys.title')}</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t('mfa.keys.description')}</p></div>{!adding && <Button variant="secondary" onClick={() => { setName(''); setError(null); setAdding(true) }} disabled={loading}>{t('mfa.keys.add')}</Button>}</div>
        {error && !removing && <SecurityError>{error}</SecurityError>}
        {adding && <form onSubmit={event => { event.preventDefault(); add() }} className="mb-5 space-y-4 rounded-md border border-slate-200 p-4 dark:border-slate-700"><FormField label={t('mfa.keys.name')} required><input value={name} onChange={event => setName(event.target.value)} maxLength={100} className={formControlClass} required disabled={loading} /></FormField><label className="flex items-start gap-2 text-sm leading-6 text-slate-600 dark:text-slate-300"><input className="mt-1" type="checkbox" checked={passwordless} onChange={event => setPasswordless(event.target.checked)} disabled={loading} />{t('mfa.keys.passwordless')}</label><div className="flex flex-wrap gap-2"><Button type="submit" disabled={!name.trim()} loading={loading}>{t('mfa.keys.continue')}</Button><Button variant="secondary" onClick={() => setAdding(false)} disabled={loading}>{t('common.cancel')}</Button></div></form>}
        {keys.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">{t('mfa.keys.empty')}</p> : <ul className="divide-y divide-slate-200 dark:divide-slate-700">{keys.map(key => <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-words text-sm font-medium text-slate-900 dark:text-white">{key.name || t('mfa.keys.unnamed')}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t(key.is_passwordless ? 'mfa.keys.passkey' : 'mfa.keys.securityKey')}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { setName(key.name || ''); setEditing(key); setError(null) }} disabled={loading} aria-label={t('mfa.keys.renameLabel', { name: key.name || t('mfa.keys.unnamed') })}>{t('mfa.keys.rename')}</Button><Button size="sm" variant="secondary" onClick={() => { setRemoving(key); setError(null) }} disabled={loading} aria-label={t('mfa.keys.removeLabel', { name: key.name || t('mfa.keys.unnamed') })}>{t('mfa.keys.remove')}</Button></div></li>)}</ul>}
        {editing && <form onSubmit={event => { event.preventDefault(); mutate(() => ALLAUTH_API.updateWebAuthnCredential(editing.id, { name: name.trim() }), () => setEditing(null)) }} className="mt-4 space-y-3"><FormField label={t('mfa.keys.name')} required><input value={name} onChange={event => setName(event.target.value)} required maxLength={100} disabled={loading} className={formControlClass} /></FormField><div className="flex gap-2"><Button type="submit" loading={loading} disabled={!name.trim()}>{t('common.save')}</Button><Button variant="secondary" onClick={() => setEditing(null)} disabled={loading}>{t('common.cancel')}</Button></div></form>}
        <ConfirmationModal isOpen={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={() => { if (removing) mutate(() => ALLAUTH_API.deleteWebAuthnCredential([removing.id]), () => setRemoving(null)) }} title={t('mfa.keys.removeTitle')} message={t('mfa.keys.removeWarning', { name: removing?.name || t('mfa.keys.unnamed') })} confirmText={t('mfa.keys.remove')} isLoading={loading} error={error} />
    </Card>
}
