import { expect, test } from '@playwright/test'

for (const role of ['global', 'tenant_admin', 'platform_admin']) {
    test(`user creation guide keeps action within existing permissions for ${role}`, async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('language', 'en'))
        await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } } : {
            user: { id: '1', username: 'example', email: 'example@example.test', role: role === 'global' ? 'platform_admin' : role, is_superuser: role === 'global', is_active: true,
                tenant_id: role === 'tenant_admin' ? 1 : null, tenant_slug: role === 'tenant_admin' ? 'example-yard' : null }, methods: [],
        } } }))
        await page.route(url => url.pathname.startsWith('/api/'), route => route.request().url().endsWith('/stream/') ? route.abort() : route.fulfill({ json: route.request().url().includes('unread_count') ? { unread_count: 0 } : [] }))
        await page.goto('/help?task=users&step=3')
        await expect(page.getByRole('heading', { name: 'Create and assign a user', exact: true })).toBeVisible()
        await expect(page.locator('.guide-interactive').getByRole('link', { name: 'Open user management', exact: true })).toHaveCount(role === 'global' ? 1 : 0)
        await expect(page.locator('.guide-interactive')).toContainText('Create user and assign')
        if (role === 'global') {
            for (const [url, filename] of [
                ['/help?task=users&step=1', 'users-create.png'],
                ['/help?task=users&step=2', 'users-review.png'],
                ['/help?task=inspect&step=2', 'inventory-export.png'],
                ['/help?task=excel&step=1', 'inventory-import-file.png'],
            ]) {
                await page.goto(url)
                const image = page.locator('.guide-interactive img').first()
                await expect(image).toHaveAttribute('src', new RegExp(filename.replace('.', '\\.')))
                await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
            }
        }
    })
}
