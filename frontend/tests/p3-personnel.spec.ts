import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Asset, AssetType } from '../src/modules/assets/types'

const types: AssetType[] = Array.from({ length: 24 }, (_, index) => ({
    id: `type-${index}`, name: `Equipment ${String(index).padStart(2, '0')}`, description: '', catalog_code: `B-${index + 100}`,
    category_code: 'B', tracking_mode: 'individual', created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z', created_by: 1,
    schema: [{ key: 'serial', label: 'Serial number', type: 'text', is_unique_key: true, required: true },
        { key: 'capacity', label: 'Capacity', type: 'number' }],
}))
const original: Asset = {
    id: 'personnel-record', asset_type: 'type-0', asset_type_name: 'Equipment 00', inventory_code: 'YARD-001', tenant: 1,
    tenant_name: 'Example Yard', custom_data: { serial: 'SERIAL-001', capacity: 12 }, is_shared: false, is_listed_for_sharing: false,
    created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z', created_by: 1, assigned_to: null, assigned_to_username: null,
}

async function setup(page: Page, inventoryCode = original.inventory_code, options: { language?: string; stock?: boolean } = {}) {
    const writes: { method: string; path: string; data: Record<string, unknown> }[] = []
    let records = [{ ...original, inventory_code: inventoryCode, ...(options.stock ? { custom_data: { serial: 'SERIAL-001', capacity: 12, quantity: 10 } } : {}) }]
    const fixtureTypes = options.stock ? [{ ...types[0], tracking_mode: 'stock', schema: [{ key: 'quantity', label: 'Stock quantity', type: 'number', role: 'quantity' }] }] : types
    await page.addInitScript(language => { localStorage.setItem('language', language); localStorage.setItem('vite-ui-theme', 'light') }, options.language ?? 'en')
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? {
        account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
    } : { user: { id: '1', username: 'example', email: 'example@example.test', role: 'tenant_user', is_superuser: false,
        tenant_id: 1, tenant_slug: 'example-yard', tenant_name: 'Example Yard' }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (!['GET', 'HEAD'].includes(request.method())) writes.push({ method: request.method(), path, data: request.postDataJSON() })
        let data: unknown = []
        if (path === '/api/assets/types/') data = fixtureTypes
        if (path === '/api/assets/items/') data = records
        if (path === '/api/assets/items/personnel-record/' && request.method() === 'PATCH') {
            records = [{ ...records[0], ...request.postDataJSON() }]
            data = records[0]
        }
        if (path.endsWith('/batch_create/')) data = { created_count: 1, record_count: 1, unit_count: 1 }
        if (path === '/api/tenants/') data = [{ id: 1, name: 'Example Yard' }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        if (path.endsWith('/export/')) return route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'fictional export' })
        await route.fulfill({ json: data })
    })
    await page.goto('/assets')
    return writes
}

async function tabTo(page: Page, target: Locator) {
    for (let index = 0; index < 60; index += 1) {
        if (await target.evaluate(element => element === document.activeElement).catch(() => false)) return
        await page.keyboard.press('Tab')
    }
    await expect(target).toBeFocused()
}

