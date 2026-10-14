import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { ThemeContext, type Theme } from './theme-context'

const darkQuery = '(prefers-color-scheme: dark)'
const subscribeToSystemTheme = (onChange: () => void) => {
    const media = window.matchMedia(darkQuery)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
}
const getSystemTheme = () => window.matchMedia(darkQuery).matches

export function ThemeProvider({
    children,
    defaultTheme = 'system',
    storageKey = 'vite-ui-theme',
}: { children: ReactNode; defaultTheme?: Theme; storageKey?: string }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        try {
            const saved = localStorage.getItem(storageKey)
            return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : defaultTheme
        } catch {
            return defaultTheme
        }
    })
    const systemIsDark = useSyncExternalStore(subscribeToSystemTheme, getSystemTheme, () => false)
    const resolvedTheme = theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme
    const isTransitioning = useRef(false)

    useLayoutEffect(() => {
        const root = document.documentElement
        root.classList.remove('light', 'dark')
        root.classList.add(resolvedTheme)
        root.style.backgroundColor = resolvedTheme === 'dark' ? '#101923' : '#f5f7f9'
        root.style.colorScheme = resolvedTheme
    }, [resolvedTheme])

    const setTheme = useCallback((newTheme: Theme, event?: MouseEvent<HTMLElement>) => {
        if (isTransitioning.current) return
        const commit = () => {
            try {
                localStorage.setItem(storageKey, newTheme)
            } catch {
                // The theme still works when browser storage is unavailable.
            }
            setThemeState(newTheme)
        }
        if (typeof document.startViewTransition !== 'function' ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            commit()
            return
        }

        // Use the actual button's viewport bounds, including keyboard activation,
        // clicks on the SVG icon, and clicks while the page is scrolled.
        const rect = event?.currentTarget.getBoundingClientRect()
        const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
        const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
        const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
        const root = document.documentElement
        const cleanup = () => {
            root.classList.remove('theme-transitioning')
            isTransitioning.current = false
        }
        isTransitioning.current = true
        root.classList.add('theme-transitioning')
        try {
            const transition = document.startViewTransition(() => flushSync(commit))
            void transition.ready.then(() => {
                root.animate({ clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${radius}px at ${x}px ${y}px)`,
                ] }, { duration: 550, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' })
            }).catch(() => transition.skipTransition())
            void transition.finished.then(cleanup, cleanup)
        } catch {
            cleanup()
            commit()
        }
    }, [storageKey])

    return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
}
