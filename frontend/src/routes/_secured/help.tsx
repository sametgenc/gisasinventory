import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Download, Printer, Search, X, ZoomIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/context'
import { isGlobalAdministrator } from '@/auth/permissions'
import { Button, Modal, formControlClass } from '@/components/ui'
import { guideContent, type GuideTask, type GuideTaskId } from '@/modules/guide-content'
import { helpCopy } from '@/modules/help-copy'
import { isDemoMode } from '@/modules/demo'
import { canUseSharedUsage } from '@/modules/assets/usage'

const taskIds: GuideTaskId[] = ['inspect', 'add', 'excel', 'publish', 'catalog', 'usage', 'users']
export const Route = createFileRoute('/_secured/help')({
    validateSearch: (search: Record<string, unknown>): { task?: GuideTaskId; step?: number } => ({
        task: typeof search.task === 'string' && taskIds.includes(search.task as GuideTaskId) ? search.task as GuideTaskId : 'inspect',
        step: typeof search.task === 'string' && taskIds.includes(search.task as GuideTaskId) && Number.isInteger(Number(search.step)) && Number(search.step) >= 0 ? Number(search.step) : 0,
    }),
    component: HelpPage,
})
const samples = ['katalog-gecerli.xlsx', 'katalog-hatali.xlsx', 'katalog-guncelleme.xlsx', 'envanter-forklift.xlsx', 'envanter-forklift-hatali.xlsx']

const labels = {
    tr: {
        searchResults: 'Rehberde bulunanlar', noResults: 'Bu aramayla eşleşen adım yok.', clearSearch: 'Aramayı temizle',
        relatedQuestions: 'Bu işlemle ilgili sorular', openStep: 'Bu adımı aç', allSteps: 'Tüm adımları gör',
        reset: 'Baştan göster', signIn: 'İşlemi yapmak için giriş yap', requiresRole: 'Bu işlemi yetkili yönetici yapar.',
        globalUsage: 'Kullanım talebi, onay, teslim ve iade için ilgili tersane hesabını kullanın. Platform hesabı tersane adına bu işlemleri yapamaz.',
        requiresShipyard: 'İşlem yapabilmek için hesabınızın bir tersaneye atanması gerekir.',
        practice: 'Deneme dosyaları ve hesaplar', practiceHelp: 'İsterseniz aynı adımları kurmaca verilerle deneyin.',
        taskProgress: 'Rehber adımları', chooseAnother: 'Başka bir işlem seçin',
        fullImage: 'Tam boy görüntüyü aç',
    },
    en: {
        searchResults: 'Guide matches', noResults: 'No step matches this search.', clearSearch: 'Clear search',
        relatedQuestions: 'Questions about this task', openStep: 'Open this step', allSteps: 'View all steps',
        reset: 'Start again', signIn: 'Sign in to perform this task', requiresRole: 'An authorized administrator performs this task.',
        globalUsage: 'Use the relevant shipyard account for usage requests, approval, handover and return. Platform accounts cannot perform these actions on a shipyard’s behalf.',
        requiresShipyard: 'Your account needs a shipyard assignment to perform this task.',
        practice: 'Practice files and accounts', practiceHelp: 'Try the same steps using fictional data.',
        taskProgress: 'Guide steps', chooseAnother: 'Choose another task',
        fullImage: 'Open full-size image',
    },
}

