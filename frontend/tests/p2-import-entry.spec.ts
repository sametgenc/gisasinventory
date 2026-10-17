import { expect, test, type Page } from '@playwright/test'
import { suggestsCombinedWorkbook } from '../src/modules/assets/p2-import-copy'
import type { AssetType } from '../src/modules/assets/types'
const type: AssetType = { id: 'p2-crane', name: 'Example crane', description: '', tracking_mode: 'individual', catalog_code: 'EXAMPLE', schema: [{ key: 'serial', label: 'Serial number', type: 'text', required: true, role: 'identifier' }], created_by: 1, created_at: '', updated_at: '' }
const file = { name: 'example.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fictional file preserved across review routes') }
interface SetupOptions { types?: AssetType[]; tenants?: { id: number; name: string; is_active: boolean }[]; open?: boolean; unassigned?: boolean }
async function setup(page: Page, role = 'tenant_admin', options: SetupOptions = {}) {
    await page.addInitScript(() => { localStorage.setItem('language', 'en'); localStorage.setItem('vite-ui-theme', 'light') })
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } } : { user: { id: '1', username: 'example', email: 'example@example.test', role: role === 'global' ? 'platform_admin' : role, is_superuser: role === 'global', tenant_id: role === 'global' || options.unassigned ? null : 1, tenant_slug: role === 'global' || options.unassigned ? null : 'example', tenant_name: role === 'global' || options.unassigned ? null : 'Example Yard' }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        await route.fulfill({ json: path === '/api/assets/types/' ? options.types ?? [type] : path === '/api/tenants/' ? options.tenants ?? [{ id: 1, name: 'Example Yard', is_active: true }] : path.endsWith('/unread_count/') ? { unread_count: 0 } : [] })
    })
    await page.goto('/assets')
    if (options.open !== false) await page.getByRole('button', { name: 'Import from Excel', exact: true }).click()
    return page.getByRole('dialog', { name: 'Bulk Asset Import', exact: true })
}

test('one inventory upload entry contains both appropriate templates', async ({ page }) => {
    const dialog = await setup(page)
    await expect(page.getByRole('main').getByRole('button', { name: 'Type and inventory workbook', exact: true })).not.toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Need a template?', exact: true })).toBeVisible()
    const download = dialog.getByRole('button', { name: 'Download one-type template', exact: true })
    await expect(download).toBeDisabled()
    await dialog.getByRole('combobox', { name: 'Template equipment type', exact: true }).selectOption(type.id)
    await expect(download).toBeEnabled()
    await expect(dialog.getByRole('button', { name: 'Download combined template', exact: true })).toBeVisible()
    await expect(dialog.getByText('Valid rows may be saved even if other rows fail. Read the row results before retrying.', { exact: true })).toBeVisible()
})

test('file contents recommend combined review and transfer same file without saving', async ({ page }) => {
    const dialog = await setup(page)
    let commits = 0
    const reviews: string[] = []
    await page.route('**/api/assets/items/preview_import/', route => route.fulfill({ json: { headers: ['Serial number'], preview_rows: [['EXAMPLE-01']], total_rows: 1, detected_template: null, analysis: { version: 1, sheet_name: 'Envanter', sheet_names: ['Ekipman türleri', 'Alanlar', 'Envanter'], header_row: 1, data_start_row: 2, layout_confidence: 'high', suggested_asset_type_id: type.id, analysis_asset_type_id: type.id, analysis_mapping: { 'Serial number': 'serial' }, suggested_mapping: { 'Serial number': 'serial' }, type_suggestions: [{ asset_type_id: type.id, asset_type_name: type.name, confidence: 'high', mapping: { 'Serial number': 'serial' }, matched_fields: 1 }], counts: { data: 1, ready: 1, skipped: 0, review: 0 }, blockers: [], warnings: [], skipped_rows: [], review_rows: [], review_row_numbers: [] } } }))
    await page.route('**/api/assets/workbook/preview/', async route => { reviews.push(route.request().postData() ?? ''); await route.fulfill({ json: { summary: { types_created: 1, types_updated: 0, assets_created: 0, assets_updated: 0, skipped_rows_count: 0 }, preview_token: 'p2-reviewed', can_commit: true, rows: [], errors: [], notices: [], action_required: [] } }) })
    await page.route('**/api/assets/workbook/commit/', async route => { commits += 1; await route.fulfill({ status: 500, json: {} }) })
    await dialog.getByLabel('Equipment Excel file', { exact: true }).setInputFiles(file)
    await dialog.getByRole('button', { name: /Preview/ }).click()
    await expect(dialog.getByText('Combined workbook detected', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Review this file as a combined workbook', exact: true }).click()
    await page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true }).getByRole('button', { name: 'Discard changes', exact: true }).click()
    const combined = page.getByRole('dialog', { name: 'Type and inventory import', exact: true })
    await expect(combined.getByText(file.name, { exact: true })).toBeVisible()
    expect(await combined.getByLabel('Excel workbook', { exact: true }).evaluate(input => (input as HTMLInputElement).files?.[0]?.name)).toBe(file.name)
    await expect(combined.getByText('All workbook changes are applied together. An error leaves every record unchanged.', { exact: true })).toBeVisible()
    await combined.getByRole('button', { name: 'Review workbook', exact: true }).click()
    await expect(combined.getByRole('button', { name: 'Import reviewed records', exact: true })).toBeEnabled()
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toContain(file.buffer.toString())
    expect(commits).toBe(0)
})

