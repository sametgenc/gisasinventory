import { Moon, Sun } from "lucide-react"
import { useTheme } from "./theme-context"

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme()

    return (
        <button
            type="button"
            onClick={(e) => setTheme(resolvedTheme === "light" ? "dark" : "light", e)}
            className="p-2 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle theme"
        >
            {resolvedTheme === 'light' ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </button>
    )
}
