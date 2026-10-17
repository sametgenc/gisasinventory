import { expect, test, type Page } from '@playwright/test'

const yard = { id: 1, name: 'North Yard', slug: 'north-yard', description: '', address: '', phone: '', email: '', is_active: true, user_count: 0, created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' }
const otherYard = { ...yard, id: 2, name: 'South Yard', slug: 'south-yard' }
const account = { id: 25, username: 'new-operator', email: 'new@example.test', first_name: '', last_name: '', role: 'tenant_user', is_active: true, is_superuser: false, date_joined: '2026-10-15T09:00:00Z', last_login: null, tenant_name: null as string | null, tenant_slug: null as string | null }

async function mockUsers(page: Page, options: { language?: string; superuser?: boolean; tenant?: boolean; inactiveYard?: boolean } = {}) {
    const state = { users: [] as (typeof account)[], failed: false, tenantsFailed: false }
    const writes: { path: string; data: unknown }[] = []
    await page.addInitScript(language => localStorage.setItem('language', language), options.language ?? 'en')
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: {
        status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config')
            ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } }
            : { user: { id: '1', username: 'operator', email: 'operator@example.test', is_superuser: options.superuser ?? true, is_active: true, role: 'tenant_admin', tenant_slug: options.tenant ? yard.slug : null, tenant_name: options.tenant ? yard.name : null }, methods: [] },
    } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request(), path = new URL(request.url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (request.method() !== 'GET') {
            writes.push({ path, data: request.postDataJSON() })
            if (state.failed) return route.fulfill({ status: 400, json: { email: ['This email is already in use.'] } })
            const assignedYard = path.includes('/north-yard/') ? yard : path.includes('/south-yard/') ? otherYard : null
            const created = { ...account, ...request.postDataJSON(), tenant_name: assignedYard?.name ?? null, tenant_slug: assignedYard?.slug ?? null }
            state.users = [created]
            return route.fulfill({ status: 201, json: created })
        }
        if (path === '/api/tenants/' && state.tenantsFailed) return route.fulfill({ status: 500, json: { detail: 'Shipyard list unavailable' } })
        let data: unknown = []
        if (path === '/api/tenants/') data = options.language === 'tr' ? [{ ...yard, name: 'Örnek Kuzey Tersanesi' }, { ...otherYard, name: 'Örnek Güney Tersanesi' }] : [{ ...yard, is_active: !options.inactiveYard }, otherYard]
        if (path === '/api/tenants/north-yard/' || path === '/api/tenants/current/') data = yard
        if (path.endsWith('/all-users/') || path.endsWith('/my-users/') || path.endsWith('/users/')) data = state.users
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        return route.fulfill({ json: data })
    })
    return { state, writes }
}

async function fillIdentity(page: Page) {
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Username').fill(account.username)
    await dialog.getByLabel('Email').fill(account.email)
    await dialog.locator('input[type="password"]').fill('Transient-secret-123!')
    return dialog
}

async function openCreate(page: Page, url = '/platform/users', navigate = true) {
    if (navigate) await page.goto(url)
    await page.getByRole('button', { name: 'Create New User', exact: true }).click()
    return fillIdentity(page)
}

test('global user creation selects shipyard and role, reviews consequences, and creates assigned user in one request', async ({ page }) => {
    const { writes } = await mockUsers(page)
    const dialog = await openCreate(page)
    await dialog.getByLabel('Shipyard').selectOption(yard.slug)
    await dialog.getByRole('button', { name: /^Shipyard Admin/ }).click()
    await dialog.getByRole('button', { name: 'Review user', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'Review new user', exact: true })).toBeVisible()
    await expect(dialog).toContainText(yard.name)
    await expect(dialog).toContainText('Can manage users and usage requests within this shipyard.')
    await expect(dialog).not.toContainText('Transient-secret-123!')
    expect(writes).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Create user and assign', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: account.username })).toContainText(yard.name)
    expect(writes).toEqual([{ path: '/api/tenants/north-yard/create-user/', data: { username: account.username, email: account.email, password: 'Transient-secret-123!', role: 'tenant_admin' } }])
})

