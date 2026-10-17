import { expect, test, type Page } from '@playwright/test'

const yard = {
    id: 1, name: 'Test Yard', slug: 'test-yard', description: '', address: '',
    phone: '', email: '', is_active: true, user_count: 1,
    created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z',
}
const manager = {
    id: 2, username: 'yard-manager', email: 'manager@example.test', first_name: '', last_name: '',
    role: 'tenant_admin', is_active: true, is_superuser: false, date_joined: '2026-10-14T09:00:00Z',
    last_login: null, tenant_name: yard.name, tenant_slug: yard.slug,
}

async function mockManagement(page: Page, superuser = true) {
    const state = { failedPath: '', removalFails: false, tenantSaveFails: false, deleteFails: false, removed: false, users: [manager], tenants: [yard] }
    const writes: { path: string; data: unknown }[] = []
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: {
        status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config')
            ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } }
            : { user: { id: '1', username: 'operator', email: 'operator@example.test', is_superuser: superuser,
                role: 'tenant_admin', tenant_slug: superuser ? null : yard.slug, tenant_name: superuser ? null : yard.name }, methods: [] },
    } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (state.failedPath === path) return route.fulfill({ status: 500, json: { detail: 'Load temporarily unavailable' } })
        if (request.method() !== 'GET') {
            writes.push({ path, data: request.postData() ? request.postDataJSON() : null })
            if (path.endsWith('/remove-user/')) {
                if (state.removalFails) return route.fulfill({ status: 500, json: { detail: 'Removal temporarily unavailable' } })
                state.removed = true
            }
            if (path === '/api/tenants/' && state.tenantSaveFails) return route.fulfill({ status: 400, json: { email: ['Contact cannot be saved'] } })
            if (request.method() === 'DELETE') {
                if (state.deleteFails) return route.fulfill({ status: 409, json: { detail: 'History prevents deletion' } })
                return route.fulfill({ status: 204 })
            }
            return route.fulfill({ json: { ...yard, ...request.postDataJSON() } })
        }
        let data: unknown = []
        if (path === '/api/tenants/') data = state.tenants
        if (path === '/api/tenants/current/' || path === '/api/tenants/test-yard/') data = yard
        if (['/api/tenants/all-users/', '/api/tenants/my-users/', '/api/tenants/test-yard/users/'].includes(path)) data = state.removed ? [] : state.users
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
    return { state, writes }
}

