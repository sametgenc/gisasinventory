/** Capture actual local demo screens without changing inventory or users. */
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const requireFrontend = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = requireFrontend('@playwright/test')
const baseUrl = 'http://127.0.0.1:5190'
const output = fileURLToPath(new URL('../var/demo/screenshots/interface/', import.meta.url))
const health = await fetch(`${baseUrl}/demo/health/`)
if (!health.ok || !(await health.json()).demo) throw new Error('Start the isolated local demo first.')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ headless: true })
try {
    for (const [theme, width, height] of [['light', 1440, 1000], ['dark', 1440, 1000], ['light', 390, 844], ['dark', 390, 844]]) {
        const context = await browser.newContext({ viewport: { width, height }, locale: 'tr-TR', reducedMotion: 'reduce' })
        await context.addInitScript(({ theme }) => {
            localStorage.setItem('language', 'tr')
            localStorage.setItem('vite-ui-theme', theme)
        }, { theme })
        const page = await context.newPage()
        const size = width === 390 ? 'mobile' : 'desktop'
        async function capture(route, name) {
            await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' })
            if (new URL(page.url()).pathname.replace(/\/$/, '') !== route.replace(/\/$/, '')) {
                throw new Error(`Unexpected navigation while capturing ${route}: ${page.url()}`)
            }
            await page.screenshot({ path: path.join(output, `corporate-${name}-${size}-${theme}.png`), fullPage: true })
            const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
            if (!fits) throw new Error(`Horizontal overflow: ${route}, ${size}, ${theme}`)
            console.log(`${size}/${theme}: ${route}`)
        }
        await capture('/', 'home')
        await capture('/auth/password/request', 'password-request')
        await capture('/login', 'login')
        await page.locator('#login-email').fill('admin@demo.gisas.test')
        await page.locator('#login-password').fill(process.env.DEMO_PASSWORD || 'GisasDemo!2026')
        await page.locator('button[type=submit]').click()
        await page.waitForURL(`${baseUrl}/dashboard`)
        await capture('/dashboard', 'dashboard')
        await capture('/assets', 'inventory')
        await page.screenshot({ path: path.join(output, `inventory-types-${size}-${theme}.png`), fullPage: true })
        await page.getByRole('button', { name: 'Forklift · Toyota 8FD ekipmanlarını aç', exact: true }).click()
        await page.getByRole('heading', { name: 'Forklift · Toyota 8FD', exact: true }).waitFor()
        await page.screenshot({ path: path.join(output, `inventory-equipment-${size}-${theme}.png`), fullPage: true })
        if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))) throw new Error(`Equipment detail overflow: ${size}, ${theme}`)
        console.log(`${size}/${theme}: /assets → Forklift`)
        await capture('/shared-equipment', 'shared-equipment')
        await page.screenshot({ path: path.join(output, `shared-equipment-${size}-${theme}.png`), fullPage: true })
        await capture('/assets/types', 'catalog')
        await capture('/account/email', 'account-email')
        if (width === 1440) {
            await capture('/platform/tenants', 'shipyards')
            await capture('/platform/users', 'users')
        }
        await capture('/help', 'guide')
        if (theme === 'dark') {
            await page.keyboard.press('Tab')
            const control = page.getByRole('link', { name: 'Kullanım rehberi', exact: true }).last()
            await control.focus()
            const outline = await control.evaluate(element => {
                const style = getComputedStyle(element)
                return { color: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth }
            })
            if (outline.color !== 'rgb(117, 155, 182)' || outline.style === 'none' || outline.width === '0px') {
                throw new Error(`Dark keyboard focus is not visible: ${JSON.stringify(outline)}`)
            }
        }
        await context.close()
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'tr-TR', reducedMotion: 'reduce' })
    await context.addInitScript(() => {
        localStorage.setItem('language', 'tr')
        localStorage.setItem('vite-ui-theme', 'light')
    })
    const page = await context.newPage()
    await page.goto(`${baseUrl}/login`)
    await page.locator('#login-email').fill('yonetici@demo.gisas.test')
    await page.locator('#login-password').fill(process.env.DEMO_PASSWORD || 'GisasDemo!2026')
    await page.locator('button[type=submit]').click()
    await page.waitForURL(`${baseUrl}/dashboard`)
    await page.goto(`${baseUrl}/assets`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: path.join(output, 'inventory-my-desktop-light.png'), fullPage: true })
    await page.screenshot({ path: path.join(output, 'inventory-types-desktop-light.png'), fullPage: true })
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))) throw new Error('Own inventory overflow')
    await page.getByRole('button', { name: 'Forklift · Toyota 8FD ekipmanlarını aç', exact: true }).click()
    await page.getByRole('heading', { name: 'Forklift · Toyota 8FD', exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'inventory-equipment-desktop-light.png'), fullPage: true })
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))) throw new Error('Own equipment detail overflow')
    await page.goto(`${baseUrl}/shared-equipment`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: path.join(output, 'shared-equipment-desktop-light.png'), fullPage: true })
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))) throw new Error('Member shared list overflow')
    console.log('shipyard manager/light: inventory, equipment, shared list')
    await context.close()
} finally {
    await browser.close()
}
