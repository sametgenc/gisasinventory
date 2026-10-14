import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, FileSpreadsheet, Lock, Package, Shield, Ship } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/context'

export const Route = createFileRoute('/')({ component: HomeComponent })

function HomeComponent() {
    const { user } = useAuth()
    const { t } = useTranslation()

    return (
        <div className="mx-auto w-full max-w-6xl">
            <section className="grid border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-[1.4fr_1fr]" aria-labelledby="home-title">
                <div className="px-6 py-9 sm:px-9 sm:py-12">
                    <p className="mb-6 flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
                        <Ship size={17} aria-hidden />
                        {t('home.badge')}
                    </p>
                    <h1 id="home-title" className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                        {t('home.titlePrefix')} {t('home.titleHighlight')}
                    </h1>
                    <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">{t('home.subtitleLead')}</p>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t('home.subtitleDetail')}</p>
                    <div className="mt-7 flex flex-wrap items-center gap-4">
                        {user ? (
                            <Link to="/dashboard" className="inline-flex items-center gap-3 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                                {t('home.goToDashboard')}<ArrowRight size={16} aria-hidden />
                            </Link>
                        ) : (
                            <Link to="/login" search={{ redirect: undefined }} className="inline-flex items-center gap-3 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                                {t('nav.login')}<ArrowRight size={16} aria-hidden />
                            </Link>
                        )}
                        {user && <Link to="/help" className="text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-blue-700 dark:text-slate-300 dark:decoration-slate-600 dark:hover:text-blue-300">{t('home.guide')}</Link>}
                    </div>
                </div>
                <aside className="border-t border-slate-200 bg-slate-50 px-6 py-8 dark:border-slate-700 dark:bg-slate-950 sm:px-9 lg:border-l lg:border-t-0" aria-labelledby="home-glance-heading">
                    <h2 id="home-glance-heading" className="mb-6 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('home.glanceTitle')}</h2>
                    <dl className="divide-y divide-slate-200 dark:divide-slate-700">
                        {[1, 2, 3].map(item => <div key={item} className="py-5 first:pt-0 last:pb-0">
                            <dt className="text-sm font-semibold text-slate-900 dark:text-white">{t(`home.glance${item}Title`)}</dt>
                            <dd className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(`home.glance${item}Desc`)}</dd>
                        </div>)}
                    </dl>
                </aside>
            </section>

            <section className="mt-10" aria-labelledby="home-workflow-heading">
                <h2 id="home-workflow-heading" className="mb-5 text-lg font-semibold text-slate-900 dark:text-white">{t('home.workflowTitle')}</h2>
                <ol className="grid border-y border-slate-200 dark:border-slate-700 md:grid-cols-3">
                    {[1, 2, 3].map(step => <li key={step} className="flex gap-4 border-b border-slate-200 py-6 dark:border-slate-700 md:border-b-0 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0 md:last:pr-0 last:border-b-0">
                        <span aria-hidden className="text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500">0{step}</span>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t(`home.workflow${step}Title`)}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(`home.workflow${step}Desc`)}</p>
                        </div>
                    </li>)}
                </ol>
            </section>

            <section className="mb-6 mt-10" aria-labelledby="home-cap-heading">
                <h2 id="home-cap-heading" className="mb-5 text-lg font-semibold text-slate-900 dark:text-white">{t('home.capabilitiesTitle')}</h2>
                <div className="grid gap-x-10 sm:grid-cols-2">
                    {[
                        { icon: Package, number: 1 },
                        { icon: Shield, number: 2 },
                        { icon: FileSpreadsheet, number: 5 },
                        { icon: Lock, number: 6 },
                    ].map(feature => <article key={feature.number} className="flex items-start gap-3 border-t border-slate-200 py-5 dark:border-slate-700">
                        <feature.icon size={19} className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t(`home.feature${feature.number}Title`)}</h3>
                            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(`home.feature${feature.number}Desc`)}</p>
                        </div>
                    </article>)}
                </div>
            </section>
        </div>
    )
}
