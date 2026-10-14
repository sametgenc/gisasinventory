import { test, expect, type Page } from '@playwright/test'

const typeId = 'a0000000-0000-4000-8000-000000000001'
const equipmentType = {
    id: typeId, name: 'Forklift', catalog_code: 'G-001', category_code: 'G', sharing_class: 'B',
    sharing_excluded: false, exclusion_reason: '', description: 'Yard equipment',
    schema: [{ key: 'code', label: 'Equipment code', type: 'text', required: true, is_unique_key: true }],
}
const equipment = {
    id: 'e0000000-0000-4000-8000-000000000001', asset_type: typeId,
    asset_type_name: 'Forklift', tenant: 1, tenant_name: 'Test Yard',
    custom_data: { code: 'TEST-001' }, created_at: '2026-10-14T09:00:00Z',
}

async function session(page: Page, hasIdentifier = true) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('**/_allauth/browser/v1/**', async route => {
        await route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? {
            account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
        } : {
            user: { id: '1', username: 'test', email: 'test@example.test', role: 'tenant_admin', tenant_slug: 'test-yard', tenant_name: 'Test Yard' }, methods: [],
        } } })
    })
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        let data: unknown = []
        if (path === '/api/assets/types/') data = [{ ...equipmentType, schema: hasIdentifier ? equipmentType.schema : [] }]
        if (path === '/api/assets/items/') data = [equipment, { ...equipment, id: 'e0000000-0000-4000-8000-000000000002', custom_data: { code: 'TEST-002' } }]
        if (path === '/api/tenants/') data = [{ id: 1, name: 'Test Yard', slug: 'test-yard' }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
}

test('mobile account links remain reachable and close the menu after navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 })
    await session(page)
    const destinations = [
        { name: 'Email Settings', path: '/account/email' },
        { name: 'Change Password', path: '/account/password' },
        { name: 'Two-Factor Auth', path: '/account/authenticators' },
    ]
    for (const destination of destinations) {
        await page.goto('/assets')
        await page.getByRole('button', { name: 'Toggle navigation menu' }).click()
        const menu = page.locator('#mobile-navigation')
        const accountLink = menu.getByRole('link', { name: destination.name, exact: true })
        await accountLink.scrollIntoViewIfNeeded()
        await expect(accountLink).toBeVisible()
        await accountLink.click()
        if (destination.path === '/account/authenticators') {
            await expect(page).toHaveURL(/\/auth\/reauthenticate\?next=%2Faccount%2Fauthenticators(?:&mfa=false)?$/)
        } else {
            await expect(page).toHaveURL(new RegExp(`${destination.path}$`))
        }
        await expect(menu).not.toBeVisible()
    }
})

test('delete and sharing dialogs identify the exact equipment and owner', async ({ page }) => {
    await session(page)
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Open Forklift equipment' }).click()
    await page.getByRole('button', { name: 'Actions: TEST-001', exact: true }).click()
    await page.getByRole('button', { name: 'Delete: TEST-001', exact: true }).click()
    const deletion = page.getByRole('dialog', { name: 'Delete equipment' })
    await expect(deletion).toContainText('TEST-001 · Forklift · Test Yard')
    await expect(deletion).not.toContainText('TEST-002')
    await deletion.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Actions: TEST-001', exact: true }).click()
    await page.getByRole('button', { name: 'Manage sharing: TEST-001', exact: true }).click()
    const sharing = page.getByRole('dialog', { name: 'Shared list visibility' })
    await expect(sharing.getByRole('heading', { name: 'TEST-001', exact: true })).toBeVisible()
    await expect(sharing).toContainText('Forklift · Test Yard')
    await expect(sharing).not.toContainText('TEST-002')
})

test('confirmation falls back to the full record identifier when no code is defined', async ({ page }) => {
    await session(page, false)
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Open Forklift equipment' }).click()
    await page.getByRole('button', { name: `Actions: ${equipment.id}`, exact: true }).click()
    await page.getByRole('button', { name: `Delete: ${equipment.id}`, exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Delete equipment' })).toContainText(`${equipment.id} · Forklift · Test Yard`)
})

test('Excel file layout is optional, labelled and preserves edits in the import request', async ({ page }) => {
    await session(page)
    let previewBody = ''
    let importBody = ''
    await page.route('**/api/assets/items/preview_import/', async route => {
        previewBody = route.request().postData() ?? ''
        await route.fulfill({ json: { headers: ['Equipment code'], preview_rows: [['NEW-001']], total_rows: 1 } })
    })
    await page.route('**/api/assets/items/raw_import/', async route => {
        importBody = route.request().postData() ?? ''
        await route.fulfill({ json: { created_count: 1, updated_count: 0, skipped_count: 0, error_count: 0, errors: [], message: 'Imported' } })
    })
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Import from Excel', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Bulk Asset Import' })
    const header = dialog.getByRole('spinbutton', { name: 'Header row', exact: true })
    await expect(header).not.toBeVisible()
    await expect(dialog.locator('summary')).toContainText('Header row 1 · Ignore rules: 3')
    await dialog.locator('summary').click()
    await header.fill('2')
    await dialog.getByRole('textbox', { name: 'Skip rows', exact: true }).fill('FOOTER')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await dialog.getByRole('button', { name: 'Remove ignore rule: TOTAL', exact: true }).click()
    await expect(dialog.locator('summary')).toContainText('Header row 2 · Ignore rules: 3')
    await dialog.getByLabel('Equipment Excel file').setInputFiles({ name: 'equipment.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('mock workbook') })
    await dialog.getByRole('button', { name: 'Preview & continue', exact: true }).click()
    expect(previewBody).toMatch(/name="header_row"\r\n\r\n2/)
    const mapping = dialog.getByRole('combobox', { name: 'Map column Equipment code', exact: true })
    await expect(mapping).toHaveValue('code')
    await expect(mapping.getByRole('option', { name: 'Equipment code', exact: true })).toHaveCount(1)
    await mapping.selectOption('')
    await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled()
    await mapping.selectOption('code')
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog.getByText('Imported', { exact: true })).toBeVisible()
    expect(importBody).toMatch(/name="header_row"\r\n\r\n2/)
    expect(importBody).toContain('FOOTER')
    expect(importBody).toContain('GENEL TOPLAM')
    expect(importBody).not.toContain('"TOTAL"')
    expect(importBody).toContain('"Equipment code":"code"')
})
