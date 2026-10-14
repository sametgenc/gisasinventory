import { expect, test, type Page } from '@playwright/test'
import type { Asset, AssetType } from '../src/modules/assets/types'

const forklift: AssetType = {
    id: 'pagination-forklift', name: 'Forklift', description: '', tracking_mode: 'individual',
    category_code: 'G', sharing_class: 'B', sharing_excluded: false,
    created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z', created_by: 1,
    schema: [
        { key: 'code', label: 'Equipment code', type: 'text', is_unique_key: true },
        { key: 'brand', label: 'Brand', type: 'text' },
        { key: 'model', label: 'Model', type: 'text' },
    ],
}

function equipment(index: number, model: string, brand = 'Example Alpha', tenant = 1): Asset {
    return {
        id: `pagination-equipment-${index}`, asset_type: forklift.id, asset_type_name: forklift.name,
        tenant, tenant_name: tenant === 1 ? 'Example Yard' : 'Other Example Yard',
        created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z',
        created_by: 1, assigned_to: null, assigned_to_username: null,
        custom_data: { code: `EX-${String(index).padStart(3, '0')}`, brand, model },
        is_shared: false, is_listed_for_sharing: false,
    }
}

const fiftyRecords = Array.from({ length: 50 }, (_, index) => equipment(index + 1, 'M01'))
const manyModels = [
    ...fiftyRecords,
    ...Array.from({ length: 29 }, (_, index) => equipment(index + 51, `M${String(index + 2).padStart(2, '0')}`)),
    ...Array.from({ length: 30 }, (_, index) => equipment(index + 80, `M${String(index + 1).padStart(2, '0')}`, 'Example Beta', 2)),
]
const firstModel = 'Open Forklift · Example Alpha M01 equipment'
const modelButtons = (page: Page) => page.getByRole('button', { name: /^Open .* equipment$/ })
const pageSizeSelector = (page: Page) => page.getByRole('combobox', { name: 'Per page', exact: true })

async function mockInventory(page: Page, initialAssets: Asset[], assetTypes = [forklift]) {
    let assets = [...initialAssets]
    const deleted: string[] = []
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('vite-ui-theme', 'light')
    })
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: {
        status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? {
            account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
        } : {
            user: { id: '1', username: 'pagination-test', email: 'pagination@example.test', role: 'platform_admin', is_superuser: true, tenant_id: null, tenant_slug: null }, methods: [],
        },
    } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (request.method() === 'DELETE' && path.startsWith('/api/assets/items/')) {
            const id = path.split('/').filter(Boolean).at(-1) ?? ''
            deleted.push(id)
            assets = assets.filter(asset => asset.id !== id)
            return route.fulfill({ status: 204 })
        }
        let data: unknown = []
        if (path === '/api/assets/types/') data = assetTypes
        if (path === '/api/assets/items/') data = assets
        if (path === '/api/tenants/') data = [{ id: 1, name: 'Example Yard' }, { id: 2, name: 'Other Example Yard' }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
    return { deleted, replace: (next: Asset[]) => { assets = [...next] } }
}

async function refreshInventory(page: Page) {
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assets/items/' && response.request().method() === 'GET')
    await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
        // Simulate leaving and returning to this tab; Query listens on window.
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        window.dispatchEvent(new Event('visibilitychange'))
        if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor)
        else Reflect.deleteProperty(document, 'visibilityState')
        window.dispatchEvent(new Event('visibilitychange'))
    })
    await refreshed
}

