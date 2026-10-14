import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Turnstile {
    render: (container: HTMLElement, options: {
        sitekey: string
        action: string
        size: 'flexible'
        callback: (token: string) => void
        'expired-callback': () => void
        'error-callback': () => void
        'timeout-callback': () => void
    }) => string
    remove: (id: string) => void
    ready: (callback: () => void) => void
}

declare global {
    interface Window { turnstile?: Turnstile }
}

let scriptPromise: Promise<Turnstile> | undefined

function loadTurnstile(): Promise<Turnstile> {
    if (window.turnstile) return Promise.resolve(window.turnstile)
    if (scriptPromise) return scriptPromise
    scriptPromise = new Promise<Turnstile>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.onload = () => {
            const turnstile = window.turnstile
            if (!turnstile) { reject(new Error('Security verification unavailable')); return }
            turnstile.ready(() => resolve(turnstile))
        }
        script.onerror = () => {
            script.remove()
            scriptPromise = undefined
            reject(new Error('Security verification unavailable'))
        }
        document.head.appendChild(script)
    })
    return scriptPromise
}

export function TurnstileCaptcha({ siteKey, resetKey, onToken }: {
    siteKey: string
    resetKey: number
    onToken: (token: string) => void
}) {
    const { t } = useTranslation()
    const container = useRef<HTMLDivElement>(null)
    const [failed, setFailed] = useState(false)
    useEffect(() => {
        let alive = true
        let widget: string | undefined
        let turnstile: Turnstile | undefined
        const clear = () => { if (alive) onToken('') }
        void loadTurnstile().then(client => {
            if (!alive || !container.current) return
            turnstile = client
            widget = client.render(container.current, {
                sitekey: siteKey,
                action: 'authenticate',
                size: 'flexible',
                callback: token => { if (alive) { setFailed(false); onToken(token) } },
                'expired-callback': clear,
                'timeout-callback': clear,
                'error-callback': () => { clear(); if (alive) setFailed(true) },
            })
        }).catch(() => { if (alive) { clear(); setFailed(true) } })
        return () => {
            alive = false
            if (widget !== undefined) turnstile?.remove(widget)
        }
    }, [siteKey, resetKey, onToken])
    return <div className="min-w-0" aria-label={t('captcha.label')}>
        <div ref={container} />
        {failed && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{t('captcha.unavailable')}</p>}
    </div>
}