test('unassigned creation requires explicit choice, limits role, and explains lack of shipyard access', async ({ page }) => {
    const { writes } = await mockUsers(page)
    const dialog = await openCreate(page)
    await dialog.getByRole('button', { name: 'Review user', exact: true }).click()
    expect(writes).toHaveLength(0)
    await dialog.getByLabel('Shipyard').selectOption(yard.slug)
    await dialog.getByRole('button', { name: /^Shipyard Admin/ }).click()
    await dialog.getByLabel('Shipyard').selectOption('__unassigned__')
    await expect(dialog.getByRole('button', { name: /^Shipyard Admin/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Review user', exact: true }).click()
    await expect(dialog).toContainText('Cannot access a shipyard inventory until assigned.')
    await dialog.getByRole('button', { name: 'Create user', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes).toEqual([{ path: '/api/tenants/create-user-unassigned/', data: { username: account.username, email: account.email, password: 'Transient-secret-123!', role: 'tenant_user' } }])
})

test('shipyard detail presets assignment and supports review without searching existing users', async ({ page }) => {
    const { writes } = await mockUsers(page)
    const dialog = await openCreate(page, '/platform/tenants/north-yard')
    await expect(dialog.getByText(yard.name, { exact: true })).toBeVisible()
    await expect(dialog.getByLabel('Shipyard')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Review user', exact: true }).click()
    await dialog.getByRole('button', { name: 'Create user and assign', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: account.username })).toBeVisible()
    expect(writes[0]?.path).toBe('/api/tenants/north-yard/create-user/')
    expect(writes).toHaveLength(1)
})

test('rejected creation retains review and credentials for correction, retry, and guarded close', async ({ page }) => {
    const { state, writes } = await mockUsers(page)
    state.failed = true
    const dialog = await openCreate(page)
    await dialog.getByLabel('Shipyard').selectOption(otherYard.slug)
    await dialog.getByRole('button', { name: 'Review user', exact: true }).click()
    await dialog.getByRole('button', { name: 'Create user and assign', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('This email is already in use.')
    await dialog.getByRole('button', { name: 'Back to details', exact: true }).click()
    await expect(dialog.getByLabel('Shipyard')).toHaveValue(otherYard.slug)
    await expect(dialog.locator('input[type="password"]')).toHaveValue('Transient-secret-123!')
    await dialog.getByLabel('Email').fill('corrected@example.test')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByLabel('Email')).toHaveValue('corrected@example.test')
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Transient-secret')
    state.failed = false
    await dialog.getByRole('button', { name: 'Review user', exact: true }).click()
    await dialog.getByRole('button', { name: 'Create user and assign', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes).toHaveLength(2)
    expect(writes[1]?.data).toMatchObject({ email: 'corrected@example.test', role: 'tenant_user' })
})

test('pending create locks review, duplicate submissions, dismissal, and history navigation', async ({ page }) => {
    await mockUsers(page)
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    let calls = 0
    await page.route('**/api/tenants/north-yard/create-user/', async route => { calls++; await pending; await route.fulfill({ status: 201, json: account }) })
    await page.goto('/platform/tenants')
    const navigation = page.getByRole('navigation').first()
    await navigation.getByRole('button', { name: 'Management', exact: true }).click()
    await navigation.getByRole('link', { name: 'Users', exact: true }).click()
    const dialog = await openCreate(page, '/platform/users', false)
    await dialog.getByLabel('Shipyard').selectOption(yard.slug)
    await dialog.getByRole('button', { name: 'Review user', exact: true }).click()
    try {
        await dialog.getByRole('button', { name: 'Create user and assign', exact: true }).dblclick()
        await expect(dialog).toHaveAttribute('aria-busy', 'true')
        await expect(dialog.getByRole('button', { name: 'Back to details', exact: true })).toBeDisabled()
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
        await page.keyboard.press('Escape')
        await page.mouse.click(2, 2)
        await page.evaluate(() => window.history.back())
        await expect(dialog).toBeVisible()
        expect(calls).toBe(1)
    } finally { finish() }
    await expect(dialog).not.toBeVisible()
})

test('failed shipyard list is explicit and retry keeps entered user details', async ({ page }) => {
    const { state, writes } = await mockUsers(page)
    state.tenantsFailed = true
    const dialog = await openCreate(page)
    await expect(dialog.getByRole('alert')).toContainText('Shipyard list unavailable', { timeout: 15000 })
    await expect(dialog.getByLabel('Shipyard')).toBeDisabled()
    state.tenantsFailed = false
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(dialog.getByLabel('Shipyard')).toBeEnabled()
    await expect(dialog.getByLabel('Username')).toHaveValue(account.username)
    expect(writes).toHaveLength(0)
})

test('Turkish creation explains assignment and review with Turkish actions', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    const { writes } = await mockUsers(page, { language: 'tr' })
    await page.goto('/platform/users')
    await page.getByRole('button', { name: 'Yeni Kullanıcı Oluştur', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Kullanıcı Adı').fill('ayse.yilmaz')
    await dialog.getByLabel('E-posta').fill('ayse@example.test')
    await dialog.locator('input[type="password"]').fill('Transient-secret-123!')
    await dialog.getByLabel('Tersane').selectOption(yard.slug)
    await dialog.getByRole('button', { name: /^Tersane yöneticisi/i }).click()
    await expect(dialog.getByRole('button', { name: /^Tersane yöneticisi/i })).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: testInfo.outputPath('user-selection.png'), fullPage: true })
    await dialog.getByRole('button', { name: 'Kullanıcıyı gözden geçir', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'Yeni kullanıcıyı gözden geçir', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Kullanıcıyı oluştur ve ata', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('user-review.png'), fullPage: true })
    expect(writes).toHaveLength(0)
})

test('tenant administrator still cannot enter platform user creation', async ({ page }) => {
    const { writes } = await mockUsers(page, { superuser: false, tenant: true })
    await page.goto('/tenant/users')
    await expect(page.getByRole('button', { name: 'Create New User', exact: true })).toHaveCount(0)
    await page.goto('/platform/users')
    await expect(page.getByRole('button', { name: 'Create New User', exact: true })).toHaveCount(0)
    expect(writes).toHaveLength(0)
})


test('inactive shipyard creation explains delayed access while preserving creation and administrator role', async ({ page }) => {
    const { writes } = await mockUsers(page, { inactiveYard: true })
    const dialog = await openCreate(page)
    const shipyard = dialog.getByLabel('Shipyard')
    await expect(shipyard.locator('option[value="north-yard"]')).toHaveText('North Yard · Inactive')
    await shipyard.selectOption(yard.slug)
    const explanation = 'This user cannot access the shipyard inventory until the shipyard is activated.'
    await expect(dialog.getByText(explanation, { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: /^Shipyard Admin/ }).click()
    await dialog.getByRole('button', { name: 'Review user', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'Review new user', exact: true })).toBeVisible()
    await expect(dialog.getByText(explanation, { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Create user and assign', exact: true })).toBeEnabled()
    expect(writes).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Create user and assign', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes).toEqual([{ path: '/api/tenants/north-yard/create-user/', data: { username: account.username, email: account.email, password: 'Transient-secret-123!', role: 'tenant_admin' } }])
})
