import { Moon, Sun } from "lucide-react"
import { useTheme } from "./ThemeProvider"

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()

    return (
        <button
            onClick={(e) => setTheme(theme === "light" ? "dark" : "light", e)}
            className="relative p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            style={{ viewTransitionName: "theme-toggle" }}
            aria-label="Toggle theme"
        >
            <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-[transform] duration-300 dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-[transform] duration-300 dark:rotate-0 dark:scale-100 top-2 left-2" />
        </button>
    )
}
