import { test, expect, type Page } from '@playwright/test'

async function session(page: Page, role = 'tenant_admin', assigned = true) {
    let authenticated = true
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('**/_allauth/browser/v1/**', async route => {
        const config = route.request().url().endsWith('/config')
        const status = config || authenticated ? 200 : 401
        await route.fulfill({ status, json: { status, meta: { is_authenticated: authenticated }, data: config ? {
            account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
        } : authenticated ? { user: { id: '1', username: 'guide-user', email: 'guide@example.test', role, tenant_id: assigned ? 1 : null, tenant_slug: assigned ? 'test-yard' : null }, methods: [] } : { flows: [] } } })
    })
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        if (route.request().url().endsWith('/stream/')) return route.abort()
        const path = new URL(route.request().url()).pathname
        await route.fulfill({ json: path === '/api/auth/captcha/' ? { enabled: false } : path.includes('unread_count') ? { unread_count: 0 } : [] })
    })
    return { revoke: () => { authenticated = false } }
}

async function guestSession(page: Page) {
    let authenticated = false
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('**/_allauth/browser/v1/**', async route => {
        if (route.request().url().endsWith('/config')) {
            await route.fulfill({ json: { status: 200, data: { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } } } })
            return
        }
        if (route.request().url().endsWith('/auth/login') && route.request().method() === 'POST') authenticated = true
        const status = authenticated ? 200 : 401
        await route.fulfill({ status, json: { status, meta: { is_authenticated: authenticated }, data: authenticated
            ? { user: { id: '1', username: 'guide-user', email: 'guide@example.test', role: 'tenant_admin', tenant_slug: 'test-yard' }, methods: [] }
            : { flows: [{ id: 'login' }] } } })
    })
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        if (route.request().url().endsWith('/stream/')) return route.abort()
        const path = new URL(route.request().url()).pathname
        await route.fulfill({ json: path === '/api/auth/captcha/' ? { enabled: false } : path.includes('unread_count') ? { unread_count: 0 } : [] })
    })
}

for (const width of [1440, 390]) {
    test(`guide is absent from public home and login navigation at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await guestSession(page)
        for (const path of ['/', '/login']) {
            await page.goto(path)
            await expect(page.getByRole('heading').first()).toBeVisible()
            if (width < 1280) await page.getByRole('button', { name: 'Toggle navigation menu' }).click()
            await expect(page.locator('a[href^="/help"]')).toHaveCount(0)
        }
    })
}

test('direct guide access requires sign-in and returns to the selected step', async ({ page }) => {
    await guestSession(page)
    await page.goto('/help?task=publish&step=1')
    await expect(page).toHaveURL(/\/login\?redirect=/)
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/help?task=publish&step=1')
    await expect(page.getByRole('heading', { name: 'User guide', exact: true })).not.toBeVisible()
    await expect(page.locator('a[href^="/help"]')).toHaveCount(0)
    await page.locator('#login-email').fill('guide@example.test')
    await page.locator('#login-password').fill('ExamplePassword!2026')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/help\?task=publish&step=1$/)
    await expect(page.getByRole('heading', { name: 'User guide', exact: true })).toBeVisible()
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
})

test('guide disappears when the authenticated session is revoked', async ({ page }) => {
    const auth = await session(page)
    await page.goto('/help?task=inspect&step=1')
    await expect(page.getByRole('heading', { name: 'User guide', exact: true })).toBeVisible()
    auth.revoke()
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('allauth.auth.change', {
        detail: { status: 401, meta: { is_authenticated: false }, data: { flows: [] } },
    })))
    await expect(page).toHaveURL(/\/login\?redirect=/)
    await expect(page.getByRole('heading', { name: 'User guide', exact: true })).not.toBeVisible()
    await expect(page.locator('a[href^="/help"]')).toHaveCount(0)
})

for (const width of [1280, 390]) {
    test(`guide navigation, search and screenshot zoom work at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await session(page)
        const writes: string[] = []
        page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') writes.push(request.url()) })
        await page.goto('/help?task=publish&step=1')
        await expect(page.getByRole('heading', { name: 'User guide', exact: true })).toBeVisible()
        await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
        await page.getByRole('button', { name: 'Next step', exact: true }).click()
        await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
        await page.goBack()
        await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
        const image = page.locator('.guide-interactive img').first()
        await expect(image).toBeVisible()
        await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
        const zoom = page.getByRole('button', { name: 'Enlarge screenshot', exact: true })
        await zoom.click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.keyboard.press('Tab')
        await expect(page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true })).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).not.toBeVisible()
        await expect(zoom).toBeFocused()
        if (width < 1024) await page.getByRole('combobox', { name: 'What would you like to do?' }).selectOption('excel')
        else await page.getByRole('link', { name: 'Import my Excel inventory', exact: true }).click()
        await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
        await page.getByRole('searchbox', { name: 'Search guide' }).fill('fields required')
        const question = page.locator('.guide-interactive').getByText('Are new fields required?', { exact: true })
        await question.click()
        await expect(page.locator('.guide-interactive').getByText('New fields start optional. Making a field required notifies owners of incomplete records. Renaming a field preserves existing values.', { exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
        expect(writes).toEqual([])
    })
}

test('print includes every task and answer while hiding an open screenshot dialog', async ({ page }) => {
    await session(page)
    await page.goto('/help?task=add&step=2')
    await page.getByRole('button', { name: 'Enlarge screenshot', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.locator('.guide-print')).toBeVisible()
    await expect(page.locator('.guide-print section')).toHaveCount(8)
    await expect(page.locator('.guide-print').getByText('New fields start optional. Making a field required notifies owners of incomplete records. Renaming a field preserves existing values.', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('visible')
})

test('guide blocks unauthorized action links and safely handles invalid deep links', async ({ page }) => {
    await session(page, 'tenant_user')
    await page.goto('/help?task=publish&step=5')
    await expect(page.getByText('An authorized administrator performs this task.')).toBeVisible()
    await expect(page.locator('.guide-interactive a[href="/assets"]')).toHaveCount(0)
    await page.goto('/help?task=unexpected&step=-999')
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    await expect(page.getByRole('heading', { name: 'Browse my inventory', exact: true })).toBeVisible()
})
