import { expect, test, type Page } from '@playwright/test'

async function account(page: Page, role = 'tenant_user', global = false, assigned = true) {
    await page.addInitScript(() => localStorage.setItem('language', 'tr'))
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: {
        status: 200, meta: { is_authenticated: true }, data: new URL(route.request().url()).pathname.endsWith('/config')
            ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } }
            : { user: { id: 'nav-user', username: 'nav-user', email: 'nav@example.test', role, is_superuser: global,
                tenant_id: assigned ? 1 : null, tenant_slug: assigned ? 'yard' : null, tenant_name: assigned ? 'Test Yard' : null }, methods: [] },
    } }))
    await page.route(url => url.pathname.startsWith('/api/'), route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        return route.fulfill({ json: path.endsWith('/unread_count/') ? { unread_count: 0 }
            : path.endsWith('/current/') ? { id: 1, name: 'Test Yard', slug: 'yard' }
                : path.includes('/usage-requests/') || path.includes('/shared/') ? { count: 0, results: [], next: null, previous: null } : [] })
    })
}

for (const role of ['tenant_user', 'tenant_admin', 'platform_admin']) {
    test(`mobile navigation Escape returns to trigger for ${role}`, async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 740 })
        await account(page, role, role === 'platform_admin', role !== 'platform_admin')
        await page.goto('/dashboard')
        const trigger = page.getByRole('button', { name: 'Menüyü aç veya kapat', exact: true })
        await trigger.focus()
        await page.keyboard.press('Enter')
        await page.keyboard.press('Tab')
        await expect(page.locator('#mobile-navigation a').first()).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(page.locator('#mobile-navigation')).toHaveCount(0)
        await expect(trigger).toBeFocused()
    })
}
for (const width of [1440, 390]) {
    test(`skip navigation keeps first heading visible below sticky menu at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 740 })
        await account(page)
        await page.goto('/help')
        const heading = page.getByRole('heading').first()
        await expect(heading).toBeVisible()
        await page.keyboard.press('Tab')
        await expect(page.getByRole('link', { name: 'İçeriğe geç', exact: true })).toBeFocused()
        await page.keyboard.press('Enter')
        const title = await heading.boundingBox()
        const menu = await page.getByRole('navigation', { name: 'Ana gezinme', exact: true }).boundingBox()
        expect(title!.y).toBeGreaterThanOrEqual(menu!.y + menu!.height)
    })

    test(`skip navigation reaches main content at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await account(page)
        await page.goto('/dashboard')
        await expect(page.getByRole('heading').first()).toBeVisible()
        await page.keyboard.press('Tab')
        const skip = page.getByRole('link', { name: 'İçeriğe geç', exact: true })
        await expect(skip).toBeFocused()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('main')).toBeFocused()
    })
}
