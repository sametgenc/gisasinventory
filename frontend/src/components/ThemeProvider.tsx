import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { flushSync } from "react-dom"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
    children: React.ReactNode
    defaultTheme?: Theme
    storageKey?: string
}

type ThemeProviderState = {
    theme: Theme
    setTheme: (theme: Theme, event?: React.MouseEvent) => void
}

const initialState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

function resolveTheme(theme: Theme): "dark" | "light" {
    if (theme === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    }
    return theme
}

function applyThemeToRoot(theme: Theme) {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(resolveTheme(theme))
    root.style.removeProperty("background-color")
}

export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "vite-ui-theme",
}: ThemeProviderProps) {
    const [theme, setThemeState] = useState<Theme>(
        () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
    )
    const isTransitioning = useRef(false)

    useEffect(() => {
        if (!isTransitioning.current) {
            applyThemeToRoot(theme)
        }
    }, [theme])

    const setTheme = useCallback((newTheme: Theme, event?: React.MouseEvent) => {
        if (isTransitioning.current) return

        const x = event?.clientX ?? window.innerWidth / 2
        const y = event?.clientY ?? window.innerHeight / 2

        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        )

        const supportsViewTransition = typeof document !== "undefined" &&
            "startViewTransition" in document

        if (!supportsViewTransition) {
            localStorage.setItem(storageKey, newTheme)
            setThemeState(newTheme)
            return
        }

        isTransitioning.current = true
        const isDark = resolveTheme(newTheme) === "dark"

        document.documentElement.classList.add("theme-transitioning")

        const transition = (document as any).startViewTransition(() => {
            flushSync(() => {
                localStorage.setItem(storageKey, newTheme)
                setThemeState(newTheme)
            })
            applyThemeToRoot(newTheme)
        })

        transition.ready.then(() => {
            const clipPath = [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endRadius}px at ${x}px ${y}px)`,
            ]

            document.documentElement.animate(
                { clipPath: isDark ? clipPath : [...clipPath].reverse() },
                {
                    duration: 700,
                    easing: "ease-in-out",
                    pseudoElement: isDark
                        ? "::view-transition-new(root)"
                        : "::view-transition-old(root)",
                }
            )
        })

        transition.finished.then(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    document.documentElement.classList.remove("theme-transitioning")
                    isTransitioning.current = false
                })
            })
        })
    }, [storageKey])

    const value = {
        theme,
        setTheme,
    }

    return (
        <ThemeProviderContext.Provider value={value}>
            {children}
        </ThemeProviderContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext)

    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider")

    return context
}
