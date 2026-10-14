import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../src/components/ThemeProvider'
import { ThemeToggle } from '../src/components/ThemeToggle'
import '../src/index.css'

createRoot(document.getElementById('root')!).render(
    <ThemeProvider>
        <nav style={{ position: 'sticky', top: 0, padding: 30, display: 'flex', justifyContent: 'flex-end' }}>
            <ThemeToggle />
        </nav>
        <main style={{ minHeight: '250vh' }}>Theme regression fixture</main>
    </ThemeProvider>,
)
