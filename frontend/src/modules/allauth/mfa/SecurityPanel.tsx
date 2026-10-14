import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import type { VerificationMethod } from './security'

export function SecurityPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
    return <section className="mx-auto w-full max-w-lg rounded-md border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:p-7" aria-labelledby="security-title">
        <ShieldCheck size={24} className="mb-4 text-blue-700 dark:text-blue-300" aria-hidden />
        <h1 id="security-title" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        <p className="mb-6 mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
        {children}
    </section>
}

export function SecurityError({ children }: { children: ReactNode }) {
    return <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{children}</p>
}

export function MethodSelector({ methods, method, onChange, disabled }: { methods: VerificationMethod[]; method: VerificationMethod; onChange: (method: VerificationMethod) => void; disabled: boolean }) {
    const { t } = useTranslation()
    if (methods.length < 2) return null
    return <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t('mfa.methodLabel')}>
        {methods.map(item => <Button key={item} variant={method === item ? 'primary' : 'secondary'} onClick={() => onChange(item)} aria-pressed={method === item} disabled={disabled}>{t(`mfa.methods.${item}`)}</Button>)}
    </div>
}
