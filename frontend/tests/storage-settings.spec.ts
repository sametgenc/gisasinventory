import { expect, test, type Page } from '@playwright/test'

const gib = 1024 ** 3
const normalDisk = { status: 'ok', total_bytes: 100 * gib, used_bytes: 40 * gib, free_bytes: 60 * gib, used_percent: 40 }
const snapshot = {
    checked_at: '2026-10-17T09:30:00Z',
    application_disk: normalDisk,
    media_disk: { ...normalDisk, status: 'warning', used_bytes: 87 * gib, free_bytes: 13 * gib, used_percent: 87 },
    database: { status: 'ok', engine: 'postgresql', size_bytes: 2 * gib, capacity_bytes: null, used_percent: null },
}
const smtp = { host: 'smtp.example.test', port: 587, username: 'operator@example.test', password_set: true, use_tls: true, use_ssl: false, from_email: 'platform@example.test', is_configured: true, updated_at: null, delivery_mode: 'smtp', mfa_enabled: false, mfa_verified_recently: false, reauthentication_required: false }

async function mockSettings(page: Page, options: { language?: 'tr' | 'en'; role?: 'global' | 'tenant_admin' | 'tenant_user' | 'unassigned' | 'bound_superuser'; smtpFailed?: boolean } = {}) {
    const role = options.role ?? 'global'
    const assigned = role === 'tenant_admin' || role === 'tenant_user' || role === 'bound_superuser'
    const state = { snapshot, failed: false, storageCalls: 0, writes: [] as string[] }
    await page.addInitScript(language => localStorage.setItem('language', language), options.language ?? 'en')
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: {
        status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config')
            ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } }
            : { user: { id: '1', username: 'operator', email: 'operator@example.test', is_active: true, is_superuser: role === 'global' || role === 'bound_superuser', role: role === 'tenant_admin' ? 'tenant_admin' : 'tenant_user', tenant_slug: assigned ? 'north-yard' : null, tenant_name: assigned ? 'North Yard' : null }, methods: [] },
    } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request(), path = new URL(request.url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (request.method() !== 'GET') state.writes.push(path)
        if (path === '/api/settings/storage/') {
            state.storageCalls++
            if (state.failed) return route.fulfill({ status: 503, json: { detail: 'Unavailable' } })
            return route.fulfill({ json: state.snapshot })
        }
        if (path === '/api/settings/smtp/') return route.fulfill(options.smtpFailed ? { status: 503, json: { detail: 'Unavailable' } } : { json: smtp })
        if (path === '/api/settings/smtp/status/') return route.fulfill({ json: { is_configured: true } })
        if (path.endsWith('/unread_count/')) return route.fulfill({ json: { unread_count: 0 } })
        return route.fulfill({ json: [] })
    })
    return state
}

test('global administrator reads separate disk and database measurements without writes', async ({ page }) => {
    const state = await mockSettings(page)
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto('/platform/settings')
    const storage = page.getByRole('region', { name: 'Storage usage', exact: true })
    await expect(storage).toBeVisible()
    await expect(storage.getByRole('heading', { name: 'Application disk', exact: true })).toBeVisible()
    await expect(storage.getByRole('progressbar', { name: 'Application disk usage', exact: true })).toHaveAttribute('aria-valuenow', '40')
    await expect(storage.getByRole('progressbar', { name: 'Uploaded files disk usage', exact: true })).toHaveAttribute('aria-valuenow', '87')
    await expect(storage).toContainText('40 GiB used')
    await expect(storage).toContainText('60 GiB free')
    await expect(storage).toContainText('100 GiB total')
    await expect(storage.getByText('Low free space', { exact: true })).toBeVisible()
    await expect(storage.getByText('2 GiB', { exact: true })).toBeVisible()
    await expect(storage).toContainText('Capacity unknown')
    await expect(storage).toContainText('Database size does not show how much space is free on its disk.')
    await expect(storage).toContainText('These may share one disk; do not add the measurements together.')
    await expect(storage).toContainText('Updated:')
    await expect(storage.getByRole('progressbar')).toHaveCount(2)
    await expect(page.getByLabel('SMTP Server', { exact: true })).toHaveValue('smtp.example.test')
    expect(state.writes).toEqual([])
    expect(state.storageCalls).toBe(1)
})

