import { expect, test, type Page } from '@playwright/test'

const categories = [
    { code: 'J', name: 'Mechanical workshop equipment', count: 1 },
    { code: 'K', name: 'Electric and hand tools', count: 3 },
    { code: 'L', name: 'Occupational safety equipment', count: 5 },
    { code: 'M', name: 'Environmental equipment', count: 1 },
]

const equipmentTypes = categories.flatMap(category => Array.from({ length: category.count }, (_, index) => ({
    id: `layout-${category.code}-${index}`,
    name: index === 0 ? `${category.code} Portable equipment for shipyard maintenance and workshop operations` : `${category.code} Tool ${index + 1}`,
    catalog_code: `${category.code}-LAYOUT-${index + 1}`,
    category_code: category.code,
    sharing_class: 'B',
    sharing_excluded: index === 0,
    exclusion_reason: index === 0 ? 'Personal equipment excluded from sharing.' : '',
    description: index === 0 ? 'Equipment with a longer description covering technical capacity, workshop use and a maintenance assessment before sharing across shipyards.' : index === 1 ? '' : 'Workshop equipment.',
    schema: [{ key: 'code', label: 'Equipment code', type: 'text', required: true, is_unique_key: true }, { key: 'capacity', label: 'Capacity', type: 'number', required: false }],
})))

async function mockCatalog(page: Page, platformAdmin = true) {
    const writes: string[] = []
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('theme', 'light')
    })
    await page.route('**/_allauth/browser/v1/**', async route => {
        const config = new URL(route.request().url()).pathname.endsWith('/config')
        await route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: config ? {
            account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
        } : {
            user: { id: '1', username: 'layout', email: 'layout@example.test', role: 'platform_admin', is_superuser: platformAdmin, tenant_id: platformAdmin ? null : 1, tenant_slug: platformAdmin ? null : 'yard' },
            methods: [],
        } } })
    })
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (request.method() !== 'GET') writes.push(`${request.method()} ${path}`)
        if (path.endsWith('/stream/')) return route.abort()
        await route.fulfill({ json: path === '/api/assets/types/' ? equipmentTypes : path.endsWith('/unread_count/') ? { unread_count: 0 } : [] })
    })
    return writes
}

for (const width of [1440, 900, 390, 320]) {
    test(`catalog rows stay readable and category filtering works at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 })
        const writes = await mockCatalog(page)
        await page.goto('/assets/types')
        const results = page.getByRole('region', { name: 'All equipment types', exact: true })
        await expect(results.getByRole('listitem')).toHaveCount(equipmentTypes.length)
        await expect(page.getByText('Shared platform definition', { exact: true })).toBeVisible()
        await expect(page.getByText('Shipyard-owned record', { exact: true })).toBeVisible()
        if (width >= 1024) {
            await page.getByRole('navigation', { name: 'Categories', exact: true }).getByRole('button', { name: /Electric and hand tools/ }).click()
        } else {
            await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('K')
        }
        await expect(results.getByRole('listitem')).toHaveCount(3)
        await expect(results.getByRole('status')).toHaveText('3 results from 10 types')
        const type = equipmentTypes.find(item => item.category_code === 'K')!
        const row = results.getByRole('listitem').filter({ has: page.getByRole('button', { name: type.name, exact: true }) })
        await expect(row.getByText('Excluded from sharing', { exact: true })).toBeVisible()
        await expect(row.getByText('1 optional', { exact: true })).toBeVisible()
        await expect(row.getByText('1 required', { exact: true })).toBeVisible()
        await row.getByRole('button', { name: `View equipment type: ${type.name}`, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: type.name, exact: true })
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText(type.catalog_code, { exact: true })).toBeVisible()
        await expect(dialog.getByText('Common catalog code', { exact: true })).toBeVisible()
        await expect(dialog.getByText('Optional', { exact: true })).toBeVisible()
        await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
        await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
        await expect(results.getByRole('listitem')).toHaveCount(equipmentTypes.length)
        await page.screenshot({ path: testInfo.outputPath('common-catalog.png'), fullPage: true })
        await page.getByRole('searchbox', { name: 'Search catalog', exact: true }).fill(type.catalog_code)
        await expect(results.getByRole('listitem')).toHaveCount(1)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(1)
        expect(writes).toEqual([])
    })
}

test('shipyard sees catalog definitions and opens its inventory with the selected type', async ({ page }) => {
    await mockCatalog(page, false)
    await page.goto('/assets/types')
    await expect(page.getByRole('button', { name: 'Add type', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Edit:/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Delete:/ })).toHaveCount(0)
    const type = equipmentTypes[0]
    await page.getByRole('button', { name: `View equipment type: ${type.name}`, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: type.name, exact: true })
    await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    const inventoryLink = dialog.getByRole('link', { name: 'Add to inventory', exact: true })
    await expect(inventoryLink).toHaveAttribute('href', `/assets?asset_type=${type.id}&add=true`)
    await inventoryLink.click()
    await expect(page).toHaveURL(new RegExp(`/assets\\?asset_type=${type.id}&add=true$`))
})
