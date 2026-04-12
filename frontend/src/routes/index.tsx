import { createFileRoute, Link } from '@tanstack/react-router'
import {
    Ship,
    Package,
    Shield,
    BarChart3,
    ArrowRight,
    Users,
    FileSpreadsheet,
    Lock,
    Sparkles,
} from 'lucide-react'
import { useAuth } from '../auth/context'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/')({
    component: HomeComponent,
})

function HomeComponent() {
    const { user } = useAuth()
    const { t } = useTranslation()

    return (
        <div className="flex-1 flex flex-col w-full max-w-6xl mx-auto min-h-0">
            {/* Hero */}
            <section
                className={`relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-950/80 px-5 py-10 sm:px-8 sm:py-12 md:px-10 md:py-14 ${user ? 'mt-0 mb-8' : 'flex-1 flex flex-col justify-center mb-10'}`}
            >
                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
                    aria-hidden
                >
                    <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-indigo-400/30 blur-3xl" />
                    <div className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-violet-400/25 blur-3xl" />
                </div>
                <div className="relative text-center max-w-3xl mx-auto">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/25 text-indigo-600 dark:text-indigo-400 text-xs font-medium mb-4 border border-indigo-100/90 dark:border-indigo-800/40">
                        <Ship size={12} className="shrink-0" />
                        {t('home.badge')}
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-[2.35rem] font-bold text-slate-900 dark:text-white mb-3 leading-tight tracking-tight">
                        {t('home.titlePrefix')}{' '}
                        <span className="bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
                            {t('home.titleHighlight')}
                        </span>
                    </h1>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
                        {t('home.subtitleLead')}
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto mt-2.5">
                        {t('home.subtitleDetail')}
                    </p>
                    <div className="w-full max-w-md sm:max-w-lg mx-auto mt-7">
                        {user ? (
                            <Link
                                to="/dashboard"
                                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all shadow-sm shadow-indigo-500/20"
                            >
                                {t('home.goToDashboard')}
                                <ArrowRight size={16} />
                            </Link>
                        ) : (
                            <div className="flex flex-col sm:flex-row items-stretch justify-center gap-2.5">
                                <Link
                                    to="/register"
                                    className="inline-flex flex-1 items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all shadow-sm shadow-indigo-500/20 min-h-[2.75rem]"
                                >
                                    {t('home.getStarted')}
                                    <ArrowRight size={16} />
                                </Link>
                                <Link
                                    to="/login"
                                    search={{ redirect: undefined }}
                                    className="inline-flex flex-1 items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-600 min-h-[2.75rem]"
                                >
                                    {t('nav.login')}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* At a glance */}
            <section className="mb-10 md:mb-12 shrink-0" aria-labelledby="home-glance-heading">
                <h2
                    id="home-glance-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4"
                >
                    {t('home.glanceTitle')}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    {[
                        { titleKey: 'home.glance1Title', descKey: 'home.glance1Desc' },
                        { titleKey: 'home.glance2Title', descKey: 'home.glance2Desc' },
                        { titleKey: 'home.glance3Title', descKey: 'home.glance3Desc' },
                    ].map((item) => (
                        <div
                            key={item.titleKey}
                            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-4 py-3.5 backdrop-blur-sm"
                        >
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                {t(item.titleKey)}
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                {t(item.descKey)}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Workflow */}
            <section className="mb-10 md:mb-12 shrink-0" aria-labelledby="home-workflow-heading">
                <h2
                    id="home-workflow-heading"
                    className="text-sm font-semibold text-slate-900 dark:text-white mb-4"
                >
                    {t('home.workflowTitle')}
                </h2>
                <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 list-none p-0 m-0">
                    {[
                        { step: 1, titleKey: 'home.workflow1Title', descKey: 'home.workflow1Desc' },
                        { step: 2, titleKey: 'home.workflow2Title', descKey: 'home.workflow2Desc' },
                        { step: 3, titleKey: 'home.workflow3Title', descKey: 'home.workflow3Desc' },
                    ].map((item) => (
                        <li
                            key={item.step}
                            className="flex gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                {item.step}
                            </span>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                    {t(item.titleKey)}
                                </h3>
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                    {t(item.descKey)}
                                </p>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            {/* Capabilities */}
            <section className="mb-10 md:mb-12 shrink-0" aria-labelledby="home-cap-heading">
                <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={16} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
                    <h2
                        id="home-cap-heading"
                        className="text-sm font-semibold text-slate-900 dark:text-white"
                    >
                        {t('home.capabilitiesTitle')}
                    </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                        {
                            icon: Package,
                            iconClass:
                                'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
                            borderHover: 'hover:border-indigo-200 dark:hover:border-indigo-800/50',
                            titleKey: 'home.feature1Title',
                            descKey: 'home.feature1Desc',
                        },
                        {
                            icon: Shield,
                            iconClass:
                                'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
                            borderHover: 'hover:border-violet-200 dark:hover:border-violet-800/50',
                            titleKey: 'home.feature2Title',
                            descKey: 'home.feature2Desc',
                        },
                        {
                            icon: BarChart3,
                            iconClass:
                                'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
                            borderHover: 'hover:border-emerald-200 dark:hover:border-emerald-800/50',
                            titleKey: 'home.feature3Title',
                            descKey: 'home.feature3Desc',
                        },
                        {
                            icon: Users,
                            iconClass: 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400',
                            borderHover: 'hover:border-sky-200 dark:hover:border-sky-800/50',
                            titleKey: 'home.feature4Title',
                            descKey: 'home.feature4Desc',
                        },
                        {
                            icon: FileSpreadsheet,
                            iconClass:
                                'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
                            borderHover: 'hover:border-amber-200 dark:hover:border-amber-800/50',
                            titleKey: 'home.feature5Title',
                            descKey: 'home.feature5Desc',
                        },
                        {
                            icon: Lock,
                            iconClass:
                                'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
                            borderHover: 'hover:border-rose-200 dark:hover:border-rose-800/50',
                            titleKey: 'home.feature6Title',
                            descKey: 'home.feature6Desc',
                        },
                    ].map((card) => (
                        <div
                            key={card.titleKey}
                            className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors group ${card.borderHover}`}
                        >
                            <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${card.iconClass}`}
                            >
                                <card.icon size={18} />
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                                {t(card.titleKey)}
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                {t(card.descKey)}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Bottom CTA */}
            {!user && (
                <section
                    className="mb-8 md:mb-10 rounded-xl border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/30 px-5 py-6 sm:px-6 sm:py-7 shrink-0"
                    aria-labelledby="home-cta-heading"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="min-w-0">
                            <h2
                                id="home-cta-heading"
                                className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white"
                            >
                                {t('home.bottomCtaTitle')}
                            </h2>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                                {t('home.bottomCtaDesc')}
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 shrink-0 sm:ml-4">
                            <Link
                                to="/register"
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors whitespace-nowrap"
                            >
                                {t('home.bottomCtaPrimary')}
                                <ArrowRight size={15} />
                            </Link>
                            <Link
                                to="/login"
                                search={{ redirect: undefined }}
                                className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/90 dark:bg-slate-900 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                            >
                                {t('home.bottomCtaSecondary')}
                            </Link>
                        </div>
                    </div>
                </section>
            )}
        </div>
    )
}