for (const width of [1280, 320]) {
    test(`model pages preserve the complete 50-item group and total at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await mockInventory(page, manyModels)
        await page.goto('/assets')
        await expect(modelButtons(page)).toHaveCount(24)
        await expect(page.getByRole('button', { name: firstModel, exact: true })).toContainText('50 items')
        await expect(page.getByText('109 registered items', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Next', exact: true }).click()
        await expect(modelButtons(page)).toHaveCount(24)
        await expect(page.getByRole('button', { name: 'Open Forklift · Example Alpha M25 equipment', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: firstModel, exact: true })).not.toBeVisible()
        await expect(page.getByText('109 registered items', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Last', exact: true }).click()
        await expect(modelButtons(page)).toHaveCount(12)
        await expect(page.getByRole('button', { name: 'Open Forklift · Example Beta M30 equipment', exact: true })).toBeVisible()
        await pageSizeSelector(page).selectOption('12')
        await expect(modelButtons(page)).toHaveCount(12)
        await expect(page.getByRole('button', { name: firstModel, exact: true })).toContainText('50 items')
        await expect(page.getByRole('button', { name: 'First', exact: true })).toBeDisabled()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.getByRole('button', { name: firstModel, exact: true }).click()
        await expect(page.getByRole('article')).toHaveCount(24)
        await expect(page.getByText('1–24 of 50', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Last', exact: true }).click()
        await expect(page.getByRole('article')).toHaveCount(2)
        await expect(page.getByRole('button', { name: 'EX-050', exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
}

test('equal model counts reset summary pages when search or shipyard changes', async ({ page }) => {
    await mockInventory(page, manyModels)
    await page.goto('/assets')
    const search = page.getByRole('searchbox', { name: 'Search equipment, brand, model or code', exact: true })
    await search.fill('Alpha')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(modelButtons(page)).toHaveCount(6)
    await expect(page.getByRole('button', { name: firstModel, exact: true })).not.toBeVisible()
    await search.fill('Beta')
    await expect(modelButtons(page)).toHaveCount(24)
    await expect(page.getByRole('button', { name: 'Open Forklift · Example Beta M01 equipment', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'First', exact: true })).toBeDisabled()
    await search.fill('')
    const owner = page.getByRole('combobox', { name: 'Shipyard', exact: true })
    await owner.selectOption('1')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(modelButtons(page)).toHaveCount(6)
    await owner.selectOption('2')
    await expect(modelButtons(page)).toHaveCount(24)
    await expect(page.getByRole('button', { name: 'Open Forklift · Example Beta M01 equipment', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'First', exact: true })).toBeDisabled()
})

test('record page size remains editable when 48 per page fits a 25-item model', async ({ page }) => {
    await mockInventory(page, fiftyRecords.slice(0, 25))
    await page.goto('/assets')
    await page.getByRole('button', { name: firstModel, exact: true }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(1)
    await pageSizeSelector(page).selectOption('48')
    await expect(page.getByRole('article')).toHaveCount(25)
    await expect(pageSizeSelector(page)).toHaveValue('48')
    await expect(page.getByRole('button', { name: 'First', exact: true })).toBeDisabled()
    await pageSizeSelector(page).selectOption('12')
    await expect(page.getByRole('article')).toHaveCount(12)
    await expect(page.getByRole('button', { name: 'EX-001', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Last', exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'EX-025', exact: true })).toBeVisible()
})

test('deleting the last page persists a populated page when records later grow', async ({ page }) => {
    const records = fiftyRecords.slice(0, 25)
    const { deleted, replace } = await mockInventory(page, records)
    await page.goto('/assets')
    await page.getByRole('button', { name: firstModel, exact: true }).click()
    await page.getByRole('button', { name: 'Last', exact: true }).click()
    await page.getByRole('button', { name: 'Actions: EX-025', exact: true }).click()
    await page.getByRole('button', { name: 'Delete: EX-025', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(24)
    await expect(page.getByRole('button', { name: 'EX-001', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'EX-025', exact: true })).not.toBeVisible()
    await expect(page.getByText('1–24 of 24', { exact: true })).toBeVisible()
    expect(deleted).toEqual(['pagination-equipment-25'])
    replace(records)
    await refreshInventory(page)
    await expect(page.getByRole('article')).toHaveCount(24)
    await expect(page.getByRole('button', { name: 'EX-001', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'First', exact: true })).toBeDisabled()
    await expect(page.getByText('1–24 of 25', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('button', { name: 'EX-025', exact: true })).toBeVisible()
})

test('summary persists its clamped page when refreshed inventory shrinks then grows', async ({ page }) => {
    const records = Array.from({ length: 25 }, (_, index) => equipment(index + 1, `M${String(index + 1).padStart(2, '0')}`))
    const inventory = await mockInventory(page, records)
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Last', exact: true }).click()
    await expect(modelButtons(page)).toHaveCount(1)
    inventory.replace(records.slice(0, 24))
    await refreshInventory(page)
    await expect(modelButtons(page)).toHaveCount(24)
    await expect(page.getByRole('button', { name: firstModel, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'First', exact: true })).toBeDisabled()
    await expect(page.getByText('24 registered items', { exact: true })).toBeVisible()
    inventory.replace(records)
    await refreshInventory(page)
    await expect(modelButtons(page)).toHaveCount(24)
    await expect(page.getByRole('button', { name: firstModel, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'First', exact: true })).toBeDisabled()
    await expect(page.getByText('25 registered items', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(modelButtons(page)).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Open Forklift · Example Alpha M25 equipment', exact: true })).toBeVisible()
})

test('mixed stock summary keeps full material quantities and equipment count across pages', async ({ page }) => {
    const stockType: AssetType = {
        ...forklift, id: 'pagination-stock', name: 'Material stock', tracking_mode: 'stock',
        schema: [
            { key: 'material_code', label: 'Material code', type: 'text', is_unique_key: true },
            { key: 'material_name', label: 'Material name', type: 'text' },
            { key: 'quantity', label: 'Stock quantity', type: 'number' },
        ],
    }
    const stock = Array.from({ length: 25 }, (_, index): Asset => ({
        ...equipment(index + 51, ''), asset_type: stockType.id, asset_type_name: stockType.name,
        custom_data: { material_code: `EX-STOCK-${index + 1}`, material_name: `Example material ${String(index + 1).padStart(2, '0')}`, quantity: index + 1 },
    }))
    await mockInventory(page, [...fiftyRecords, ...stock], [forklift, stockType])
    await page.goto('/assets')
    const fullTotal = page.getByText('50 registered items · 25 stock lines · 325 pieces', { exact: true })
    await expect(fullTotal).toBeVisible()
    await expect(page.getByRole('button', { name: /^Open .* (equipment|material details)$/ })).toHaveCount(24)
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Open .* (equipment|material details)$/ })).toHaveCount(2)
    await expect(page.getByRole('button', { name: firstModel, exact: true })).toContainText('50 items')
    await expect(fullTotal).toBeVisible()
})
