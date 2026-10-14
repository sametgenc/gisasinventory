import { expect, test, type Page } from '@playwright/test'
import { getEquipmentModelKey, getInventoryModelGroups } from '../src/modules/assets/inventory-groups'
import type { Asset, AssetType } from '../src/modules/assets/types'

const forklift: AssetType = {
    id: 'forklift-type', name: 'Forklift', description: 'Lifting equipment',
    category_code: 'G', catalog_code: 'G-001', sharing_class: 'B', sharing_excluded: false,
    created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z', created_by: 1,
    schema: [
        { key: 'code', label: 'Equipment code', type: 'text', is_unique_key: true },
        { key: 'brand', label: 'Brand', type: 'text' },
        { key: 'model', label: 'Model', type: 'text' },
        { key: 'capacity', label: 'Capacity', type: 'number' },
        { key: 'quantity', label: 'Quantity', type: 'number' },
    ],
}
const generator: AssetType = { ...forklift, id: 'generator-type', name: 'Generator', category_code: 'E' }

function item(index: number, overrides: Partial<Asset> = {}): Asset {
    return {
        id: `equipment-${index}`, asset_type: forklift.id, asset_type_name: forklift.name,
        tenant: 1, tenant_name: 'Test Yard', created_at: '2026-10-14T09:00:00Z',
        updated_at: '2026-10-14T09:00:00Z', created_by: 1, assigned_to: null, assigned_to_username: null,
        custom_data: { code: `FL-${String(index).padStart(3, '0')}`, brand: 'Toyota', model: '8FD', capacity: 3, quantity: 50 },
        is_shared: false, is_listed_for_sharing: false, ...overrides,
    }
}

const fiftyForklifts = Array.from({ length: 50 }, (_, index) => item(index + 1))
const inventory = [
    ...fiftyForklifts,
    item(51, { custom_data: { code: 'HY-001', brand: 'Hyster', model: '8FD' } }),
    item(52, { asset_type: generator.id, asset_type_name: generator.name, custom_data: { code: 'GE-001', brand: 'Toyota', model: '8FD' } }),
    item(53, { custom_data: { code: 'UNKNOWN-001', brand: 'Toyota' } }),
]
const modelButtonName = 'Open Forklift · Toyota 8FD equipment'

async function mockInventory(page: Page, assets: Asset[] = inventory, role = 'tenant_admin') {
    const writes: string[] = []
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('vite-ui-theme', 'light')
    })
    await page.route('**/_allauth/browser/v1/**', async route => {
        await route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? {
            account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
        } : {
            user: { id: '1', username: 'test', email: 'test@example.test', role, tenant_slug: 'test-yard', tenant_name: 'Test Yard' }, methods: [],
        } } })
    })
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (request.method() !== 'GET') writes.push(`${request.method()} ${path}`)
        if (path.endsWith('/stream/')) return route.abort()
        let data: unknown = []
        if (path === '/api/assets/types/') data = [forklift, generator]
        if (path === '/api/assets/items/') data = assets
        if (path === '/api/tenants/') data = [{ id: 1, name: 'Test Yard', slug: 'test-yard' }, { id: 2, name: 'Other Yard', slug: 'other-yard' }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
    return writes
}

test('model identity uses declared scalar fields and preserves brand and equipment type boundaries', () => {
    const base = item(1)
    const normalized = item(2, { custom_data: { brand: '  TOYOTA  ', model: ' 8ＦＤ ' } })
    expect(getEquipmentModelKey(normalized, forklift)).toBe(getEquipmentModelKey(base, forklift))
    expect(getEquipmentModelKey(item(3, { custom_data: { brand: 'Hyster', model: '8FD' } }), forklift)).not.toBe(getEquipmentModelKey(base, forklift))
    expect(getEquipmentModelKey(item(4, { asset_type: generator.id }), generator)).not.toBe(getEquipmentModelKey(base, forklift))
    expect(getEquipmentModelKey(item(5, { custom_data: { brand: 'A|B', model: 'C' } }), forklift))
        .not.toBe(getEquipmentModelKey(item(6, { custom_data: { brand: 'A', model: 'B|C' } }), forklift))
    const declaredLabels: AssetType = { ...forklift, schema: [{ key: 'maker', label: 'Üretici', type: 'text' }, { key: 'equipment_model', label: 'Model', type: 'number' }] }
    const numeric = getInventoryModelGroups([item(7, { custom_data: { maker: 'Toyota', equipment_model: 0 } })], [declaredLabels])[0]
    expect(numeric).toMatchObject({ brand: 'Toyota', model: '0', count: 1 })
})

