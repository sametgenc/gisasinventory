import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LogOut, LogIn, LayoutDashboard, Settings, User, Shield, Key, Smartphone, Package, Layers, Building2, Menu, X, ChevronDown, Users, BookOpen, Share2, MessageSquarePlus, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/auth/context'
import { isGlobalAdministrator } from '@/auth/permissions'
import { useClickOutside } from '@/hooks/useClickOutside'
import { confirmDraftDeparture } from '@/hooks/useDraftGuard'
import { getApiErrorMessage } from '@/api/errors'
import { canUseSharedUsage } from '@/modules/assets/usage'
import { canUseDevelopmentRequests } from '@/modules/platform-feedback'
import { helpCopy } from '@/modules/help-copy'
import { isDemoMode } from '@/modules/demo'
import { ThemeToggle } from './ThemeToggle'
import { NotificationBell } from './NotificationBell'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Logo } from './Logo'
import { FeedbackBubble } from './FeedbackBubble'

const navigationCopy = {
    tr: { primary: 'Ana gezinme', home: 'Ana sayfa', overview: 'Genel bakış', shared: 'Ortak kullanım', sharedNav: 'Ortak kullanım gezinmesi', requests: 'Kullanım talepleri', management: 'Yönetim', skip: 'İçeriğe geç' },
    en: { primary: 'Main navigation', home: 'Home', overview: 'Overview', shared: 'Shared use', sharedNav: 'Shared use navigation', requests: 'Usage requests', management: 'Management', skip: 'Skip to content' },
}
interface NavigationItem { to: string; label: string; icon: LucideIcon; paths?: string[] }

