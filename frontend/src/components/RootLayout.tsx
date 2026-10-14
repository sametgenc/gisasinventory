import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useAuth } from '../auth/context';
import { LogOut, LogIn, LayoutDashboard, Settings, User, Shield, Key, Smartphone, Package, Layers, Building2, Menu, X, ChevronDown, Users, BookOpen, Share2 } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { FeedbackBubble } from './FeedbackBubble';
import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { helpCopy } from '@/modules/help-copy';
import { isDemoMode } from '@/modules/demo';
import { getApiErrorMessage } from '@/api/errors';
import { canUseSharedUsage, usageCopy } from '@/modules/assets/usage';

function NavItem({
    to,
    icon: Icon,
    label,
    exact = false
}: {
    to: string;
    icon: React.ComponentType<{ size: number; className?: string }>;
    label: string;
    exact?: boolean;
}) {
    const routerState = useRouterState();
    const currentPath = routerState.location.pathname;
    const isActive = exact
        ? currentPath === to
        : currentPath.startsWith(to) && (to === '/' ? currentPath === '/' : true);

    return (
        <Link
            to={to}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex min-h-16 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${isActive
                ? 'border-blue-600 text-slate-900 dark:border-blue-400 dark:text-white'
                : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
        >
            <Icon size={17} className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'} />
            {label}
        </Link>
    );
}

export const RootLayout: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const guide = helpCopy[i18n.language.startsWith('tr') ? 'tr' : 'en'];
    const usage = usageCopy[i18n.language.startsWith('tr') ? 'tr' : 'en'];
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [logoutError, setLogoutError] = useState('');

    const isPlatformAdmin = user?.is_superuser;
    const isTenantAdmin = user?.role === 'tenant_admin';
    const showTenantUsers = isTenantAdmin && !isPlatformAdmin;

    const handleLogout = async () => {
        try {
            setLogoutError('');
            await logout();
            navigate({ to: '/login', search: { redirect: undefined } });
        } catch (error) {
            setLogoutError(getApiErrorMessage(error, i18n.language.startsWith('tr') ? 'Çıkış yapılamadı. Tekrar deneyin.' : 'Sign out failed. Try again.'));
        }
    };

    const closeUserMenu = useCallback(() => setIsUserMenuOpen(false), []);
    const userMenuRef = useClickOutside<HTMLDivElement>(closeUserMenu);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
            {isDemoMode && <div className="border-b border-slate-200 bg-slate-100 px-4 py-1.5 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 print:hidden">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-0.5"><span className="font-semibold text-slate-700 dark:text-slate-200">{guide.demoBanner}</span><span className="hidden sm:inline">{guide.demoBannerHelp}</span>{user && <Link to="/help" className="ml-auto font-medium text-blue-700 underline-offset-4 hover:underline dark:text-blue-300">{guide.nav}</Link>}</div>
            </div>}
            {/* Navigation */}
            <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 print:hidden">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex min-w-0 items-center gap-5">
                            {/* Logo */}
                            <Link to={user ? '/dashboard' : '/'} className="flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label={t('nav.appName')}>
                                <Logo variant="full" className="h-7 w-auto sm:h-8" />
                            </Link>

                            {/* Desktop Navigation */}
                            <div className="hidden xl:flex items-center">
                                {!user && (
                                    <NavItem to="/" icon={LayoutDashboard} label={t('nav.home')} exact />
                                )}
                                {user && (
                                    <>
                                        <NavItem to="/dashboard" icon={LayoutDashboard} label={t('nav.dashboard')} exact />
                                        <NavItem to="/assets" icon={Package} label={t(user.is_superuser || user.role === 'platform_admin' ? 'inventory.centralTitle' : 'nav.assets')} exact />
                                        <NavItem to="/shared-equipment" icon={Share2} label={t('nav.sharedEquipment')} />
                                        <NavItem to="/assets/types" icon={Layers} label={t('nav.assetTypes')} />
                                        {isPlatformAdmin && (
                                            <>
                                                <NavItem to="/platform/tenants" icon={Building2} label={t('nav.tenants')} />
                                                <NavItem to="/platform/users" icon={Users} label={t('nav.users')} />
                                            </>
                                        )}
                                        {showTenantUsers && (
                                            <NavItem to="/tenant/users" icon={Users} label={t('nav.myUsers')} />
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Right side */}
                        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                            {user && <Link to="/help" aria-label={guide.nav} title={guide.nav} className="hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 dark:text-slate-300 dark:hover:bg-slate-800 sm:inline-flex"><BookOpen size={18} /></Link>}
                            {user && <NotificationBell />}
                            <LanguageSwitcher />
                            <ThemeToggle />

                            {/* Mobile menu button */}
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="xl:hidden p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                aria-label={t('nav.toggleMenu')}
                                aria-expanded={isMobileMenuOpen}
                                aria-controls="mobile-navigation"
                            >
                                {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                            </button>

                            {user ? (
                                <div className="relative hidden xl:block" ref={userMenuRef}>
                                    <button
                                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                                        className="ml-2 flex items-center gap-2 border-l border-slate-200 py-1 pl-3 pr-1 text-sm transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:hover:text-white"
                                        aria-expanded={isUserMenuOpen}
                                        aria-label={user.username}
                                    >
                                        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            {user.username.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="hidden 2xl:block text-sm font-medium text-slate-700 dark:text-slate-200">
                                            {user.username}
                                        </span>
                                        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* User Dropdown */}
                                    {isUserMenuOpen && (
                                        <div className="absolute right-0 top-full mt-3 w-64 overflow-hidden rounded-md border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900">
                                            {/* User Info */}
                                            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                                                <p className="font-semibold text-slate-900 dark:text-white text-sm">{user.username}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user.email}</p>
                                                {(user.is_superuser || user.role === 'platform_admin') && (
                                                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                                                        <Shield size={10} />
                                                        {t('nav.platformAdmin', 'Platform Admin')}
                                                    </span>
                                                )}
                                                {!user.is_superuser && user.role === 'tenant_admin' && (
                                                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                                                        <Shield size={10} />
                                                        {t('nav.tenantAdmin', 'Shipyard Admin')}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Menu Items */}
                                            <div className="py-1">
                                                <Link
                                                    to="/dashboard"
                                                    onClick={closeUserMenu}
                                                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                >
                                                    <LayoutDashboard size={16} className="text-slate-400" />
                                                    {t('nav.dashboard')}
                                                </Link>
                                                <Link
                                                    to="/account/email"
                                                    onClick={closeUserMenu}
                                                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                >
                                                    <User size={16} className="text-slate-400" />
                                                    {t('nav.emailSettings', 'Email Settings')}
                                                </Link>
                                                {canUseSharedUsage(user) && <Link to="/shared-usage" search={{ request: undefined }} onClick={closeUserMenu} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"><Share2 size={16} className="text-slate-400" />{usage.title}</Link>}
                                                <Link
                                                    to="/account/password"
                                                    onClick={closeUserMenu}
                                                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                >
                                                    <Key size={16} className="text-slate-400" />
                                                    {t('nav.changePassword', 'Change Password')}
                                                </Link>
                                                <Link
                                                    to="/account/authenticators"
                                                    onClick={closeUserMenu}
                                                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                >
                                                    <Smartphone size={16} className="text-slate-400" />
                                                    {t('nav.twoFactor', 'Two-Factor Auth')}
                                                </Link>

                                                {user.is_superuser && (
                                                    <>
                                                        <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                                                        <Link
                                                            to="/platform/tenants"
                                                            onClick={closeUserMenu}
                                                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                        >
                                                            <Building2 size={16} className="text-slate-400" />
                                                            {t('nav.tenants')}
                                                        </Link>
                                                        <Link
                                                            to="/platform/settings"
                                                            onClick={closeUserMenu}
                                                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                        >
                                                            <Settings size={16} className="text-slate-400" />
                                                            {t('nav.appSettings')}
                                                        </Link>
                                                        <a
                                                            href="/admin"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={closeUserMenu}
                                                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                        >
                                                            <Shield size={16} className="text-slate-400" />
                                                            {t('nav.djangoAdmin')}
                                                        </a>
                                                    </>
                                                )}

                                                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                                                <button
                                                    onClick={() => { closeUserMenu(); handleLogout(); }}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                                >
                                                    <LogOut size={16} />
                                                    {t('nav.logout', 'Logout')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="hidden xl:flex items-center gap-2">
                                    <Link
                                        to="/login"
                                        search={{ redirect: undefined }}
                                        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                                    >
                                        <LogIn size={16} />
                                        {t('nav.login', 'Login')}
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Mobile Menu */}
                {isMobileMenuOpen && (
                    <div id="mobile-navigation" className="max-h-[calc(100dvh-4rem)] overflow-y-auto xl:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <div className="px-4 py-3 space-y-1">
                            {!user && (
                                <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                    <LayoutDashboard size={18} />
                                    {t('nav.home')}
                                </Link>
                            )}
                            {user && (
                                <>
                                    <Link to="/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                        <LayoutDashboard size={18} />
                                        {t('nav.dashboard')}
                                    </Link>
                                    <Link to="/assets" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                        <Package size={18} />
                                        {t(user.is_superuser || user.role === 'platform_admin' ? 'inventory.centralTitle' : 'nav.assets')}
                                    </Link>
                                    <Link to="/shared-equipment" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                        <Share2 size={18} />
                                        {t('nav.sharedEquipment')}
                                    </Link>
                                    <Link to="/assets/types" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                        <Layers size={18} />
                                        {t('nav.assetTypes')}
                                    </Link>
                                    <Link to="/help" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium"><BookOpen size={18} />{guide.nav}</Link>
                                    {canUseSharedUsage(user) && <Link to="/shared-usage" search={{ request: undefined }} onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Share2 size={18} />{usage.title}</Link>}
                                    {isPlatformAdmin && (
                                        <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-1 space-y-1">
                                            <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                                {t('nav.platformAdmin')}
                                            </p>
                                            <Link to="/platform/tenants" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                                <Building2 size={18} />
                                                {t('nav.tenants')}
                                            </Link>
                                            <Link to="/platform/users" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                                <Users size={18} />
                                                {t('nav.users')}
                                            </Link>
                                            <Link to="/platform/settings" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                                <Settings size={18} />
                                                {t('nav.appSettings')}
                                            </Link>
                                        </div>
                                    )}
                                    {showTenantUsers && (
                                        <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-1 space-y-1">
                                            <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                                {t('nav.tenantAdmin')}
                                            </p>
                                            <Link to="/tenant/users" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                                <Users size={18} />
                                                {t('nav.myUsers')}
                                            </Link>
                                        </div>
                                    )}
                                    <div className="border-t border-slate-200 pt-2 mt-2 space-y-1 dark:border-slate-800">
                                        <p className="px-3 pt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('nav.myAccount')}</p>
                                        <Link to="/account/email" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                                            <User size={18} aria-hidden />{t('nav.emailSettings')}
                                        </Link>
                                        <Link to="/account/password" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                                            <Key size={18} aria-hidden />{t('nav.changePassword')}
                                        </Link>
                                        <Link to="/account/authenticators" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                                            <Smartphone size={18} aria-hidden />{t('nav.twoFactor')}
                                        </Link>
                                    </div>
                                    <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2">
                                        <button
                                            onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-sm font-medium"
                                        >
                                            <LogOut size={18} />
                                            {t('nav.logout', 'Logout')}
                                        </button>
                                    </div>
                                </>
                            )}
                            {!user && (
                                <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 mt-2">
                                    <Link to="/login" search={{ redirect: undefined }} onClick={() => setIsMobileMenuOpen(false)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-blue-600 text-white font-medium text-sm">
                                        <LogIn size={16} />
                                        {t('nav.login', 'Login')}
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </nav>
            {logoutError && <p role="alert" className="mx-auto w-full max-w-7xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{logoutError}</p>}

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-h-0">
                <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 flex-1 min-w-0 flex flex-col">
                    <Outlet />
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-200 dark:border-slate-800 py-2.5 sm:py-3 bg-white dark:bg-slate-900 shrink-0 print:hidden">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
                    <p className="text-slate-500 dark:text-slate-400 text-xs">
                        &copy; {new Date().getFullYear()} {t('nav.appName')}
                    </p>
                    <p className="text-slate-400 dark:text-slate-500 text-[11px] leading-tight text-right max-w-[55%] sm:max-w-none">
                        {t('footer.poweredBy')}
                    </p>
                </div>
            </footer>

            <FeedbackBubble />
        </div>
    );
};