test('Turkish producer labels and dotted or dotless I brands keep stable distinct model groups', () => {
    const producerType: AssetType = { ...forklift, schema: [
        { key: 'maker', label: 'ÜRETİCİ', type: 'text' },
        { key: 'machine_model', label: 'MODEL', type: 'text' },
    ] }
    const records = ['İŞBİR', 'işbir', 'HILTI', 'hilti', 'Bosch'].map((maker, index) => item(index + 1, {
        custom_data: { maker, machine_model: '8FD' },
    }))
    expect(getEquipmentModelKey(records[0], producerType)).toBe(getEquipmentModelKey(records[1], producerType))
    expect(getEquipmentModelKey(records[2], producerType)).toBe(getEquipmentModelKey(records[3], producerType))
    expect(getEquipmentModelKey(records[0], producerType)).not.toBe(getEquipmentModelKey(records[2], producerType))
    const groups = getInventoryModelGroups(records, [producerType])
    expect(groups).toHaveLength(3)
    expect(groups.find(group => group.brand === 'İŞBİR')).toMatchObject({ model: '8FD', count: 2 })
    expect(groups.find(group => group.brand === 'HILTI')).toMatchObject({ model: '8FD', count: 2 })
    expect(groups.find(group => group.brand === 'Bosch')).toMatchObject({ model: '8FD', count: 1 })
})

test('unknown and invalid models remain separate from known models without guessing undeclared data', () => {
    const noSchema: AssetType = { ...forklift, schema: [] }
    const undeclared = getInventoryModelGroups([item(1), item(2, { custom_data: { brand: 'Hyster', model: 'Other' } })], [noSchema])
    expect(undeclared).toHaveLength(1)
    expect(undeclared[0]).toMatchObject({ brand: '', model: '', count: 2 })
    const variants = [null, undefined, false, { name: '8FD' }, ['8FD'], Number.NaN, Number.POSITIVE_INFINITY]
    const groups = getInventoryModelGroups([item(1), ...variants.map((model, index) => item(index + 2, { custom_data: { brand: 'Toyota', model } }))], [forklift])
    expect(groups).toHaveLength(2)
    expect(groups.find(group => group.model === '')).toMatchObject({ brand: 'Toyota', count: variants.length })
    expect(groups.find(group => group.model === '8FD')).toMatchObject({ count: 1 })
    expect(getInventoryModelGroups([item(1)], [])[0]).toMatchObject({ typeName: 'Forklift', brand: '', model: '' })
})

test('model quantities count physical records and published owners rather than any quantity field', () => {
    const records = fiftyForklifts.map((asset, index) => ({ ...asset, tenant: index < 25 ? 1 : 2, is_listed_for_sharing: index < 3 }))
    const groups = getInventoryModelGroups(records, [forklift])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ name: 'Forklift · Toyota 8FD', count: 50, shared: 3, ownerCount: 2 })
    expect(getInventoryModelGroups(records.filter(asset => asset.tenant === 2), [forklift])[0]).toMatchObject({ count: 25, shared: 0, ownerCount: 1 })
})

