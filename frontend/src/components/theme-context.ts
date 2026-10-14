import { createContext, useContext, type MouseEvent } from 'react'

export type Theme = 'dark' | 'light' | 'system'

export const ThemeContext = createContext<{
    theme: Theme
    resolvedTheme: 'dark' | 'light'
    setTheme: (theme: Theme, event?: MouseEvent<HTMLElement>) => void
} | undefined>(undefined)

export function useTheme() {
    const context = useContext(ThemeContext)
    if (!context) throw new Error('useTheme must be used within a ThemeProvider')
    return context
}
