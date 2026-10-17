import { expect, test } from '@playwright/test'

for (const account of [
    { name: 'role label only', role: 'platform_admin', is_superuser: false, tenant_slug: 'yard', global: false },
    { name: 'shipyard-bound superuser', role: 'platform_admin', is_superuser: true, tenant_slug: 'yard', global: false },
    { name: 'global administrator', role: 'platform_admin', is_superuser: true, tenant_slug: null, global: true },
    { name: 'unassigned shipyard manager', role: 'tenant_admin', is_superuser: false, tenant_slug: null, global: false },
]) {
    test(`${account.name} sees only actual global access in navigation and dashboard`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.addInitScript(() => localStorage.setItem('language', 'tr'))
        const privilegedCalls: string[] = []
        await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: {
            status: 200, meta: { is_authenticated: true }, data: new URL(route.request().url()).pathname.endsWith('/config')
                ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } }
                : { user: { id: 'account', username: 'account', email: 'account@example.test', ...account }, methods: [] },
        } }))
        await page.route('**/api/**', route => {
            const path = new URL(route.request().url()).pathname
            if (!path.startsWith('/api/')) return route.continue()
            if (path.endsWith('/stream/')) return route.abort()
            if (path.endsWith('/all-users/')) privilegedCalls.push(path)
            const data = path.endsWith('/unread_count/') ? { unread_count: 0 }
                : path.endsWith('/current/') ? { id: 1, name: 'Test Yard', slug: 'yard' } : []
            return route.fulfill({ json: data })
        })
        await page.goto('/dashboard')
        await expect(page.getByRole('heading', { name: 'Envanter özeti', exact: true })).toBeVisible()
        const navigation = page.getByRole('navigation').first()
        await expect(navigation.getByRole('link', { name: account.global ? 'Birleşik envanter' : 'Envanterim', exact: true })).toBeVisible()
        if (account.global) await navigation.getByRole('button', { name: 'Yönetim', exact: true }).click()
        await expect(navigation.getByRole('link', { name: 'Tersaneler', exact: true })).toHaveCount(account.global ? 1 : 0)
        await page.getByRole('button', { name: 'account', exact: true }).click()
        await expect(navigation.getByText('Platform yöneticisi', { exact: true })).toHaveCount(account.global ? 1 : 0)
        if (!account.global) expect(privilegedCalls).toEqual([])
        await page.goto(account.role === 'tenant_admin' ? '/tenant/users' : '/platform/users')
        if (account.global) await expect(page.getByRole('heading', { name: 'Kullanıcı Yönetimi', exact: true })).toBeVisible()
        else await expect(page).toHaveURL(/\/dashboard$/)
    })
}