const importFile = { name: 'shipyards.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('mock workbook') }

test('pending management bulk import blocks close, method changes, duplicate upload and history navigation', async ({ page }) => {
    const { state } = await mockManagement(page)
    let finishImport!: () => void
    const pending = new Promise<void>(resolve => { finishImport = resolve })
    await page.route('**/api/tenants/bulk-import-tenants/', async route => {
        await pending
        state.tenants = [...state.tenants, { ...yard, id: 3, slug: 'imported-yard', name: 'Imported Yard' }]
        await route.fulfill({ json: { message: 'Imported successfully', success_count: 1, error_count: 0, errors: [] } })
    })
    await page.goto('/platform/users')
    await page.getByRole('navigation').first().getByRole('button', { name: 'Management', exact: true }).click()
    await page.getByRole('navigation').first().getByRole('link', { name: 'Shipyards', exact: true }).click()
    await page.getByRole('button', { name: 'Bulk Import', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Bulk Import', exact: true })
    const fileInput = dialog.locator('input[type="file"]')
    try {
        await fileInput.setInputFiles(importFile)
        await expect.soft(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
        await expect.soft(dialog.getByRole('button', { name: 'Users', exact: true })).toBeDisabled()
        await expect.soft(fileInput).toBeDisabled()
        await page.keyboard.press('Escape')
        await expect.soft(dialog).toBeVisible()
        await page.mouse.click(2, 2)
        await expect.soft(dialog).toBeVisible()
        await page.evaluate(() => window.history.back())
        await expect.soft(page).toHaveURL(/\/platform\/tenants\/?$/)
        await expect.soft(dialog).toBeVisible()
    } finally {
        finishImport()
    }
    await expect(dialog.getByText('Imported successfully', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Imported Yard', { exact: true })).toBeVisible()
})

test('failed bulk import retains review until discarded, then permits a corrected upload', async ({ page }) => {
    const { state } = await mockManagement(page)
    let attempts = 0
    await page.route('**/api/tenants/bulk-import-users/', async route => {
        attempts++
        if (attempts === 1) return route.fulfill({ status: 500, json: { detail: 'Upload temporarily unavailable' } })
        state.tenants = [{ ...yard, user_count: 2 }]
        return route.fulfill({ json: { message: 'Users imported successfully', success_count: 1, error_count: 0, errors: [] } })
    })
    await page.goto('/platform/tenants')
    await page.getByRole('button', { name: 'Bulk Import', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Bulk Import', exact: true })
    await dialog.getByRole('button', { name: 'Users', exact: true }).click()
    await dialog.locator('input[type="file"]').setInputFiles(importFile)
    await expect(dialog.getByText('Upload temporarily unavailable', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Shipyards', exact: true }).click()
    const discard = page.getByRole('dialog', { name: 'Close the import result?', exact: true })
    await expect(discard).toBeVisible()
    await discard.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByText('Upload temporarily unavailable', { exact: true })).toBeVisible()
    await expect(dialog.locator('input[type="file"]')).toBeEnabled()
    await dialog.locator('input[type="file"]').setInputFiles(importFile)
    await expect(dialog.getByText('Users imported successfully', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('2 users', { exact: true })).toBeVisible()
    expect(attempts).toBe(2)
})

test('partial bulk import refreshes saved rows and preserves errors until explicit discard', async ({ page }) => {
    const { state } = await mockManagement(page)
    await page.route('**/api/tenants/bulk-import-tenants/', async route => {
        state.tenants = [...state.tenants, { ...yard, id: 3, slug: 'partial-yard', name: 'Saved From Partial Import' }]
        await route.fulfill({ json: { message: 'One saved, one needs correction', success_count: 1, error_count: 1, errors: [{ row: 5, errors: ['Email is invalid'] }] } })
    })
    await page.goto('/platform/tenants')
    await page.getByRole('button', { name: 'Bulk Import', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Bulk Import', exact: true })
    await dialog.locator('input[type="file"]').setInputFiles(importFile)
    await expect(dialog.getByText('One saved, one needs correction', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Shipyards', exact: true }).click()
    await expect(dialog.getByText('Email is invalid', { exact: false })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    const discard = page.getByRole('dialog', { name: 'Close the import result?', exact: true })
    await expect(discard).toBeVisible()
    await expect(discard).toContainText('Saved rows remain saved')
    await discard.getByRole('button', { name: 'Close result', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Saved From Partial Import', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Bulk Import', exact: true }).click()
    await expect(dialog.getByText('One saved, one needs correction', { exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).not.toBeVisible()
})

test('tenant creation sends every collected field and keeps rejected input available for retry', async ({ page }) => {
    const { state, writes } = await mockManagement(page)
    state.tenantSaveFails = true
    await page.goto('/platform/tenants')
    await page.getByRole('button', { name: 'New Shipyard', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'New Shipyard', exact: true })
    await dialog.getByLabel('Shipyard Name').fill('New Yard')
    await dialog.getByLabel('Description', { exact: true }).fill('Repairs')
    await dialog.getByLabel('Address', { exact: true }).fill('Dock 12')
    await dialog.getByLabel('Phone', { exact: true }).fill('+90 212 555 0101')
    await dialog.getByLabel('Email', { exact: true }).fill('office@example.test')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Contact cannot be saved')
    expect(writes[0]?.data).toEqual({ name: 'New Yard', description: 'Repairs', address: 'Dock 12', phone: '+90 212 555 0101', email: 'office@example.test' })
    await expect(dialog.getByLabel('Shipyard Name')).toHaveValue('New Yard')
    state.tenantSaveFails = false
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog).not.toBeVisible()
})

test('tenant manager sees truthful creation guidance without platform-only create form', async ({ page }) => {
    const { writes } = await mockManagement(page, false)
    await page.goto('/tenant/users')
    await expect(page.getByText('yard-manager', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create New User', exact: true })).toHaveCount(0)
    await expect(page.getByText('New user accounts are created by a platform administrator.', { exact: true })).toBeVisible()
    expect(writes).toHaveLength(0)
})

test('user removal explains all effects and keeps failed confirmation retryable', async ({ page }) => {
    const { state, writes } = await mockManagement(page)
    state.removalFails = true
    await page.goto('/platform/tenants/test-yard')
    await page.getByRole('button', { name: 'Remove user', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Remove user', exact: true })
    await expect(dialog).toContainText('yard-manager')
    await expect(dialog).toContainText('Shipyard Admin role will change to User')
    await expect(dialog).toContainText('equipment responsibilities will be cleared')
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Removal temporarily unavailable')
    await expect(page.getByText('yard-manager', { exact: true }).first()).toBeVisible()
    state.removalFails = false
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes.filter(write => write.path.endsWith('/remove-user/'))).toHaveLength(2)
})

test('blocked tenant deletion stays visible and retryable', async ({ page }) => {
    const { state } = await mockManagement(page)
    state.deleteFails = true
    await page.goto('/platform/tenants')
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete', exact: true })
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('History prevents deletion')
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled()
})

test('tenant manager is not offered edits that the backend blocks for privileged accounts', async ({ page }) => {
    const { state } = await mockManagement(page, false)
    state.users = [{ ...manager, role: 'platform_admin', username: 'legacy-privileged' }]
    await page.goto('/tenant/users')
    const row = page.getByRole('row').filter({ hasText: 'legacy-privileged' })
    await expect(row).toBeVisible()
    await expect(row.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await expect(row).toContainText('Managed by a platform administrator')
})

test('ordinary user edit cannot assign legacy platform role', async ({ page }) => {
    await mockManagement(page)
    await page.goto('/platform/users')
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit user', exact: true })
    await expect(dialog.getByRole('button', { name: /Platform Admin/ })).toHaveCount(0)
})

for (const scenario of [
    { url: '/platform/tenants', path: '/api/tenants/', restored: 'Test Yard' },
    { url: '/platform/tenants/test-yard', path: '/api/tenants/test-yard/', restored: 'Test Yard' },
    { url: '/platform/users', path: '/api/tenants/all-users/', restored: 'yard-manager' },
    { url: '/tenant/users', path: '/api/tenants/my-users/', restored: 'yard-manager', superuser: false },
]) {
    test(`load failures offer recovery instead of an empty list or permanent spinner: ${scenario.url}`, async ({ page }) => {
        const { state } = await mockManagement(page, scenario.superuser ?? true)
        state.failedPath = scenario.path
        await page.goto(scenario.url)
        const error = page.getByRole('alert').filter({ hasText: 'Load temporarily unavailable' })
        await expect(error).toBeVisible({ timeout: 15000 })
        state.failedPath = ''
        await error.getByRole('button', { name: 'Try again', exact: true }).click()
        await expect(page.getByText(scenario.restored, { exact: true }).first()).toBeVisible()
        await expect(error).not.toBeVisible()
    })
}

for (const scenario of [
    { url: '/platform/tenants', path: '/api/tenants/', open: 'New Shipyard', title: 'New Shipyard' },
    { url: '/platform/tenants/test-yard', path: '/api/tenants/test-yard/', open: 'Edit', title: 'Edit Shipyard' },
]) {
    test(`background reload failure preserves an open tenant draft: ${scenario.url}`, async ({ page }) => {
        const { state } = await mockManagement(page)
        await page.goto(scenario.url)
        await page.getByRole('button', { name: scenario.open, exact: true }).first().click()
        const dialog = page.getByRole('dialog', { name: scenario.title, exact: true })
        await dialog.getByLabel('Description', { exact: true }).fill('Unsaved repair details')
        state.failedPath = scenario.path
        await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
        const error = page.getByRole('alert').filter({ hasText: 'Load temporarily unavailable' })
        await expect(error).toBeAttached({ timeout: 15000 })
        await expect(dialog).toBeVisible()
        await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('Unsaved repair details')
    })
}
