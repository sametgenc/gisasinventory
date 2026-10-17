import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const types = [
    { id: 'crane', name: 'Example crane', category_code: 'B', tracking_mode: 'individual', schema: [{ key: 'serial', label: 'Serial', type: 'text' }] },
    { id: 'pump', name: 'Example pump', category_code: 'C', tracking_mode: 'individual', schema: [{ key: 'serial', label: 'Serial', type: 'text' }] },
]
const assets = Array.from({ length: 28 }, (_, index) => ({
    id: `record-${index}`, asset_type: index === 27 ? 'pump' : 'crane', asset_type_name: index === 27 ? 'Example pump' : 'Example crane',
    tenant: index === 26 ? 2 : 1, tenant_name: index === 26 ? 'Other Yard' : 'Example Yard',
    inventory_code: `INV-${index}`, custom_data: { serial: index === 0 ? '=HYPERLINK("https://example.test","Örnek")' : `MATCH-${index}` },
    is_shared: false, is_listed_for_sharing: false, created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z',
}))

async function setup(page: Page, global = false, empty = false) {
    const exports: URL[] = []
    await page.addInitScript(() => { localStorage.setItem('language', 'en'); localStorage.setItem('vite-ui-theme', 'light') })
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? {
        account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
    } : { user: { id: '1', username: 'example', email: 'example@example.test', role: global ? 'platform_admin' : 'tenant_user', is_superuser: global,
        tenant_id: global ? null : 1, tenant_slug: global ? null : 'example-yard', tenant_name: global ? null : 'Example Yard' }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const url = new URL(route.request().url())
        if (url.pathname.endsWith('/stream/')) return route.abort()
        if (url.pathname === '/api/assets/items/export/') {
            exports.push(url)
            return route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'fictional workbook' })
        }
        let data: unknown = []
        if (url.pathname === '/api/assets/types/') data = types
        if (url.pathname === '/api/assets/items/') data = empty ? [] : global ? assets : assets.filter(asset => asset.tenant === 1)
        if (url.pathname === '/api/tenants/') data = [{ id: 1, name: 'Example Yard' }, { id: 2, name: 'Other Yard' }]
        if (url.pathname.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
    await page.goto('/assets')
    return exports
}

async function openExport(page: Page, name = 'Visible results (CSV)') {
    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await page.getByRole('button', { name, exact: true }).click()
    return page.getByRole('dialog', { name: 'Export inventory', exact: true })
}

test('filtered CSV explains all pages, exports only matches, and keeps formula text literal', async ({ page }) => {
    const exports = await setup(page)
    await page.getByRole('button', { name: 'All records', exact: true }).click()
    await page.getByRole('combobox', { name: 'Equipment type', exact: true }).selectOption('crane')
    const dialog = await openExport(page)
    await expect(dialog.getByText('26 records', { exact: true })).toBeVisible()
    await expect(dialog).toContainText('Includes every page matching the current search and filters.')
    const downloadEvent = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download CSV', exact: true }).click()
    const download = await downloadEvent
    const text = await readFile((await download.path())!, 'utf8')
    expect(text).toContain('MATCH-25')
    expect(text).not.toContain('MATCH-26')
    expect(text).not.toContain('Example pump')
    expect(text).toContain("'=HYPERLINK")
    expect(text).toContain('Örnek')
    expect(exports).toHaveLength(0)
})

test('search narrows visible export without changing the all-type Excel scope', async ({ page }) => {
    await setup(page)
    await page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' }).fill('MATCH-25')
    const dialog = await openExport(page)
    await expect(dialog.getByText('1 record', { exact: true })).toBeVisible()
    const downloaded = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download CSV', exact: true }).click()
    const text = await readFile((await (await downloaded).path())!, 'utf8')
    expect(text).toContain('MATCH-25')
    expect(text).not.toContain('MATCH-24')
})

