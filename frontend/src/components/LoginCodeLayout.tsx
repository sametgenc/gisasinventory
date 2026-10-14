import type { ReactNode } from 'react'
import { Check, Ship } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface LoginCodeLayoutProps {
    step: 1 | 2
    title: string
    description: string
    backLink: ReactNode
    children: ReactNode
}

export function LoginCodeLayout({ step, title, description, backLink, children }: LoginCodeLayoutProps) {
    const { t } = useTranslation()
    const steps = [
        { title: t('loginCodeRequest.stepEmail'), description: t('loginCodeRequest.emailStepDescription') },
        { title: t('loginCodeRequest.stepCode'), description: t('loginCodeRequest.codeStepDescription') },
    ]
    return (
        <div className="flex min-h-0 w-full flex-1 items-center justify-center py-2 sm:py-6">
            <div className="grid w-full max-w-4xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[0.85fr_1.25fr]">
                <aside className="bg-blue-950 px-5 py-5 text-white sm:px-8 md:flex md:flex-col md:py-9">
                    <p className="flex items-center gap-2.5 text-xs font-medium text-blue-200"><Ship size={18} aria-hidden />{t('nav.appName')}</p>
                    <h2 className="mt-8 hidden text-2xl font-semibold leading-snug tracking-tight md:block">{t('loginCodeRequest.contextTitle')}</h2>
                    <p className="mt-3 hidden text-sm leading-6 text-blue-200 md:block">{t('loginCodeRequest.contextDescription')}</p>
                    <nav className="mt-5 md:mt-9" aria-label={t('loginCodeRequest.howItWorks')}>
                        <ol className="grid grid-cols-2 gap-3 md:grid-cols-1 md:gap-6">
                            {steps.map((item, index) => {
                                const number = index + 1
                                const active = step === number
                                const complete = step > number
                                return (
                                    <li key={number} aria-current={active ? 'step' : undefined} className="flex min-w-0 items-start gap-2.5 md:gap-3">
                                        <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${active ? 'border-white bg-white text-blue-950' : complete ? 'border-blue-300 text-blue-100' : 'border-blue-700 text-blue-300'}`}>{complete ? <Check size={14} /> : number}</span>
                                        <div className="min-w-0 pt-1">
                                            <p className={`text-xs font-medium md:text-sm ${active || complete ? 'text-white' : 'text-blue-300'}`}>{item.title}</p>
                                            <p className="mt-1 hidden text-xs leading-5 text-blue-200 md:block">{item.description}</p>
                                        </div>
                                    </li>
                                )
                            })}
                        </ol>
                    </nav>
                </aside>
                <section aria-labelledby="login-code-title" className="min-w-0 px-5 py-6 sm:px-8 sm:py-8 md:px-10 md:py-9">
                    {backLink}
                    <header className="mb-7 mt-7">
                        <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{t('loginCodeRequest.eyebrow')}</p>
                        <h1 id="login-code-title" className="text-2xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-white">{title}</h1>
                        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
                    </header>
                    {children}
                </section>
            </div>
        </div>
    )
}

export const loginCodeBackLinkClass = 'inline-flex min-h-6 items-center gap-2 rounded-sm text-sm font-medium text-slate-600 transition-colors hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:text-slate-300 dark:hover:text-blue-300'
export const loginCodeSubmitClass = 'flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60'
export const loginCodeErrorClass = 'mb-5 flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
