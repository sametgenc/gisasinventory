import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const requireFrontend = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = requireFrontend('@playwright/test')
const baseUrl = 'http://127.0.0.1:5190'
const output = fileURLToPath(new URL('../var/demo/screenshots/guide-inspection/', import.meta.url))
const response = await fetch(`${baseUrl}/demo/health/`)
if (!response.ok || !(await response.json()).demo) throw new Error('The isolated local demo must be running.')
const browser = await chromium.launch({ headless: true })
try {
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'light'], [390, 'dark']]) {
        const context = await browser.newContext({ viewport: { width, height: 960 }, locale: 'tr-TR', reducedMotion: 'reduce' })
        await context.addInitScript(theme => { localStorage.setItem('language', 'tr'); localStorage.setItem('vite-ui-theme', theme) }, theme)
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(`${baseUrl}/login`)
        await page.locator('#login-email').fill('admin@demo.gisas.test')
        await page.locator('#login-password').fill(process.env.DEMO_PASSWORD || 'GisasDemo!2026')
        await page.locator('button[type=submit]').click()
        await page.waitForURL(`${baseUrl}/dashboard`)
        await page.goto(`${baseUrl}/help`, { waitUntil: 'networkidle' })
        await page.getByRole('heading', { name: 'Kullanım rehberi', exact: true }).waitFor()
        if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))) throw new Error('Guide overflow')
        if (!(await page.evaluate(() => [...document.querySelectorAll('.user-guide img')].every(img => img.complete && img.naturalWidth > 0)))) throw new Error('A guide image failed to load')
        const filename = width === 1440 && theme === 'light' ? 'guide-new.png' : `guide-new-${width === 390 ? 'mobile' : 'desktop'}-${theme}.png`
        await page.screenshot({ path: path.join(output, filename), fullPage: true })
        if (width === 1440 && theme === 'light') {
            await page.goto(`${baseUrl}/help?task=publish&step=1`, { waitUntil: 'networkidle' })
            await page.screenshot({ path: path.join(output, 'guide-publish-new.png'), fullPage: true })
        }
        if (errors.length) throw new Error(errors.join('; '))
        console.log(`${width}/${theme}: loaded, no overflow or page error`)
        await context.close()
    }
} finally {
    await browser.close()
}