for (const width of [1280, 390, 320]) {
    test(`model summary keeps 50 records together then opens a compact paged list at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        const writes = await mockInventory(page)
        await page.goto('/assets')
        const group = page.getByRole('button', { name: modelButtonName, exact: true })
        await expect(group).toContainText('50 items')
        await expect(page.getByRole('button', { name: /^Open .* equipment$/ })).toHaveCount(4)
        await expect(page.getByRole('button', { name: 'Open Forklift · Hyster 8FD equipment', exact: true })).toContainText(/1 items?/)
        await expect(page.getByRole('button', { name: 'Open Generator · Toyota 8FD equipment', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Open Forklift · Toyota equipment', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'FL-001', exact: true })).not.toBeVisible()
        await expect(page.getByRole('article')).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()

        await group.click()
        await expect(page.getByRole('article')).toHaveCount(24)
        await expect(page.getByRole('button', { name: 'FL-001', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'FL-025', exact: true })).not.toBeVisible()
        await expect(page.getByRole('button', { name: 'HY-001', exact: true })).not.toBeVisible()
        await expect(page.getByText('1–24 of 50', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Next', exact: true }).click()
        await expect(page.getByRole('article')).toHaveCount(24)
        await expect(page.getByRole('button', { name: 'FL-025', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'FL-001', exact: true })).not.toBeVisible()
        await page.getByRole('button', { name: 'Last', exact: true }).click()
        await expect(page.getByRole('article')).toHaveCount(2)
        await expect(page.getByText('49–50 of 50', { exact: true })).toBeVisible()
        const detailButton = page.getByRole('button', { name: 'FL-049', exact: true })
        await detailButton.click()
        await expect(page.getByRole('dialog')).toContainText('FL-049')
        await expect(page.getByRole('dialog')).toContainText('Toyota')
        await expect(page.getByRole('dialog')).toContainText('8FD')
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).not.toBeVisible()
        await expect(detailButton).toBeFocused()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
        await page.getByRole('button', { name: 'Back to summary', exact: true }).click()
        await expect(group).toContainText('50 items')
        expect(writes).toEqual([])
    })
}

test('search and owner filter count only the matching physical records and list only their members', async ({ page }) => {
    const records = inventory.map((asset, index) => index < 50 && index >= 25 ? { ...asset, tenant: 2, tenant_name: 'Other Yard' } : asset)
    const writes = await mockInventory(page, records, 'platform_admin')
    await page.goto('/assets')
    const search = page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' })
    const group = page.getByRole('button', { name: modelButtonName, exact: true })
    await search.fill('FL-00')
    await expect(group).toContainText('9 matching items')
    await expect(group).not.toContainText('50 items')
    await group.click()
    await expect(page.getByRole('article')).toHaveCount(9)
    await expect(page.getByRole('button', { name: 'FL-010', exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'Back to summary', exact: true }).click()
    await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click()
    await page.getByRole('combobox', { name: 'Shipyard', exact: true }).selectOption('2')
    await expect(group).toContainText('25 matching items')
    await expect(page.getByRole('button', { name: /^Open .* equipment$/ })).toHaveCount(1)
    await group.click()
    await expect(page.getByRole('article')).toHaveCount(24)
    await expect(page.getByRole('button', { name: 'FL-026', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'FL-001', exact: true })).not.toBeVisible()
    await expect(page.getByRole('article').first()).toContainText('Other Yard')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'FL-050', exact: true })).toBeVisible()
    expect(writes).toEqual([])
})

test('search accepts brand and model together, then narrows to an individual equipment code', async ({ page }) => {
    const records = [
        ...fiftyForklifts,
        item(51, { custom_data: { code: 'BO-001', brand: 'Bosch', model: '8FD' } }),
        item(52, { custom_data: { code: 'TO-001', brand: 'Toyota', model: '8FG' } }),
    ]
    const writes = await mockInventory(page, records)
    await page.goto('/assets')
    const search = page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' })
    const group = page.getByRole('button', { name: modelButtonName, exact: true })
    await search.fill('Toyota 8FD')
    await expect(group).toContainText('50 matching items')
    await expect(page.getByRole('button', { name: /^Open .* equipment$/ })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Open Forklift · Bosch 8FD equipment', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Forklift · Toyota 8FG equipment', exact: true })).not.toBeVisible()
    await search.fill('8fd toyota')
    await expect(group).toContainText('50 matching items')
    await search.fill('FL-003')
    await expect(group).toContainText(/1 matching items?/)
    await group.click()
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'FL-003', exact: true })).toBeVisible()
    expect(writes).toEqual([])
})

test('editing a filtered record to another model keeps the saved record visible in its new group', async ({ page }) => {
    const records = [item(1), item(2)]
    await mockInventory(page, records)
    let patchCount = 0
    await page.route('**/api/assets/items/equipment-1/', async route => {
        if (route.request().method() !== 'PATCH') return route.fallback()
        patchCount += 1
        const payload = route.request().postDataJSON() as { custom_data: Record<string, unknown> }
        records[0] = { ...records[0], custom_data: payload.custom_data }
        await route.fulfill({ json: records[0] })
    })
    await page.goto('/assets')
    const search = page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' })
    await search.fill('FL-001')
    await page.getByRole('button', { name: modelButtonName, exact: true }).click()
    await page.getByRole('button', { name: 'Actions: FL-001', exact: true }).click()
    await page.getByRole('button', { name: 'Edit: FL-001', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit equipment', exact: true })
    await dialog.getByRole('textbox', { name: 'Equipment code', exact: true }).fill('NEW-001')
    await dialog.getByRole('textbox', { name: 'Brand', exact: true }).fill('Caterpillar')
    await dialog.getByRole('textbox', { name: 'Model', exact: true }).fill('DP25')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(search).toHaveValue('')
    await expect(page.getByRole('heading', { name: 'Forklift · Caterpillar DP25', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'NEW-001', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'FL-002', exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'Back to summary', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Open Forklift · Caterpillar DP25 equipment', exact: true })).toContainText(/1 items?/)
    await expect(page.getByRole('button', { name: modelButtonName, exact: true })).toContainText(/1 items?/)
    expect(records[0].id).toBe('equipment-1')
    expect(records).toHaveLength(2)
    expect(patchCount).toBe(1)
})

for (const role of ['tenant_admin', 'tenant_user']) {
    test(`record actions stay collapsed, support keyboard dismissal and honor ${role} sharing access`, async ({ page }) => {
        const writes = await mockInventory(page, fiftyForklifts, role)
        await page.goto('/assets')
        await page.getByRole('button', { name: modelButtonName, exact: true }).click()
        const trigger = page.getByRole('button', { name: 'Actions: FL-001', exact: true })
        const panel = page.getByRole('group', { name: 'Actions: FL-001', exact: true })
        await expect(page.getByRole('button', { name: 'Edit: FL-001', exact: true })).not.toBeVisible()
        await trigger.click()
        await expect(trigger).toHaveAttribute('aria-expanded', 'true')
        await expect(panel.getByRole('button', { name: 'Edit: FL-001', exact: true })).toBeVisible()
        await expect(panel.getByRole('button', { name: 'Delete: FL-001', exact: true })).toBeVisible()
        if (role === 'tenant_admin') await expect(panel.getByRole('button', { name: 'Manage sharing: FL-001', exact: true })).toBeVisible()
        else await expect(panel.getByRole('button', { name: 'Manage sharing: FL-001', exact: true })).toHaveCount(0)
        await panel.getByRole('button', { name: 'Edit: FL-001', exact: true }).focus()
        await page.keyboard.press('Escape')
        await expect(panel).not.toBeVisible()
        await expect(trigger).toBeFocused()
        await expect(trigger).toHaveAttribute('aria-expanded', 'false')
        await trigger.click()
        const outside = page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' })
        await outside.click()
        await expect(panel).not.toBeVisible()
        await expect(outside).toBeFocused()
        expect(writes).toEqual([])
    })
}
