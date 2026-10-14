import { expect, test, type Page } from '@playwright/test'
import { getEquipmentModelKey, getInventoryModelGroups, getInventoryTotals, getStockRecord } from '../src/modules/assets/inventory-groups'
import type { Asset, AssetType } from '../src/modules/assets/types'

const stockType: AssetType = {
    id: 'stock-type', name: 'İskele malzemeleri', description: '', tracking_mode: 'stock',
    category_code: 'A', sharing_class: 'B', sharing_excluded: false,
    created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z', created_by: 1,
    schema: [
        { key: 'material_code', label: 'Malzeme kodu', type: 'text', required: true, is_unique_key: true },
        { key: 'material_name', label: 'Malzeme adı', type: 'text', required: true },
        { key: 'quantity', label: 'Stok adedi', type: 'number', required: true },
    ],
}
const individual: AssetType = { ...stockType, id: 'individual-type', name: 'Forklift', tracking_mode: 'individual', schema: [
    { key: 'brand', label: 'Brand', type: 'text' }, { key: 'model', label: 'Model', type: 'text' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
] }
function stock(index: number, code: string, name: string, quantity: unknown, tenant = 1): Asset {
    return { id: `stock-${index}`, tenant, tenant_name: tenant === 1 ? 'Example Yard' : 'Other Yard',
        asset_type: stockType.id, asset_type_name: stockType.name, custom_data: { material_code: code, material_name: name, quantity },
        created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z',
        created_by: 1, assigned_to: null, assigned_to_username: null, is_shared: false, is_listed_for_sharing: false }
}
// Invented material codes, names, and quantities keep public fixtures independent of source exports.
const sample = [stock(1, 'ORNEK-STOK-01', 'Örnek yürüme platformu', 500), stock(2, 'ORNEK-STOK-02', 'Örnek güvenlik bariyeri', 250), stock(3, 'ORNEK-STOK-03', 'Örnek sıfır stoklu malzeme', 0)]

async function mock(page: Page, assets = sample, role = 'tenant_admin') {
    const writes: string[] = []
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('vite-ui-theme', 'light')
    })
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? {
        account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
    } : { user: { id: '1', username: 'test', email: 'test@example.test', role, tenant_slug: 'example-yard', tenant_name: 'Example Yard' }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (request.method() !== 'GET') writes.push(`${request.method()} ${path}`)
        if (path.endsWith('/stream/')) return route.abort()
        let data: unknown = []
        if (path === '/api/assets/types/') data = [stockType, individual]
        if (path === '/api/assets/items/') data = assets
        if (path === '/api/tenants/') data = [{ id: 1, name: 'Example Yard' }, { id: 2, name: 'Other Yard' }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
    return writes
}

test('stock counts pieces while keeping material and individual record boundaries', () => {
    const equipment: Asset = { ...sample[0], id: 'forklift-1', asset_type: individual.id, asset_type_name: individual.name,
        custom_data: { brand: 'Toyota', model: '8FD', quantity: 10000 } }
    const groups = getInventoryModelGroups([...sample, stock(4, 'ORNEK-STOK-01', 'Örnek yürüme platformu', 10, 2), equipment], [stockType, individual])
    expect(groups).toHaveLength(5)
    expect(groups.find(group => group.materialCode === 'ORNEK-STOK-01')).toMatchObject({ count: 500, recordCount: 1, ownerCount: 1, trackingMode: 'stock' })
    expect(groups.find(group => group.materialCode === 'ORNEK-STOK-02')).toMatchObject({ count: 250, recordCount: 1 })
    expect(groups.find(group => group.materialCode === 'ORNEK-STOK-03')).toMatchObject({ count: 0, recordCount: 1 })
    expect(groups.find(group => group.trackingMode === 'individual')).toMatchObject({ count: 1 })
    expect(getInventoryTotals([...sample, equipment], [stockType, individual])).toMatchObject({ equipmentCount: 1, stockLineCount: 3, stockQuantity: 750, hasInvalidStock: false })
    expect(getEquipmentModelKey(sample[0], stockType)).not.toBe(getEquipmentModelKey(sample[1], stockType))
})

test('stock never fabricates quantities from blank or malformed values', () => {
    for (const quantity of [null, '', true, -1, 1.5, Number.POSITIVE_INFINITY, 9007199254740992]) {
        const invalid = stock(1, 'ORNEK-STOK-01', 'Örnek yürüme platformu', quantity)
        expect(getStockRecord(invalid, stockType)?.quantity).toBeNull()
        expect(getInventoryTotals([invalid], [stockType]).hasInvalidStock).toBe(true)
    }
    expect(getStockRecord(stock(1, 'ORNEK-STOK-01', 'Örnek yürüme platformu', '0'), stockType)?.quantity).toBe(0)
})

for (const width of [1440, 390, 320]) {
    test(`stock shows material name, code and quantity without expanding pieces at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        const writes = await mock(page)
        await page.goto('/assets')
        const platform = page.getByRole('button').filter({ hasText: 'Örnek yürüme platformu' })
        await expect(platform).toHaveCount(1)
        await expect(platform).toContainText('ORNEK-STOK-01')
        await expect(platform).toContainText('500')
        await expect(page.getByText(/Model not entered/)).not.toBeVisible()
        await expect(page.getByRole('button').filter({ hasText: 'Örnek güvenlik bariyeri' })).toContainText('250')
        await expect(page.getByRole('button').filter({ hasText: 'Örnek sıfır stoklu malzeme' })).toContainText('0 pieces')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await platform.click()
        await expect(page.getByRole('dialog')).toContainText('500')
        await expect(page.getByRole('dialog')).toContainText('ORNEK-STOK-01')
        await expect(page.getByRole('article')).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).not.toBeVisible()
        await expect(platform).toBeFocused()
        expect(writes).toEqual([])
    })
}

test('central stock keeps local material codes separate across yards and preserves owner filters', async ({ page }) => {
    const writes = await mock(page, [...sample, stock(4, 'ORNEK-STOK-01', 'Different example platform', 10, 2)], 'platform_admin')
    await page.goto('/assets')
    const platform = page.getByRole('button').filter({ hasText: 'Örnek yürüme platformu' })
    const otherPlatform = page.getByRole('button').filter({ hasText: 'Different example platform' })
    await expect(platform).toContainText('500')
    await expect(platform).toContainText('Example Yard')
    await expect(otherPlatform).toContainText('10')
    await expect(otherPlatform).toContainText('Other Yard')
    await expect(page.getByRole('button').filter({ hasText: 'ORNEK-STOK-01' })).toHaveCount(2)
    await page.getByRole('combobox', { name: 'Shipyard', exact: true }).selectOption('2')
    await expect(platform).not.toBeVisible()
    await expect(otherPlatform).toContainText('10')
    await otherPlatform.click()
    await expect(page.getByRole('dialog')).toContainText('Other Yard')
    expect(writes).toEqual([])
})

test('editing an existing equipment type cannot change tracking mode or its import identity', async ({ page }) => {
    await mock(page, [], 'platform_admin')
    const original: AssetType = { ...individual, schema: [
        { key: 'equipment_code', label: 'Equipment code', type: 'text', is_unique_key: true, required: true },
        ...individual.schema,
    ] }
    let saved: { tracking_mode?: string; schema?: AssetType['schema'] } | undefined
    await page.route('**/api/assets/types/**', async route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: [original] })
        saved = route.request().postDataJSON()
        await route.fulfill({ json: { ...original, ...saved } })
    })
    await page.goto('/assets/types')
    await page.getByRole('button', { name: 'Edit: Forklift', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('radio', { name: /^Individual equipment/ })).toBeDisabled()
    await expect(dialog.getByRole('radio', { name: /^Material stock by quantity/ })).toBeDisabled()
    await dialog.getByRole('textbox', { name: 'Equipment type name', exact: true }).fill('Forklift updated')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(saved?.tracking_mode).toBe('individual')
    expect(saved?.schema).toEqual(original.schema)
})

test('new stock type submits required material fields and quantity tracking', async ({ page }) => {
    await mock(page, [], 'platform_admin')
    let saved: { tracking_mode?: string; schema?: AssetType['schema'] } | undefined
    await page.route('**/api/assets/types/**', async route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: [individual] })
        saved = route.request().postDataJSON()
        await route.fulfill({ json: { ...stockType, ...saved } })
    })
    await page.goto('/assets/types')
    await page.getByRole('button', { name: 'Add type', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Equipment type name', exact: true }).fill('Scaffold stock')
    await dialog.getByRole('radio', { name: /^Material stock by quantity/ }).check()
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(saved?.tracking_mode).toBe('stock')
    expect(saved?.schema?.map(field => ({ key: field.key, type: field.type, required: field.required, unique: !!field.is_unique_key }))).toEqual([
        { key: 'material_code', type: 'text', required: true, unique: true },
        { key: 'material_name', type: 'text', required: true, unique: false },
        { key: 'quantity', type: 'number', required: true, unique: false },
    ])
})

test('export column aliases map stock quantities while source ID and yard remain ignored', async ({ page }) => {
    await mock(page)
    let importBody = ''
    await page.route('**/api/assets/items/preview_import/', route => route.fulfill({ json: {
        headers: ['ID', 'Tersane', 'Oluşturulma Tarihi', 'Seri Numarası', 'Adet', 'İsim'],
        preview_rows: [['example-source-01', 'Örnek tersane', '2025-01-01 10:00', 'ORNEK-STOK-01', '500', 'Örnek yürüme platformu']], total_rows: 1,
    } }))
    await page.route('**/api/assets/items/raw_import/', async route => {
        importBody = route.request().postData() ?? ''
        await route.fulfill({ json: { created_count: 1, updated_count: 0, skipped_count: 0, error_count: 0, errors: [], message: 'Imported stock' } })
    })
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Import from Excel', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Bulk Asset Import' })
    await dialog.getByLabel('Equipment Excel file').setInputFiles({ name: 'stock-export.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('mock preview source') })
    await dialog.getByRole('button', { name: 'Preview & continue', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Equipment type', exact: true }).selectOption(stockType.id)
    for (const [column, field] of [['Seri Numarası', 'material_code'], ['İsim', 'material_name'], ['Adet', 'quantity'], ['ID', ''], ['Tersane', ''], ['Oluşturulma Tarihi', '']]) {
        await expect(dialog.getByRole('combobox', { name: `Map column ${column}`, exact: true })).toHaveValue(field)
    }
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog.getByText('Imported stock', { exact: true })).toBeVisible()
    expect(importBody).toContain('"Seri Numarası":"material_code"')
    expect(importBody).toContain('"Adet":"quantity"')
    expect(importBody).toContain('"Tersane":null')
    expect(importBody).toMatch(/name="header_row"\r\n\r\n1/)
    expect(importBody).not.toContain('name="tenant"')
})