function HelpPage() {
    const { i18n } = useTranslation()
    const language = i18n.language.startsWith('tr') ? 'tr' : 'en'
    const copy = guideContent[language]
    const legacy = helpCopy[language]
    const ui = labels[language]
    const { user } = useAuth()
    const navigate = useNavigate()
    const selection = Route.useSearch()
    const task = copy.tasks.find(item => item.id === selection.task) ?? copy.tasks[0]
    const stepIndex = Math.min(selection.step ?? 0, task.steps.length - 1)
    const step = task.steps[stepIndex]
    const [search, setSearch] = useState('')
    const [zoom, setZoom] = useState<{ source: string; alt: string } | null>(null)
    const normalizedSearch = search.trim().toLocaleLowerCase(language)
    const matches = (text: string) => text.toLocaleLowerCase(language).includes(normalizedSearch)
    const matchedSteps = normalizedSearch ? copy.tasks.flatMap(item => item.steps.flatMap((itemStep, index) =>
        matches([item.title, item.summary, itemStep.title, itemStep.body].join(' ')) ? [{ task: item, step: itemStep, index }] : [])) : []
    const questions = normalizedSearch ? copy.faq.filter(item => matches(item.question + ' ' + item.answer)) : copy.faq.filter(item => item.taskId === task.id)
    const isPlatform = isGlobalAdministrator(user)
    const isManager = isPlatform || user?.role === 'tenant_admin'
    const hasShipyard = isPlatform || !!user?.tenant_slug
    const canPerform = !!user && hasShipyard && (task.audienceRole === 'all' || (task.audienceRole === 'manager' ? isManager : isPlatform))

    function selectTask(id: GuideTaskId, index = 0) {
        setSearch('')
        void navigate({ to: '/help', search: { task: id, step: index } })
    }

    function actionFor(item: GuideTask, className: string) {
        if (!user) return <Link to="/login" search={{ redirect: item.route }} className={className}>{ui.signIn}<ArrowRight size={16} /></Link>
        if (item.id === 'usage' && !canUseSharedUsage(user)) return <p className="text-sm text-slate-500 dark:text-slate-400">{isPlatform ? ui.globalUsage : ui.requiresShipyard}</p>
        if (canPerform) return <Link to={item.route} className={className}>{item.action}<ArrowRight size={16} /></Link>
        return <p className="text-sm text-slate-500 dark:text-slate-400">{hasShipyard ? ui.requiresRole : ui.requiresShipyard}</p>
    }

    return <div className="user-guide mx-auto min-w-0 max-w-7xl print:text-black">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-700">
            <div className="max-w-2xl">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><BookOpen size={15} aria-hidden />GİSAŞ</div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{copy.title}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.introduction}</p>
            </div>
            <Button variant="secondary" size="sm" icon={<Printer size={15} />} onClick={() => window.print()} className="print:hidden">{legacy.print}</Button>
        </header>
        <div className="guide-interactive print:hidden">
            <div className="mb-6 max-w-2xl">
                <label className="relative block"><span className="sr-only">{legacy.search}</span><Search size={17} aria-hidden className="absolute left-3 top-3 text-slate-400" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={legacy.search} className={`${formControlClass} pl-10 pr-10`} aria-controls="guide-search-results" />{search && <button type="button" onClick={() => setSearch('')} aria-label={ui.clearSearch} className="absolute right-2 top-2 rounded p-1 text-slate-500"><X size={18} /></button>}</label>
            </div>
            <div className="grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
                <aside className="min-w-0">
                    <label className="block lg:hidden"><span className="mb-2 block text-sm font-semibold text-slate-900 dark:text-white">{copy.taskPrompt}</span><select aria-label={copy.taskPrompt} value={task.id} onChange={event => selectTask(event.target.value as GuideTaskId)} className={formControlClass}>{copy.tasks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                    <nav aria-label={copy.taskPrompt} className="hidden lg:block">
                        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{copy.taskPrompt}</h2>
                        <div className="space-y-1">{copy.tasks.map((item, index) => <Link key={item.id} to="/help" search={{ task: item.id, step: 0 }} onClick={() => setSearch('')} aria-current={item.id === task.id ? 'page' : undefined} className={`flex gap-3 rounded-md border-l-2 px-3 py-3 text-sm transition-colors ${item.id === task.id ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-slate-800 dark:text-blue-200' : 'border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}><span aria-hidden="true" className="mt-0.5 text-xs text-slate-400">{String(index + 1).padStart(2, '0')}</span><span className="font-medium">{item.title}</span></Link>)}</div>
                    </nav>
                    <details className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">{copy.conceptsTitle}</summary>
                        <dl className="mt-4 space-y-4">{copy.concepts.map(concept => <div key={concept.title}><dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{concept.title}</dt><dd className="mt-1 text-sm text-slate-700 dark:text-slate-200"><span className="font-semibold">{concept.example}</span><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{concept.body}</p></dd></div>)}</dl>
                    </details>
                </aside>

                {normalizedSearch ? <section id="guide-search-results" className="min-w-0">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{ui.searchResults}</h2>
                    {!matchedSteps.length && !questions.length && <p role="status" className="mt-4 text-sm text-slate-500 dark:text-slate-400">{ui.noResults}</p>}
                    <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-700 dark:border-slate-700">{matchedSteps.map(match => <article key={match.task.id + match.step.id} className="py-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{match.task.title} · {copy.stepLabel} {match.index + 1}</p>
                        <button type="button" onClick={() => selectTask(match.task.id, match.index)} className="mt-1 text-left font-semibold text-blue-700 hover:underline dark:text-blue-300">{match.step.title}<span className="sr-only"> · {ui.openStep}</span></button>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{match.step.body}</p>
                    </article>)}</div>
                    {questions.length > 0 && <QuestionList title={copy.faqTitle} questions={questions} />}
                </section> : <section id="guide-search-results" className="min-w-0">
                    <div className="mb-4">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{copy.audienceLabel}: {task.audience}</p>
                        <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{task.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{task.summary}</p>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700 sm:px-6">
                            <div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-500 dark:text-slate-400">{copy.stepLabel} {stepIndex + 1} / {task.steps.length}</span><button type="button" onClick={() => selectTask(task.id)} className="text-xs text-slate-500 hover:underline dark:text-slate-400">{ui.reset}</button></div>
                            <div role="progressbar" aria-label={ui.taskProgress} aria-valuemin={1} aria-valuemax={task.steps.length} aria-valuenow={stepIndex + 1} className="h-1 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-700"><div className="h-full bg-blue-600 dark:bg-blue-400" style={{ width: `${((stepIndex + 1) / task.steps.length) * 100}%` }} /></div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <Button variant="secondary" size="sm" icon={<ChevronLeft size={15} />} disabled={stepIndex === 0} onClick={() => selectTask(task.id, stepIndex - 1)}>{copy.previousStep}</Button>
                            {stepIndex < task.steps.length - 1 ? <Button size="sm" onClick={() => selectTask(task.id, stepIndex + 1)}>{copy.nextStep}<ChevronRight size={15} /></Button> : actionFor(task, 'inline-flex min-h-9 items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700')}
                        </div>
                        </div>
                        <article className="p-5 sm:p-6" aria-labelledby="guide-step-title">
                            <h3 id="guide-step-title" aria-live="polite" className="text-lg font-semibold text-slate-900 dark:text-white">{step.title}</h3>
                            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">{step.body}</p>
                            {step.screenshot && <figure className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                                <button type="button" onClick={() => setZoom({ source: '/guide/images/' + step.screenshot, alt: step.imageAlt || step.title })} aria-label={copy.openScreenshot} className="block w-full"><img src={'/guide/images/' + step.screenshot} alt={step.imageAlt || step.title} className="mx-auto max-h-[26rem] w-full object-contain" /></button>
                                <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"><span>{copy.screenshotCaption}</span><span className="inline-flex items-center gap-1.5"><ZoomIn size={14} aria-hidden />{copy.openScreenshot}</span></figcaption>
                            </figure>}
                            {!step.screenshot && <div className="mt-5 border-l-2 border-blue-600 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-blue-400 dark:bg-slate-800 dark:text-slate-300">{task.expectedResult}</div>}
                        </article>
                    </div>
                    <details className="mt-4 border-b border-slate-200 pb-4 dark:border-slate-700"><summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">{ui.allSteps}</summary><ol className="mt-3 space-y-1">{task.steps.map((item, index) => <li key={item.id}><button type="button" aria-current={index === stepIndex ? 'step' : undefined} onClick={() => selectTask(task.id, index)} className="py-1 text-left text-sm text-blue-700 hover:underline dark:text-blue-300">{index + 1}. {item.title}</button></li>)}</ol></details>
                    <div className="mt-5 border-l-2 border-slate-300 pl-4 dark:border-slate-600"><h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.resultLabel}</h3><p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">{task.expectedResult}</p>{task.note && <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400">{copy.noteLabel}</summary><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{task.note}</p></details>}</div>
                    {questions.length > 0 && <details className="mt-6"><summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">{ui.relatedQuestions}</summary><QuestionList title={copy.faqTitle} questions={questions} /></details>}
                </section>}
            </div>
            {isDemoMode && <details className="mt-8 border-t border-slate-200 pt-4 dark:border-slate-700">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">{ui.practice}</summary><p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{ui.practiceHelp}</p>
                <p className="mt-3 break-all text-sm text-slate-700 dark:text-slate-200">yonetici@demo.gisas.test · personel@demo.gisas.test · admin@demo.gisas.test</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{legacy.password}: <code>GisasDemo!2026</code></p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{legacy.credentialHelp}</p>
                <div className="mt-4 grid gap-x-6 sm:grid-cols-2">{samples.map((filename, index) => <a key={filename} href={'/demo/downloads/' + filename} download className="inline-flex items-center gap-2 border-t border-slate-200 py-3 text-sm text-blue-700 hover:underline dark:border-slate-700 dark:text-blue-300"><Download size={15} />{legacy.downloads[index]}</a>)}</div>
            </details>}
        </div>

        <div className="guide-print hidden print:block">{copy.tasks.map(item => <section key={item.id} className="mb-8 break-before-page first:break-before-auto">
            <h2 className="text-xl font-semibold">{item.title}</h2><p>{item.audience} · {item.summary}</p>
            <ol>{item.steps.map((itemStep, index) => <li key={itemStep.id} className="mt-5 break-inside-avoid"><h3 className="font-semibold">{index + 1}. {itemStep.title}</h3><p className="mt-1 text-sm">{itemStep.body}</p>{itemStep.screenshot && <img src={'/guide/images/' + itemStep.screenshot} alt={itemStep.imageAlt || itemStep.title} className="mt-3 max-h-64 w-full object-contain" />}</li>)}</ol>
            <p className="mt-4"><strong>{copy.resultLabel}: </strong>{item.expectedResult}</p>{item.note && <p className="mt-2 text-sm">{item.note}</p>}
        </section>)}<section><h2 className="text-xl font-semibold">{copy.faqTitle}</h2>{copy.faq.map(item => <article key={item.question} className="mt-4"><h3 className="font-semibold">{item.question}</h3><p>{item.answer}</p></article>)}</section></div>

        <Modal isOpen={!!zoom} onClose={() => setZoom(null)} title={zoom?.alt || copy.openScreenshot} size="xl">{zoom && <div><img src={zoom.source} alt={zoom.alt} className="max-h-[70vh] w-full object-contain" /><a href={zoom.source} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-sm font-medium text-blue-700 underline dark:text-blue-300">{ui.fullImage}</a></div>}</Modal>
    </div>
}

function QuestionList({ title, questions }: { title: string; questions: { question: string; answer: string }[] }) {
    return <div className="mt-5"><h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3><div className="mt-2 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-700 dark:border-slate-700">{questions.map(item => <details key={item.question} className="py-3"><summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">{item.question}</summary><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.answer}</p></details>)}</div></div>
}