test('Turkish mobile view fits screen and refresh works by keyboard without submitting SMTP', async ({ page }, testInfo) => {
    const state = await mockSettings(page, { language: 'tr' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/platform/settings')
    const storage = page.getByRole('region', { name: 'Depolama durumu', exact: true })
    await expect(storage).toBeVisible()
    await expect(storage).toContainText('40 GiB kullanılıyor')
    await expect(storage).toContainText('Kapasite bilinmiyor')
    const refresh = storage.getByRole('button', { name: 'Depolama bilgisini yenile', exact: true })
    await refresh.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => state.storageCalls).toBe(2)
    await expect(refresh).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await storage.screenshot({ path: testInfo.outputPath('storage-mobile-tr.png') })
    expect(state.writes).toEqual([])
})

test('critical disk and unavailable measurements remain explicit without fabricated database percent', async ({ page }) => {
    const state = await mockSettings(page)
    state.snapshot = { ...snapshot, application_disk: { ...normalDisk, status: 'critical', used_bytes: 98 * gib, free_bytes: 2 * gib, used_percent: 98 }, media_disk: { status: 'unavailable', total_bytes: null, used_bytes: null, free_bytes: null, used_percent: null }, database: { ...snapshot.database, status: 'unavailable', size_bytes: null } } as typeof snapshot
    await page.goto('/platform/settings')
    const storage = page.getByRole('region', { name: 'Storage usage', exact: true })
    await expect(storage.getByText('Almost full', { exact: true })).toBeVisible()
    await expect(storage.getByRole('progressbar')).toHaveCount(1)
    await expect(storage.getByText('Measurement unavailable', { exact: true })).toHaveCount(2)
    await expect(storage).not.toContainText('0 GiB')
    await expect(storage).not.toContainText('NaN')
})

test('network failure clears stale capacity and retry recovers independently of SMTP errors', async ({ page }) => {
    const state = await mockSettings(page, { smtpFailed: true })
    await page.goto('/platform/settings')
    const storage = page.getByRole('region', { name: 'Storage usage', exact: true })
    await expect(storage.getByRole('progressbar')).toHaveCount(2)
    await expect(page.getByRole('alert').filter({ hasText: 'Email settings could not be loaded' })).toBeVisible()
    state.failed = true
    await storage.getByRole('button', { name: 'Refresh storage usage', exact: true }).click()
    await expect(storage.getByRole('alert')).toContainText('Storage usage could not be loaded. Try again.')
    await expect(storage.getByRole('progressbar')).toHaveCount(0)
    await expect(storage).not.toContainText('2 GiB')
    state.failed = false
    await storage.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(storage.getByRole('progressbar')).toHaveCount(2)
    expect(state.writes).toEqual([])
})

test('pending measurement shows loading and prevents overlapping refreshes', async ({ page }) => {
    await mockSettings(page)
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    let calls = 0
    await page.route('**/api/settings/storage/', async route => { calls++; await pending; await route.fulfill({ json: snapshot }) })
    try {
        await page.goto('/platform/settings')
        const storage = page.getByRole('region', { name: 'Storage usage', exact: true })
        await expect(storage.getByRole('status')).toContainText('Loading storage usage')
        await expect(storage.getByRole('button', { name: 'Refresh storage usage', exact: true })).toBeDisabled()
        expect(calls).toBe(1)
        await expect(page.getByLabel('SMTP Server', { exact: true })).toHaveValue('smtp.example.test')
    } finally { finish() }
    await expect(page.getByRole('progressbar')).toHaveCount(2)
})

for (const role of ['tenant_admin', 'tenant_user', 'unassigned', 'bound_superuser'] as const) {
    test(`${role} cannot open platform storage measurements`, async ({ page }) => {
        const state = await mockSettings(page, { role })
        await page.goto('/platform/settings')
        await expect(page.getByRole('region', { name: 'Storage usage', exact: true })).toHaveCount(0)
        await expect(page.getByRole('heading', { name: 'Application Settings', exact: true })).toHaveCount(0)
        expect(state.storageCalls).toBe(0)
    })
}
