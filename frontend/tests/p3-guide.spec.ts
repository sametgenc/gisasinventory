import { expect, test } from '@playwright/test'

test('platform usage guide explains the correct account instead of suggesting global reassignment', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } } : { user: { id: '1', username: 'platform', email: 'platform@example.test', is_superuser: true, tenant_id: null, tenant_slug: null, role: 'platform_admin' }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), route => route.request().url().endsWith('/stream/') ? route.abort() : route.fulfill({ json: route.request().url().includes('unread_count') ? { unread_count: 0 } : [] }))
    await page.goto('/help?task=usage&step=3')
    await expect(page.locator('.guide-interactive')).toContainText('Use the relevant shipyard account for usage requests, approval, handover and return.')
    await expect(page.locator('.guide-interactive')).not.toContainText('Your account needs a shipyard assignment')
    await expect(page.locator('.guide-interactive a[href="/shared-usage"]')).toHaveCount(0)
})