for (const role of ['personnel', 'platform_admin']) test(`${role} retains one-type upload without manager workbook tools`, async ({ page }) => {
    const dialog = await setup(page, role)
    await expect(dialog.getByRole('combobox', { name: 'Template equipment type', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Download combined template', exact: true })).not.toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Type and inventory workbook', exact: true })).not.toBeVisible()
    await expect(dialog.getByRole('combobox', { name: 'Shipyard', exact: true })).not.toBeVisible()
})

test('templates work with keyboard at 320px without leaving upload', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    const dialog = await setup(page)
    let downloads = 0
    await page.route('**/api/assets/types/p2-crane/export_template/', async route => { downloads += 1; await route.fulfill({ body: 'fictional template', contentType: file.mimeType }) })
    await dialog.getByRole('combobox', { name: 'Template equipment type', exact: true }).selectOption(type.id)
    await dialog.getByRole('button', { name: 'Download one-type template', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => downloads).toBe(1)
    await expect(dialog).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('switching inventory route protects selected file until explicit discard', async ({ page }) => {
    const dialog = await setup(page)
    await dialog.getByLabel('Equipment Excel file', { exact: true }).setInputFiles(file)
    await dialog.getByRole('button', { name: 'Type and inventory workbook', exact: true }).click()
    await page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByText(file.name, { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Type and inventory import', exact: true })).not.toBeVisible()
})


test('template download blocks dismissal and retains selection after failure', async ({ page }) => {
    const dialog = await setup(page)
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/assets/types/p2-crane/export_template/', async route => { await pending; await route.fulfill({ status: 503, json: { detail: 'Unavailable' } }) })
    await dialog.getByRole('combobox', { name: 'Template equipment type', exact: true }).selectOption(type.id)
    await dialog.getByRole('button', { name: 'Download one-type template', exact: true }).click()
    await expect(dialog).toHaveAttribute('aria-busy', 'true')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    release()
    await expect(dialog.getByRole('alert')).toContainText('Could not download the template. Try again.')
    await expect(dialog.getByRole('combobox', { name: 'Template equipment type', exact: true })).toHaveValue(type.id)
    await expect(dialog.getByRole('button', { name: 'Download one-type template', exact: true })).toBeEnabled()
})

test('global administrator transfers selected yard with file and needs fresh review', async ({ page }) => {
    const dialog = await setup(page, 'global')
    await dialog.getByRole('combobox', { name: 'Shipyard', exact: true }).selectOption('1')
    await dialog.getByLabel('Equipment Excel file', { exact: true }).setInputFiles(file)
    await dialog.getByRole('button', { name: 'Type and inventory workbook', exact: true }).click()
    await page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true }).getByRole('button', { name: 'Discard changes', exact: true }).click()
    const combined = page.getByRole('dialog', { name: 'Type and inventory import', exact: true })
    await expect(combined.getByRole('combobox', { name: 'Inventory target shipyard', exact: true })).toHaveValue('1')
    await expect(combined.getByRole('button', { name: 'Review workbook', exact: true })).toBeEnabled()
    await expect(combined.getByRole('button', { name: 'Import reviewed records', exact: true })).not.toBeVisible()
})


test('combined route suggestions match known server sheet names', () => {
    for (const name of ['Ekipman türleri', 'Varlık tipleri', 'Katalog', 'Alanlar', 'Fields', '1-TAKSONOMI']) {
        expect(suggestsCombinedWorkbook([name]), name).toBe(true)
    }
    expect(suggestsCombinedWorkbook(['Equipment types'])).toBe(false)
    expect(suggestsCombinedWorkbook(['Envanter', 'Inventory', 'Stock', 'Notes'])).toBe(false)
})


for (const state of [
    { label: 'empty catalog', types: [] as AssetType[], tenants: [{ id: 1, name: 'Example Yard', is_active: true }] },
    { label: 'empty shipyards', types: [type], tenants: [] },
    { label: 'empty catalog and shipyards', types: [] as AssetType[], tenants: [] },
]) test(`global first setup can import definitions with ${state.label}`, async ({ page }) => {
    await setup(page, 'global', { ...state, open: false })
    const upload = page.getByRole('button', { name: 'Import from Excel', exact: true })
    await expect(upload).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Add equipment', exact: true })).toBeDisabled()
    let commits = 0
    const previewBodies: string[] = []
    const summary = { types_created: 1, types_updated: 0, assets_created: 0, assets_updated: 0, skipped_rows_count: 0 }
    await page.route('**/api/assets/workbook/preview/', async route => {
        previewBodies.push(route.request().postData() ?? '')
        await route.fulfill({ json: { summary, preview_token: 'first-setup-reviewed', can_commit: true, rows: [], errors: [], notices: [], action_required: [] } })
    })
    await page.route('**/api/assets/workbook/commit/', async route => {
        commits += 1
        expect(route.request().postData()).toContain('first-setup-reviewed')
        await route.fulfill({ json: { summary, detail: 'Example type created' } })
    })
    await upload.click()
    const combined = page.getByRole('dialog', { name: 'Type and inventory import', exact: true })
    await expect(combined.getByRole('combobox', { name: 'Inventory target shipyard', exact: true })).toHaveValue('')
    await combined.getByLabel('Excel workbook', { exact: true }).setInputFiles(file)
    expect(commits).toBe(0)
    await combined.getByRole('button', { name: 'Review workbook', exact: true }).click()
    await expect(combined.getByRole('button', { name: 'Import reviewed records', exact: true })).toBeEnabled()
    expect(previewBodies).toHaveLength(1)
    expect(previewBodies[0]).not.toContain('name="tenant"')
    expect(commits).toBe(0)
    await combined.getByRole('button', { name: 'Import reviewed records', exact: true }).click()
    await expect(combined.getByText('Import completed', { exact: true })).toBeVisible()
    expect(commits).toBe(1)
})

for (const role of ['tenant_admin', 'personnel', 'platform_admin']) test(`${role} cannot use first-setup bypass with an empty catalog`, async ({ page }) => {
    await setup(page, role, { types: [], tenants: [], open: false })
    await expect(page.getByRole('button', { name: 'Import from Excel', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Add equipment', exact: true })).toBeDisabled()
    await expect(page.getByRole('dialog', { name: 'Type and inventory import', exact: true })).not.toBeVisible()
})


for (const role of ['tenant_admin', 'personnel']) test(`${role} without a shipyard cannot use first-setup bypass`, async ({ page }) => {
    await setup(page, role, { unassigned: true, open: false })
    await expect(page.getByRole('button', { name: 'Import from Excel', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Add equipment', exact: true })).toBeDisabled()
})

test('global first setup keeps import locked during loading and after a dependency failure', async ({ page }) => {
    await setup(page, 'global', { types: [], tenants: [], open: false })
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/assets/types/', async route => { await pending; await route.fulfill({ status: 503, json: { detail: 'Example catalog unavailable' } }) })
    await page.reload()
    const upload = page.getByRole('button', { name: 'Import from Excel', exact: true })
    await expect(upload).toBeDisabled()
    release()
    await expect(page.getByRole('alert').filter({ hasText: 'Equipment data could not be loaded.' })).toBeVisible({ timeout: 15000 })
    await expect(upload).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Add equipment', exact: true })).toBeDisabled()
    await expect(page.getByRole('dialog', { name: 'Type and inventory import', exact: true })).not.toBeVisible()
})