for (const interaction of ['pointer', 'keyboard']) for (const width of [1440, 390, 320]) {
    test(`personnel browse, edit, export and import with ${interaction} at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
        const writes = await setup(page)
        const activate = async (target: Locator) => {
            if (interaction === 'pointer') await target.click()
            else { await tabTo(page, target); await page.keyboard.press('Enter') }
        }
        const enter = async (target: Locator, value: string) => {
            if (interaction === 'pointer') await target.fill(value)
            else { await tabTo(page, target); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(value) }
        }
        await enter(page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' }), 'SERIAL-001')
        await activate(page.getByRole('button', { name: 'All records', exact: true }))
        const row = page.getByRole('article', { name: 'Equipment 00 · YARD-001', exact: true })
        await expect(row).toContainText('Serial number: SERIAL-001')
        await expect(row).toContainText('Capacity: 12')
        await activate(row.getByRole('button', { name: 'YARD-001', exact: true }))
        const detail = page.getByRole('dialog')
        await expect(detail.getByRole('button', { name: 'Manage sharing', exact: true })).toHaveCount(0)
        await activate(detail.getByRole('button', { name: 'Edit', exact: true }))
        const edit = page.getByRole('dialog', { name: 'Edit equipment', exact: true })
        await enter(edit.getByRole('textbox', { name: 'Serial number', exact: true }), 'SERIAL-002')
        await activate(edit.getByRole('button', { name: 'Save', exact: true }))
        await expect(edit).not.toBeVisible()
        await expect(page.getByRole('searchbox')).toHaveValue('SERIAL-001')
        await enter(page.getByRole('searchbox'), 'SERIAL-002')
        await expect(row).toContainText('SERIAL-002')
        expect(writes).toHaveLength(1)
        expect(writes[0]).toMatchObject({ method: 'PATCH', path: '/api/assets/items/personnel-record/', data: { custom_data: { serial: 'SERIAL-002' } } })
        expect(writes[0].data).not.toHaveProperty('tenant')
        await activate(page.getByRole('button', { name: 'More actions', exact: true }))
        await activate(page.getByRole('button', { name: 'Visible results (CSV)', exact: true }))
        const csv = page.getByRole('dialog', { name: 'Export inventory', exact: true })
        await expect(csv).toContainText('1 record')
        await expect(csv).toContainText('Includes every page matching')
        const downloaded = page.waitForEvent('download')
        await activate(csv.getByRole('button', { name: 'Download CSV', exact: true }))
        await downloaded
        await activate(page.getByRole('button', { name: 'Import from Excel', exact: true }))
        const upload = page.getByRole('dialog', { name: 'Bulk Asset Import', exact: true })
        await expect(upload.getByRole('combobox', { name: 'Shipyard', exact: true })).toHaveCount(0)
        await expect(upload.getByRole('button', { name: 'Download combined template', exact: true })).toHaveCount(0)
        await expect(upload.getByRole('combobox', { name: 'Template equipment type', exact: true })).toBeVisible()
        await expect(upload).toHaveCSS('opacity', '1')
        await page.screenshot({ path: testInfo.outputPath(`personnel-upload-${width}.png`) })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const imports: string[] = []
        await page.route('**/api/assets/items/preview_import/', route => route.fulfill({ json: {
            headers: ['Serial number'], preview_rows: [['SERIAL-IMPORT']], total_rows: 1, detected_template: null,
            analysis: { version: 1, sheet_name: 'Inventory', sheet_names: ['Inventory'], header_row: 1, data_start_row: 2,
                layout_confidence: 'high', suggested_asset_type_id: types[0].id, analysis_asset_type_id: types[0].id,
                analysis_mapping: { 'Serial number': 'serial' }, suggested_mapping: { 'Serial number': 'serial' },
                type_suggestions: [{ asset_type_id: types[0].id, asset_type_name: types[0].name, confidence: 'high', mapping: { 'Serial number': 'serial' }, matched_fields: 1 }],
                counts: { data: 1, ready: 1, skipped: 0, review: 0 }, blockers: [], warnings: [], skipped_rows: [], review_rows: [], review_row_numbers: [] },
        } }))
        await page.route('**/api/assets/items/raw_import/', async route => {
            imports.push(route.request().postData() ?? '')
            await route.fulfill({ json: { created_count: 1, updated_count: 0, skipped_count: 0, error_count: 0, errors: [], message: 'Example equipment imported' } })
        })
        const fileChooser = page.waitForEvent('filechooser')
        await activate(upload.getByRole('button', { name: 'Choose an Excel file (.xlsx) or drag it here', exact: true }))
        await (await fileChooser).setFiles({ name: 'example-personnel.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fictional personnel import') })
        await activate(upload.getByRole('button', { name: 'Preview & continue', exact: true }))
        await expect(upload.getByRole('combobox', { name: 'Equipment type', exact: true })).toHaveValue(types[0].id)
        await activate(upload.getByRole('button', { name: 'Import 1 ready records', exact: true }))
        await expect(upload.getByText('Example equipment imported', { exact: true })).toBeVisible()
        expect(imports).toHaveLength(1)
        expect(imports[0]).not.toContain('name="tenant"')
        expect(imports[0]).toContain('name="require_review"')
        await activate(upload.getByRole('button', { name: 'Close', exact: true }).last())
        await expect(upload).not.toBeVisible()
        await row.scrollIntoViewIfNeeded()
        await page.screenshot({ path: testInfo.outputPath(`personnel-records-${width}.png`) })
    })
}

test('keyboard catalog browsing keeps active result in sight and resumes at quantity after choice', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setup(page)
    await tabTo(page, page.getByRole('button', { name: 'Add equipment', exact: true }))
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Add equipment', exact: true })
    const picker = dialog.getByRole('combobox', { name: 'Equipment type', exact: true })
    await tabTo(page, picker)
    for (let index = 0; index < 19; index += 1) await page.keyboard.press('ArrowDown')
    const activeId = await picker.getAttribute('aria-activedescendant')
    const active = page.locator(`[id="${activeId}"]`)
    await expect(active).toContainText('Equipment 19')
    const optionBounds = await active.boundingBox()
    const listBounds = await dialog.getByRole('listbox').boundingBox()
    expect(optionBounds!.y).toBeGreaterThanOrEqual(listBounds!.y)
    expect(optionBounds!.y + optionBounds!.height).toBeLessThanOrEqual(listBounds!.y + listBounds!.height + 1)
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('button', { name: 'Change', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('textbox', { name: 'Serial number', exact: true })).toBeFocused()
    await page.keyboard.type('SERIAL-KEYBOARD')
    await tabTo(page, dialog.getByRole('button', { name: 'Add to inventory', exact: true }))
    await page.screenshot({ path: testInfo.outputPath('personnel-keyboard-add.png'), fullPage: true })
    await page.keyboard.press('Enter')
    await expect(dialog).not.toBeVisible()
})

test('keyboard can leave an unselected catalog without tabbing through every result', async ({ page }) => {
    await setup(page)
    await tabTo(page, page.getByRole('button', { name: 'Add equipment', exact: true }))
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Add equipment', exact: true })
    await tabTo(page, dialog.getByRole('combobox', { name: 'Equipment type', exact: true }))
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toBeFocused()
})

test('choosing and changing an equipment type retains keyboard focus inside its picker', async ({ page }) => {
    await setup(page)
    await tabTo(page, page.getByRole('button', { name: 'Add equipment', exact: true }))
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Add equipment', exact: true })
    const picker = dialog.getByRole('combobox', { name: 'Equipment type', exact: true })
    await tabTo(page, picker)
    await page.keyboard.press('Enter')
    const change = dialog.getByRole('button', { name: 'Change', exact: true })
    await expect(change).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(picker).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(change).toBeFocused()
    await expect(dialog).toBeVisible()
})

test('a full-length inventory code wraps without hiding mobile record actions', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 })
    const code = 'X'.repeat(160)
    await setup(page, code)
    await page.getByRole('button', { name: 'All records', exact: true }).click()
    const row = page.getByRole('article')
    await expect(row.getByRole('button', { name: code, exact: true })).toBeVisible()
    expect(await row.getByText(`Inventory code: ${code}`, { exact: true }).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await row.getByRole('button', { name: `Actions: ${code}`, exact: true }).click()
    await expect(row.getByRole('button', { name: `Edit: ${code}`, exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('personnel-long-code-320.png'), fullPage: true })
})

for (const language of ['en', 'tr']) test(`personnel inventory guidance describes available actions (${language})`, async ({ page }) => {
    for (const stock of [false, true]) {
        await setup(page, original.inventory_code, { language, stock })
        await page.getByRole('button', { name: language === 'tr' ? 'Tüm kayıtlar' : 'All records', exact: true }).click()
        const expected = stock
            ? language === 'tr' ? 'Malzemeyi açarak adını, kodunu ve stok adedini görün. Düzenlemek için İşlemler menüsünü kullanın.' : 'Open a material to see its name, code and stock quantity. Use Actions to edit.'
            : language === 'tr' ? 'Ayrıntıları görmek için ekipmanı açın. Düzenlemek için İşlemler menüsünü kullanın.' : 'Open an item to view its details. Use Actions to edit.'
        await expect(page.getByText(expected, { exact: true })).toBeVisible()
        await page.getByRole('article').getByRole('button', { name: `${language === 'tr' ? 'İşlemler' : 'Actions'}: YARD-001`, exact: true }).click()
        await expect(page.getByRole('button', { name: language === 'tr' ? 'Paylaşımı yönet: YARD-001' : 'Manage sharing: YARD-001', exact: true })).toHaveCount(0)
    }
})

test('one equipment result uses singular counts in English summaries and search', async ({ page }) => {
    await setup(page)
    await expect(page.getByText('1 registered item', { exact: true })).toBeVisible()
    await expect(page.getByText('1 item', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'All records', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: /^1 item$/ })).toBeVisible()
    await page.getByRole('searchbox').fill('SERIAL-001')
    await expect(page.getByRole('status').filter({ hasText: /^1 matching item$/ })).toBeVisible()
})
