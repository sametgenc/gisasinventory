import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '@/api/client'
import { TurnstileCaptcha } from '@/components/TurnstileCaptcha'

/** Backend configuration governs enforcement; missing configuration blocks submit. */
export function useCaptcha() {
    const { t } = useTranslation()
    const [token, setToken] = useState('')
    const [resetKey, setResetKey] = useState(0)
    const config = useQuery({
        queryKey: ['auth', 'captcha'],
        queryFn: async () => {
            const response = await api.get<unknown>('/api/auth/captcha/')
            const data = response.data as { enabled?: unknown; site_key?: unknown }
            if (typeof data?.enabled !== 'boolean' || (data.enabled && (typeof data.site_key !== 'string' || !data.site_key))) {
                throw new Error('Security verification unavailable')
            }
            return { enabled: data.enabled, siteKey: typeof data.site_key === 'string' ? data.site_key : '' }
        },
        staleTime: 60_000,
        retry: 1,
    })
    const reset = useCallback(() => { setToken(''); setResetKey(value => value + 1) }, [])
    const ready = Boolean(config.data && (!config.data.enabled || token))
    const widget = config.isError ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t('captcha.unavailable')}</p>
        : config.data?.enabled ? <TurnstileCaptcha siteKey={config.data.siteKey} resetKey={resetKey} onToken={setToken} />
            : config.isPending ? <p role="status" className="text-sm text-slate-500">{t('captcha.loading')}</p> : null
    return { token: token || undefined, ready, reset, widget }
}
