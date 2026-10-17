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

test('usage requests live in the shared work area and are absent from the account menu', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await account(page)
    await page.goto('/shared-equipment')
    const primary = page.getByRole('navigation').first()
    await expect(primary.getByRole('link', { name: 'Ortak kullanım', exact: true })).toHaveAttribute('aria-current', 'page')
    const shared = page.getByRole('navigation', { name: 'Ortak kullanım gezinmesi', exact: true })
    await shared.getByRole('link', { name: 'Kullanım talepleri', exact: true }).click()
    await expect(page).toHaveURL(/\/shared-usage$/)
    await expect(shared.getByRole('link', { name: 'Kullanım talepleri', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('button', { name: 'nav-user', exact: true }).click()
    await expect(primary.getByRole('link', { name: 'Kullanım talepleri', exact: true })).toHaveCount(0)
    await expect(primary.getByRole('link', { name: 'Şifre Değiştir', exact: true })).toBeVisible()
})

test('global management has one dedicated group while account menu stays focused on the account', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await account(page, 'platform_admin', true, false)
    await page.goto('/platform/users')
    const primary = page.getByRole('navigation').first()
    const management = primary.getByRole('button', { name: 'Yönetim', exact: true })
    await expect(management).toHaveAttribute('aria-expanded', 'false')
    await management.click()
    await expect(primary.getByRole('link', { name: 'Tersaneler', exact: true })).toHaveCount(1)
    await expect(primary.getByRole('link', { name: 'Uygulama Ayarları', exact: true })).toBeVisible()
    await management.press('Escape')
    await expect(management).toBeFocused()
    await page.getByRole('button', { name: 'nav-user', exact: true }).click()
    await expect(primary.getByRole('link', { name: 'Tersaneler', exact: true })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Ortak kullanım gezinmesi', exact: true })).toHaveCount(0)
})

for (const role of ['tenant_user', 'tenant_admin']) {
    for (const width of [320, 390]) {
        test(`${role} daily navigation stays reachable at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 760 })
            await account(page, role)
            await page.goto('/shared-equipment')
            await page.getByRole('button', { name: 'Menüyü aç veya kapat', exact: true }).click()
            const menu = page.locator('#mobile-navigation')
            await expect(menu.getByRole('link', { name: 'Ana sayfa', exact: true })).toBeVisible()
            await expect(menu.getByRole('link', { name: 'Envanterim', exact: true })).toBeVisible()
            await expect(menu.getByRole('link', { name: 'Ortak kullanım', exact: true })).toBeVisible()
            await expect(menu.getByRole('link', { name: 'Kullanıcılarım', exact: true })).toHaveCount(role === 'tenant_admin' ? 1 : 0)
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        })
    }
}

test('a platform role label cannot reveal the management group', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await account(page, 'platform_admin', false, true)
    await page.goto('/shared-equipment')
    await expect(page.getByRole('button', { name: 'Yönetim', exact: true })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Ortak kullanım gezinmesi', exact: true }).getByRole('link', { name: 'Kullanım talepleri', exact: true })).toHaveCount(0)
})

test('Escape from an account link returns keyboard focus to the account trigger', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await account(page)
    await page.goto('/shared-equipment')
    const trigger = page.getByRole('button', { name: 'nav-user', exact: true })
    await trigger.focus()
    await trigger.press('Enter')
    await page.keyboard.press('Tab')
    const firstLink = page.locator('#account-navigation a').first()
    await expect(firstLink).toBeFocused()
    await firstLink.press('Escape')
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})
