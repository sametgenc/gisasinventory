import { expect, test, type Page } from '@playwright/test'
import type { Asset, AssetType } from '../src/modules/assets/types'

const crane: AssetType = {
    id: 'crane', name: 'Example crane', description: '', catalog_code: 'B-901', category_code: 'B', tracking_mode: 'individual',
    created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z', created_by: 1,
    schema: [
        { key: 'serial', label: 'Serial number', type: 'text', is_unique_key: true, required: true },
        { key: 'capacity', label: 'Capacity (tonnes)', type: 'number' },
        { key: 'last_control', label: 'Last inspection', type: 'date' },
    ],
}
const stock: AssetType = { ...crane, id: 'stock', name: 'Example barriers', catalog_code: 'A-901', tracking_mode: 'stock', schema: [
    { key: 'quantity', label: 'Stock quantity', type: 'number', role: 'quantity' },
] }
const equipment: Asset = {
    id: 'crane-1', asset_type: crane.id, asset_type_name: crane.name, inventory_code: 'YARD-001', tenant: 1, tenant_name: 'Example Yard',
    custom_data: { serial: 'SERIAL-001', capacity: 12.5, last_control: '2026-10-01', secret_note: 'Undeclared internal text' },
    is_shared: false, is_listed_for_sharing: false, created_at: crane.created_at, updated_at: crane.updated_at,
    created_by: 1, assigned_to: null, assigned_to_username: null,
}

async function inventory(page: Page, role = 'tenant_admin', language = 'en', empty = false) {
    const writes: { path: string; data: unknown }[] = []
    await page.addInitScript(language => { localStorage.setItem('language', language); localStorage.setItem('vite-ui-theme', 'light') }, language)
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? {
        account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
    } : { user: { id: '1', username: 'test', email: 'test@example.test', role, is_superuser: role === 'platform_admin',
        tenant_id: role === 'platform_admin' ? null : 1, tenant_slug: role === 'platform_admin' ? null : 'example-yard', tenant_name: 'Example Yard' }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (request.method() !== 'GET') writes.push({ path, data: request.postDataJSON() })
        let data: unknown = []
        if (path === '/api/assets/types/') data = [crane, stock]
        if (path === '/api/assets/items/') data = empty ? [] : [equipment]
        if (path === '/api/tenants/') data = [{ id: 1, name: 'Example Yard', slug: 'example-yard' }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        if (path.endsWith('/batch_create/')) data = { created_count: 4, record_count: 4, unit_count: 123 }
        await route.fulfill({ json: data })
    })
    await page.goto('/assets')
    return writes
}

for (const language of ['en', 'tr']) {
    test(`one equipment add path starts at one unit and distinguishes codes (${language})`, async ({ page }) => {
        await inventory(page, 'tenant_user', language)
        const add = language === 'tr' ? 'Ekipman ekle' : 'Add equipment'
        await expect(page.getByRole('button', { name: add, exact: true })).toHaveCount(1)
        await expect(page.getByRole('button', { name: /Add one record|Tek kayıt ekle|by quantity|Adetle/ })).toHaveCount(0)
        await page.getByRole('button', { name: add, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: add, exact: true })
        await expect(dialog.getByRole('spinbutton', { name: language === 'tr' ? 'Adet' : 'Quantity', exact: true })).toHaveValue('1')
        await expect(dialog).toContainText(language === 'tr' ? 'Seri numarası' : 'serial number')
        await expect(dialog).not.toContainText(language === 'tr' ? 'ayrıca yayınlayabilirsiniz' : 'Publish separately')
        await dialog.getByRole('option').filter({ hasText: crane.name }).click()
        await expect(dialog).toContainText('B-901')
        await expect(dialog.getByRole('textbox', { name: 'Serial number', exact: true })).toBeVisible()
    })
}

test('mixed equipment and stock summary explains records and quantities before and after atomic save', async ({ page }) => {
    const writes = await inventory(page)
    await page.getByRole('button', { name: 'Add equipment', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Add equipment', exact: true })
    await dialog.getByRole('option').filter({ hasText: crane.name }).click()
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('3')
    await dialog.getByRole('textbox', { name: 'Serial number', exact: true }).fill('SERIAL-2\nSERIAL-3\nSERIAL-4')
    await dialog.getByRole('button', { name: 'Add another equipment type' }).click()
    const second = dialog.getByRole('region', { name: 'Line 2', exact: true })
    await second.getByRole('option').filter({ hasText: stock.name }).click()
    await second.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('120')
    await expect(dialog.locator('[aria-live="polite"]')).toContainText('3 individual equipment')
    await expect(dialog.locator('[aria-live="polite"]')).toContainText('1 stock record (120 pieces)')
    await expect(dialog.locator('[aria-live="polite"]')).not.toContainText('123 units')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Inventory added' })).toContainText('3 individual equipment · 1 stock record (120 pieces)')
    expect(writes).toHaveLength(1)
    expect(writes[0].path).toBe('/api/assets/items/batch_create/')
    expect((writes[0].data as { rows: unknown[] }).rows).toHaveLength(4)
})

for (const role of ['tenant_user', 'tenant_admin', 'platform_admin']) {
    test(`equipment details expose edit and only authorized sharing for ${role}`, async ({ page }) => {
        const writes = await inventory(page, role)
        await page.getByRole('button', { name: 'All records', exact: true }).click()
        const record = page.getByRole('article')
        await expect(record).toContainText('Serial number: SERIAL-001')
        await expect(record).toContainText('Capacity (tonnes): 12.5')
        await expect(record).toContainText('Last inspection:')
        await expect(record).not.toContainText('Undeclared internal text')
        await record.getByRole('button', { name: 'YARD-001', exact: true }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
        await expect(dialog.getByRole('button', { name: 'Manage sharing', exact: true })).toHaveCount(role === 'tenant_user' ? 0 : 1)
        await dialog.getByRole('button', { name: 'Edit', exact: true }).click()
        await expect(page.getByRole('dialog', { name: 'Edit equipment', exact: true })).toBeVisible()
        expect(writes).toHaveLength(0)
    })
}

test('empty mobile inventory keeps guidance collapsed and search immediately reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await inventory(page, 'tenant_user', 'en', true)
    const search = page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' })
    await expect(search).toBeVisible()
    const bounds = await search.boundingBox()
    expect(bounds?.y).toBeLessThan(600)
    await expect(page.locator('details').first()).not.toHaveAttribute('open', '')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