test('all-type Excel starts from current type and shipyard and states ignored filters', async ({ page }) => {
    const exports = await setup(page, true)
    await page.getByRole('button', { name: 'All records', exact: true }).click()
    await page.getByRole('combobox', { name: 'Equipment type', exact: true }).selectOption('crane')
    await page.getByRole('combobox', { name: 'Shipyard', exact: true }).selectOption('2')
    await page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' }).fill('MATCH-26')
    const dialog = await openExport(page, 'All records of a type (Excel)')
    await expect(dialog.getByRole('combobox', { name: 'Equipment type', exact: true })).toHaveValue('crane')
    await expect(dialog.getByRole('combobox', { name: 'Target shipyard', exact: true })).toHaveValue('2')
    await expect(dialog).toContainText('Search, category, model and update filters do not apply.')
    const downloaded = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download Excel', exact: true }).click()
    await downloaded
    expect(exports).toHaveLength(1)
    expect(exports[0].searchParams.get('asset_type')).toBe('crane')
    expect(exports[0].searchParams.get('tenant')).toBe('2')
    expect([...exports[0].searchParams.keys()].sort()).toEqual(['asset_type', 'tenant'])
})

test('personnel Excel stays in own shipyard and mobile scope controls fit', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    const exports = await setup(page)
    const dialog = await openExport(page, 'All records of a type (Excel)')
    await expect(dialog.getByRole('combobox', { name: 'Target shipyard', exact: true })).toHaveCount(0)
    await expect(dialog).toContainText('Only records you can access in your shipyard are included.')
    await dialog.getByRole('combobox', { name: 'Equipment type', exact: true }).selectOption('crane')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const downloaded = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download Excel', exact: true }).click()
    await downloaded
    expect(exports[0].searchParams.has('tenant')).toBe(false)
})

test('empty visible results cannot download CSV but can export a selected type', async ({ page }) => {
    await setup(page, false, true)
    const dialog = await openExport(page, 'All records of a type (Excel)')
    await dialog.getByRole('radio', { name: 'Visible results (CSV)', exact: true }).check()
    await expect(dialog.getByRole('button', { name: 'Download CSV', exact: true })).toBeDisabled()
    await dialog.getByRole('radio', { name: 'All records of a type (Excel)', exact: true }).check()
    await dialog.getByRole('combobox', { name: 'Equipment type', exact: true }).selectOption('crane')
    await expect(dialog.getByRole('button', { name: 'Download Excel', exact: true })).toBeEnabled()
})

test('CSV treats formula-like strings as text while preserving numbers and quotes', async ({ page }) => {
    await setup(page)
    const downloaded = page.waitForEvent('download')
    await page.evaluate(async () => {
        const path = '/src/utils/report.ts'
        const { exportReport } = await import(/* @vite-ignore */ path)
        exportReport([{ value: '\t @SUM(1,2)' }, { value: '+SUM(1,2)' }, { value: '-7' }, { value: -7 }, { value: 'a;"b"' }],
            [{ header: '=unsafe', value: (row: { value: string | number }) => row.value }], 'literal-report')
    })
    const text = await readFile((await (await downloaded).path())!, 'utf8')
    expect(text).toContain("'=unsafe")
    expect(text).toContain("'\t @SUM")
    expect(text).toContain("'+SUM")
    expect(text).toContain("'-7")
    expect(text).toContain('\r\n-7\r\n')
    expect(text).toContain('"a;""b"""')
})

test('failed Excel download keeps scope for retry and pending download locks changes', async ({ page }) => {
    await setup(page, true)
    let requests = 0
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/assets/items/export/**', async route => {
        requests += 1
        if (requests === 1) {
            await pending
            return route.fulfill({ status: 503, json: { detail: 'Temporary failure' } })
        }
        return route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'fictional workbook' })
    })
    const dialog = await openExport(page, 'All records of a type (Excel)')
    const type = dialog.getByRole('combobox', { name: 'Equipment type', exact: true })
    const shipyard = dialog.getByRole('combobox', { name: 'Target shipyard', exact: true })
    await type.selectOption('crane')
    await shipyard.selectOption('2')
    await dialog.getByRole('button', { name: 'Download Excel', exact: true }).click()
    await expect(type).toBeDisabled()
    await expect(shipyard).toBeDisabled()
    await expect(dialog.getByRole('radio').first()).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    expect(requests).toBe(1)
    release()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(type).toHaveValue('crane')
    await expect(shipyard).toHaveValue('2')
    const downloaded = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download Excel', exact: true }).click()
    await downloaded
    expect(requests).toBe(2)
})