function NavigationLink({ item, mobile = false, onClick }: { item: NavigationItem; mobile?: boolean; onClick?: () => void }) {
    const path = useRouterState({ select: state => state.location.pathname })
    const active = (item.paths ?? [item.to]).includes(path)
    const Icon = item.icon
    return <Link to={item.to} onClick={onClick} aria-current={active ? 'page' : undefined}
        className={mobile
            ? `flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-blue-600 ${active ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`
            : `flex min-h-16 items-center gap-2 border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${active ? 'border-blue-600 text-slate-900 dark:border-blue-400 dark:text-white' : 'border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
        <Icon size={17} aria-hidden className={active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'} />{item.label}
    </Link>
}

function SharedUseNavigation() {
    const { user } = useAuth()
    const { t, i18n } = useTranslation()
    const path = useRouterState({ select: state => state.location.pathname })
    const copy = navigationCopy[i18n.language.startsWith('tr') ? 'tr' : 'en']
    if (!canUseSharedUsage(user) || !['/shared-equipment', '/shared-usage'].includes(path)) return null
    return <nav aria-label={copy.sharedNav} className="mb-5 flex flex-wrap gap-x-5 border-b border-slate-200 dark:border-slate-700">
        {[{ to: '/shared-equipment', label: t('nav.sharedEquipment') }, { to: '/shared-usage', label: copy.requests }].map(item => <Link key={item.to} to={item.to} search={{ request: undefined }} aria-current={path === item.to ? 'page' : undefined} className={`min-h-11 border-b-2 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-blue-600 ${path === item.to ? 'border-blue-600 text-blue-800 dark:border-blue-400 dark:text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>{item.label}</Link>)}
    </nav>
}

export function RootLayout() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const { t, i18n } = useTranslation()
    const copy = navigationCopy[i18n.language.startsWith('tr') ? 'tr' : 'en']
    const guide = helpCopy[i18n.language.startsWith('tr') ? 'tr' : 'en']
    const [mobileOpen, setMobileOpen] = useState(false)
    const [accountOpen, setAccountOpen] = useState(false)
    const [managementOpen, setManagementOpen] = useState(false)
    const [logoutError, setLogoutError] = useState('')
    const [loggingOut, setLoggingOut] = useState(false)
    const managementTrigger = useRef<HTMLButtonElement>(null)
    const accountTrigger = useRef<HTMLButtonElement>(null)
    const mobileTrigger = useRef<HTMLButtonElement>(null)
    const mainContent = useRef<HTMLElement>(null)
    const closeAccount = useCallback(() => setAccountOpen(false), [])
    const closeManagement = useCallback(() => setManagementOpen(false), [])
    const accountRef = useClickOutside<HTMLDivElement>(closeAccount)
    const managementRef = useClickOutside<HTMLDivElement>(closeManagement)
    const global = isGlobalAdministrator(user)
    const yardManager = !global && user?.role === 'tenant_admin' && !!(user.tenant_slug || user.tenant_id)
    const primary: NavigationItem[] = user ? [
        { to: '/dashboard', label: global ? copy.overview : copy.home, icon: LayoutDashboard },
        { to: '/assets', label: t(global ? 'inventory.centralTitle' : 'nav.assets'), icon: Package, paths: global ? ['/assets'] : ['/assets', '/assets/types'] },
        ...(global ? [{ to: '/assets/types', label: t('nav.assetTypes'), icon: Layers }] : []),
        { to: '/shared-equipment', label: canUseSharedUsage(user) ? copy.shared : t('nav.sharedEquipment'), icon: Share2, paths: ['/shared-equipment', '/shared-usage'] },
        ...(yardManager ? [{ to: '/tenant/users', label: t('nav.myUsers'), icon: Users }] : []),
    ] : [{ to: '/', label: t('nav.home'), icon: LayoutDashboard }]
    const management: NavigationItem[] = global ? [
        { to: '/platform/tenants', label: t('nav.tenants'), icon: Building2 },
        { to: '/platform/users', label: t('nav.users'), icon: Users },
        { to: '/platform/settings', label: t('nav.appSettings'), icon: Settings },
    ] : []
    const account: NavigationItem[] = [
        { to: '/account/email', label: t('nav.emailSettings'), icon: User },
        { to: '/account/password', label: t('nav.changePassword'), icon: Key },
        { to: '/account/authenticators', label: t('nav.twoFactor'), icon: Smartphone },
        ...(canUseDevelopmentRequests(user) ? [{ to: '/development-requests', label: t('feedback.pageTitle'), icon: MessageSquarePlus }] : []),
    ]
    async function handleLogout() {
        if (loggingOut) return
        setLoggingOut(true)
        try {
            if (!await confirmDraftDeparture()) return
            setLogoutError('')
            await logout()
            await navigate({ to: '/login', search: { redirect: undefined } })
        } catch (error) {
            setLogoutError(getApiErrorMessage(error, i18n.language.startsWith('tr') ? 'Çıkış yapılamadı. Tekrar deneyin.' : 'Sign out failed. Try again.'))
        } finally { setLoggingOut(false) }
    }
    const closeMobile = () => setMobileOpen(false)
    const signOut = () => { closeAccount(); closeMobile(); void handleLogout() }
    const adminLink = <a href="/admin" target="_blank" rel="noopener noreferrer" onClick={() => { closeManagement(); closeMobile() }} className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100 focus-visible:ring-2 dark:text-slate-300 dark:hover:bg-slate-800"><Shield size={17} aria-hidden />{t('nav.djangoAdmin')}</a>

    return <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
        <a href="#main-content" onClick={event => { event.preventDefault(); closeMobile(); mainContent.current?.focus(); mainContent.current?.scrollIntoView({ block: 'start' }) }} className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-blue-700 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-white focus:outline-none focus:ring-2 focus:ring-white">{copy.skip}</a>
        {isDemoMode && <div className="border-b border-slate-200 bg-slate-100 px-4 py-1.5 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 print:hidden"><div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-0.5"><span className="font-semibold">{guide.demoBanner}</span><span className="hidden sm:inline">{guide.demoBannerHelp}</span>{user && <Link to="/help" className="ml-auto font-medium text-blue-700 dark:text-blue-300">{guide.nav}</Link>}</div></div>}
        <nav aria-label={copy.primary} className="sticky top-0 z-50 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 print:hidden">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="flex h-16 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-4">
                    <Link to={user ? '/dashboard' : '/'} aria-label={t('nav.appName')} className="flex shrink-0 items-center rounded-sm focus-visible:ring-2 focus-visible:ring-blue-600"><Logo variant="full" className="h-7 w-auto sm:h-8" /></Link>
                    <div className="hidden items-center xl:flex">
                        {primary.map(item => <NavigationLink key={item.to} item={item} />)}
                        {!!management.length && <div ref={managementRef} className="relative" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeManagement(); managementTrigger.current?.focus() } }}>
                            <button ref={managementTrigger} type="button" aria-expanded={managementOpen} aria-controls="management-navigation" onClick={() => { setManagementOpen(value => !value); closeAccount() }} className="flex min-h-16 items-center gap-2 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:ring-2 dark:text-slate-300 dark:hover:bg-slate-800"><Settings size={17} aria-hidden />{copy.management}<ChevronDown size={14} aria-hidden /></button>
                            {managementOpen && <div id="management-navigation" className="absolute right-0 top-full mt-1 w-60 rounded-md border border-slate-200 bg-white p-1 shadow-md dark:border-slate-700 dark:bg-slate-900">{management.map(item => <NavigationLink key={item.to} item={item} mobile onClick={closeManagement} />)}{adminLink}</div>}
                        </div>}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                    {user && <Link to="/help" aria-label={guide.nav} title={guide.nav} className="hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 dark:text-slate-300 dark:hover:bg-slate-800 sm:inline-flex"><BookOpen size={18} /></Link>}
                    {user && <NotificationBell />}<LanguageSwitcher /><ThemeToggle />
                    <button ref={mobileTrigger} type="button" onClick={() => setMobileOpen(value => !value)} aria-label={t('nav.toggleMenu')} aria-expanded={mobileOpen} aria-controls="mobile-navigation" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 xl:hidden">{mobileOpen ? <X size={22} /> : <Menu size={22} />}</button>
                    {user ? <div ref={accountRef} className="relative hidden xl:block" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeAccount(); accountTrigger.current?.focus() } }}>
                        <button ref={accountTrigger} type="button" aria-label={user.username} aria-expanded={accountOpen} aria-controls="account-navigation" onClick={() => { setAccountOpen(value => !value); closeManagement() }} className="ml-2 flex items-center gap-2 border-l border-slate-200 py-1 pl-3 pr-1 text-sm focus-visible:ring-2 dark:border-slate-700"><span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{user.username.charAt(0).toUpperCase()}</span><span className="hidden text-slate-700 dark:text-slate-200 2xl:block">{user.username}</span><ChevronDown size={14} aria-hidden /></button>
                        {accountOpen && <div id="account-navigation" className="absolute right-0 top-full mt-3 w-64 overflow-hidden rounded-md border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900">
                            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800"><p className="break-words text-sm font-semibold text-slate-900 dark:text-white">{user.username}</p><p className="mt-0.5 break-words text-xs text-slate-500">{user.email}</p>{(global || yardManager) && <span className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300"><Shield size={10} />{t(global ? 'nav.platformAdmin' : 'nav.tenantAdmin')}</span>}</div>
                            <div className="p-1">{account.map(item => <NavigationLink key={item.to} item={item} mobile onClick={closeAccount} />)}<button type="button" onClick={signOut} disabled={loggingOut} className="mt-1 flex min-h-11 w-full items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 focus-visible:ring-2 dark:border-slate-800 dark:text-red-400 dark:hover:bg-red-900/10"><LogOut size={17} />{t('nav.logout')}</button></div>
                        </div>}
                    </div> : <Link to="/login" search={{ redirect: undefined }} className="hidden items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white focus-visible:ring-2 xl:flex"><LogIn size={16} />{t('nav.login')}</Link>}
                </div>
            </div></div>
            {mobileOpen && <div id="mobile-navigation" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeMobile(); mobileTrigger.current?.focus() } }} className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 xl:hidden"><div className="space-y-1 px-4 py-3">
                {primary.map(item => <NavigationLink key={item.to} item={item} mobile onClick={closeMobile} />)}
                {!!management.length && <section className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800"><h2 className="px-3 py-2 text-xs font-semibold text-slate-500">{copy.management}</h2>{management.map(item => <NavigationLink key={item.to} item={item} mobile onClick={closeMobile} />)}{adminLink}</section>}
                {user ? <section className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800"><h2 className="px-3 py-2 text-xs font-semibold text-slate-500">{t('nav.myAccount')}</h2>{account.map(item => <NavigationLink key={item.to} item={item} mobile onClick={closeMobile} />)}<NavigationLink item={{ to: '/help', label: guide.nav, icon: BookOpen }} mobile onClick={closeMobile} /><button type="button" onClick={signOut} disabled={loggingOut} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 focus-visible:ring-2 dark:text-red-400"><LogOut size={17} />{t('nav.logout')}</button></section> : <NavigationLink item={{ to: '/login', label: t('nav.login'), icon: LogIn }} mobile onClick={closeMobile} />}
            </div></div>}
        </nav>
        {logoutError && <p role="alert" className="mx-auto w-full max-w-7xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{logoutError}</p>}
        <main id="main-content" ref={mainContent} tabIndex={-1} className="flex min-h-0 flex-1 scroll-mt-20 flex-col focus:outline-none"><div className="mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 md:py-8 lg:px-8"><SharedUseNavigation /><Outlet /></div></main>
        <footer className="shrink-0 border-t border-slate-200 bg-white py-2.5 dark:border-slate-800 dark:bg-slate-900 sm:py-3 print:hidden"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"><p className="text-xs text-slate-500 dark:text-slate-400">&copy; {new Date().getFullYear()} {t('nav.appName')}</p><p className="max-w-[55%] text-right text-[11px] leading-tight text-slate-400 dark:text-slate-500 sm:max-w-none">{t('footer.poweredBy')}</p></div></footer>
        <FeedbackBubble />
    </div>
}
