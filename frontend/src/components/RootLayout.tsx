import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useAuth } from '../auth/context';
import { LogOut, LogIn, LayoutDashboard, Settings, User, Shield, Key, Smartphone, Package, Layers, Building2, Menu, X, ChevronDown, Users } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { FeedbackBubble } from './FeedbackBubble';
import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';

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
            className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
        >
            <Icon size={18} className={isActive ? 'text-indigo-500 dark:text-indigo-400' : 'opacity-60'} />
            {label}
        </Link>
    );
}

export const RootLayout: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

    const isPlatformAdmin = user?.is_superuser;
    const isTenantAdmin = user?.role === 'tenant_admin';
    const showTenantUsers = isTenantAdmin && !isPlatformAdmin;

    const handleLogout = async () => {
        await logout();
        navigate({ to: '/login', search: { redirect: undefined } });
    };

    const closeUserMenu = useCallback(() => setIsUserMenuOpen(false), []);
    const userMenuRef = useClickOutside<HTMLDivElement>(closeUserMenu);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-8">
                            {/* Logo */}
                            <Link to={user ? '/dashboard' : '/'} className="flex items-center group" aria-label={t('nav.appName')}>
                                <Logo variant="full" className="h-8 w-auto transition-transform group-hover:scale-[1.02]" />
                            </Link>

                            {/* Desktop Navigation */}
                            <div className="hidden lg:flex items-center gap-1">
                                {!user && (
                                    <NavItem to="/" icon={LayoutDashboard} label={t('nav.home')} exact />
                                )}
                                {user && (
                                    <>
                                        <NavItem to="/dashboard" icon={LayoutDashboard} label={t('nav.dashboard')} exact />
                                        <NavItem to="/assets/types" icon={Layers} label={t('nav.assetTypes')} />
                                        <NavItem to="/assets" icon={Package} label={t('nav.assets')} exact />
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
                        <div className="flex items-center gap-2">
                            {user && <NotificationBell />}
                            <LanguageSwitcher />
                            <ThemeToggle />

                            {/* Mobile menu button */}
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="lg:hidden p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                aria-label={t('nav.toggleMenu')}
                            >
                                {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                            </button>

                            {user ? (
                                <div className="relative hidden lg:block" ref={userMenuRef}>
                                    <button
                                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                                        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                                            {user.username.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="hidden xl:block text-sm font-medium text-slate-700 dark:text-slate-200">
                                            {user.username}
                                        </span>
                                        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* User Dropdown */}
                                    {isUserMenuOpen && (
                                        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-200 dark:border-slate-800 overflow-hidden animate-dropdown">
                                            {/* User Info */}
                                            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                                                <p className="font-semibold text-slate-900 dark:text-white text-sm">{user.username}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user.email}</p>
                                                {user.is_superuser && (
                                                    <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold rounded-full">
                                                        <Shield size={10} />
                                                        {t('nav.platformAdmin', 'Platform Admin')}
                                                    </span>
                                                )}
                                                {!user.is_superuser && user.role === 'tenant_admin' && (
                                                    <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-full">
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
                                <div className="hidden lg:flex items-center gap-2">
                                    <Link
                                        to="/login"
                                        search={{ redirect: undefined }}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-all text-sm shadow-sm shadow-indigo-500/20 hover:shadow-indigo-500/30"
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
                    <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-slide-in">
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
                                    <Link to="/assets/types" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                        <Layers size={18} />
                                        {t('nav.assetTypes')}
                                    </Link>
                                    <Link to="/assets" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                                        <Package size={18} />
                                        {t('nav.assets')}
                                    </Link>
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
                                    <Link to="/login" search={{ redirect: undefined }} onClick={() => setIsMobileMenuOpen(false)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm">
                                        <LogIn size={16} />
                                        {t('nav.login', 'Login')}
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </nav>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-h-0">
                <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 flex-1 min-w-0 flex flex-col">
                    <Outlet />
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-200 dark:border-slate-800 py-2.5 sm:py-3 bg-white/50 dark:bg-slate-900/50 shrink-0">
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
