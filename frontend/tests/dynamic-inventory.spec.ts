import { expect, test, type Locator, type Page } from '@playwright/test'
import { schemaRoleKey } from '../src/modules/assets/schema'
import type { Asset, AssetType, AssetTypeCreateInput, SchemaField } from '../src/modules/assets/types'
import type { WorkbookPreview } from '../src/modules/assets/workbook'

const type: AssetType = {
    id: 'dynamic-test-type', name: 'Example workshop equipment', description: '', catalog_code: 'EXAMPLE-TYPE-01',
    tracking_mode: 'individual', schema_revision: 1, schema: [], created_by: 1,
    created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z',
}
const record = (code: string, assetType = type.id, needsUpdate = false): Asset => ({
    id: `example-${code}`, asset_type: assetType, asset_type_name: type.name, tenant: 1, tenant_name: 'Example Yard',
    inventory_code: code, custom_data: {}, needs_update: needsUpdate, missing_required_fields: needsUpdate ? [{ key: 'inspection', label: 'Inspection date' }] : [],
    created_by: 1, created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z',
    assigned_to: null, assigned_to_username: null, is_shared: false, is_listed_for_sharing: false,
})

async function mock(page: Page, options: { global?: boolean; roleOnly?: boolean; types?: AssetType[]; assets?: Asset[] } = {}) {
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('vite-ui-theme', 'light')
    })
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: {
        status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config')
            ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } }
            : { user: { id: '1', username: 'example', email: 'example@example.test',
                role: options.global || options.roleOnly ? 'platform_admin' : 'tenant_admin',
                is_superuser: !!options.global, tenant_id: options.global ? null : 1,
                tenant_slug: options.global ? null : 'example-yard', tenant_name: options.global ? null : 'Example Yard' }, methods: [] },
    } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        let data: unknown = []
        if (path === '/api/assets/types/') data = options.types ?? [type]
        if (path === '/api/assets/items/') data = options.assets ?? []
        if (path === '/api/tenants/') data = [{ id: 1, name: 'Example Yard', is_active: true }, { id: 2, name: 'Other Example Yard', is_active: true }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
}

class TypeEditor {
    readonly dialog: Locator
    constructor(readonly page: Page) { this.dialog = page.getByRole('dialog') }
    async edit() {
        await this.page.goto('/assets/types')
        await this.page.getByRole('button', { name: `Edit: ${type.name}`, exact: true }).click()
    }
    async expand(label: string) { await this.dialog.getByRole('button', { name: new RegExp(`^${label}`) }).click() }
    get fieldName() { return this.dialog.getByRole('textbox', { name: 'Field Name', exact: true }) }
    get fieldRole() { return this.dialog.getByRole('combobox', { name: 'How will this information be used?', exact: true }) }
    get save() { return this.dialog.getByRole('button', { name: 'Save', exact: true }) }
    get apply() { return this.dialog.getByRole('button', { name: 'Apply changes', exact: true }) }
}

test('inventory search finds the shipyard code when no dynamic code field exists', async ({ page }) => {
    await mock(page, { assets: [record('LOCAL-ROW-01'), record('OTHER-ROW-02')] })
    await page.goto('/assets')
    await page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' }).fill('local-row-01')
    await page.getByRole('button', { name: `Open ${type.name} equipment`, exact: true }).click()
    await expect(page.getByRole('button', { name: 'LOCAL-ROW-01', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'OTHER-ROW-02', exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'LOCAL-ROW-01', exact: true }).click()
    await expect(page.getByRole('dialog').getByText('LOCAL-ROW-01', { exact: true }).first()).toBeVisible()
})

test('new stock fields start optional and suggested fields can be removed', async ({ page }) => {
    await mock(page, { global: true })
    let saved: AssetTypeCreateInput | undefined
    await page.route('**/api/assets/types/', async route => {
        if (route.request().method() !== 'POST') return route.fallback()
        saved = route.request().postDataJSON()
        await route.fulfill({ status: 201, json: { ...type, ...saved } })
    })
    await page.goto('/assets/types')
    await page.getByRole('button', { name: 'Add type', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Equipment type name', exact: true }).fill('Example stock')
    await dialog.getByRole('radio', { name: /^Material stock by quantity/ }).check()
    await dialog.getByRole('button', { name: /^Stock quantity/ }).click()
    await expect(dialog.getByRole('checkbox', { name: 'Required field', exact: true })).not.toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: 'Required field', exact: true })).toBeEnabled()
    const deleteFields = dialog.getByRole('button', { name: 'Delete', exact: true })
    await expect(deleteFields).toHaveCount(3)
    await expect(deleteFields.nth(2)).toBeEnabled()
    await deleteFields.nth(2).click()
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(saved?.tracking_mode).toBe('stock')
    expect(saved?.schema.map(field => field.required)).toEqual([false, false])
    expect(saved?.schema.some(field => field.role === 'quantity')).toBe(false)
})

test('renaming an existing field keeps its key and requires a reviewed impact before saving', async ({ page }, testInfo) => {
    const original: AssetType = { ...type, schema: [{ key: 'legacy_inspection_date', label: 'Inspection date', type: 'date', required: false }] }
    await mock(page, { global: true, types: [original] })
    const impacts: SchemaField[][] = []
    let saved: AssetTypeCreateInput | undefined
    await page.route(`**/api/assets/types/${type.id}/schema_impact/`, async route => {
        impacts.push(route.request().postDataJSON().schema)
        await route.fulfill({ json: { affected_asset_count: 3, affected_tenant_count: 2 } })
    })
    await page.route(`**/api/assets/types/${type.id}/`, async route => {
        saved = route.request().postDataJSON()
        await route.fulfill({ json: { ...original, ...saved } })
    })
    const editor = new TypeEditor(page)
    await editor.edit()
    await editor.expand('Inspection date')
    await editor.fieldName.fill('Last inspection')
    await editor.dialog.getByText('Required field', { exact: true }).click()
    await expect(editor.dialog.getByRole('checkbox', { name: 'Required field', exact: true })).toBeChecked()
    await editor.save.click()
    await expect(editor.dialog.getByRole('status').filter({ hasText: '3 records' })).toContainText('3 records will need updates across 2 shipyards.')
    await editor.dialog.screenshot({ path: testInfo.outputPath('schema-impact-review.png') })
    expect(saved).toBeUndefined()
    expect(impacts[0][0]).toMatchObject({ key: 'legacy_inspection_date', label: 'Last inspection', required: true })
    // Further editing invalidates the reviewed proposal; the first confirmation cannot save it.
    await editor.fieldName.fill('Most recent inspection')
    await expect(editor.apply).not.toBeVisible()
    await editor.save.click()
    await expect(editor.apply).toBeEnabled()
    expect(impacts).toHaveLength(2)
    expect(saved).toBeUndefined()
    await editor.apply.click()
    await expect(editor.dialog).not.toBeVisible()
    expect(saved?.schema[0]).toMatchObject({ key: 'legacy_inspection_date', label: 'Most recent inspection', required: true })
})

test('an explicitly removed semantic role stays additional information even with a legacy key', async ({ page }) => {
    const original: AssetType = { ...type, tracking_mode: 'stock', schema: [{ key: 'quantity', label: 'Quantity', type: 'number', required: false, role: 'quantity' }] }
    await mock(page, { global: true, types: [original] })
    let saved: AssetTypeCreateInput | undefined
    await page.route(`**/api/assets/types/${type.id}/schema_impact/`, route => route.fulfill({ json: { affected_asset_count: 0, affected_tenant_count: 0 } }))
    await page.route(`**/api/assets/types/${type.id}/`, async route => {
        saved = route.request().postDataJSON()
        await route.fulfill({ json: { ...original, ...saved } })
    })
    const editor = new TypeEditor(page)
    await editor.edit()
    await editor.expand('Quantity')
    await editor.fieldRole.selectOption('')
    await editor.save.click()
    await editor.apply.click()
    await expect(editor.dialog).not.toBeVisible()
    expect(saved?.schema[0].role).toBeNull()
    expect(schemaRoleKey(saved?.schema ?? [], 'quantity')).toBeUndefined()
    expect(schemaRoleKey([{ key: 'quantity', label: 'Quantity', type: 'number' }], 'quantity')).toBe('quantity')
})

test('failed schema impact checks preserve edits and do not write the type', async ({ page }) => {
    await mock(page, { global: true, types: [{ ...type, schema: [{ key: 'inspection', label: 'Inspection date', type: 'date' }] }] })
    let saves = 0
    await page.route(`**/api/assets/types/${type.id}/schema_impact/`, route => route.fulfill({ status: 503, json: { detail: 'Impact check temporarily unavailable.' } }))
    await page.route(`**/api/assets/types/${type.id}/`, async route => { saves += 1; await route.fulfill({ json: type }) })
    const editor = new TypeEditor(page)
    await editor.edit()
    await editor.expand('Inspection date')
    await editor.fieldName.fill('Inspection updated')
    await editor.save.click()
    await expect(editor.dialog.getByRole('alert')).toHaveText('Impact check temporarily unavailable.')
    await expect(editor.fieldName).toHaveValue('Inspection updated')
    await expect(editor.apply).not.toBeVisible()
    expect(saves).toBe(0)
})

test('an inventory-only code stays visible in list and equipment details', async ({ page }) => {
    await mock(page, { assets: [record('ENV001')] })
    await page.goto('/assets?asset_type=dynamic-test-type&needs_update=true')
    await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click()
    await page.getByRole('button', { name: `Open ${type.name} equipment`, exact: true }).click()
    await page.getByRole('button', { name: 'ENV001', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('ENV001')
    await expect(dialog).toContainText('Shipyard inventory code')
    await expect(dialog).not.toContainText('example-ENV001')
})

test('a schema notification updates filters when opened from the existing inventory route', async ({ page }) => {
    const other: AssetType = { ...type, id: 'other-example-type', name: 'Other example equipment' }
    await mock(page, { types: [type, other], assets: [record('MISSING001', type.id, true), record('COMPLETE001'), record('OTHER001', other.id, true)] })
    await page.route(url => url.pathname === '/api/notifications/', route => route.fulfill({ json: { count: 1, next: null, previous: null, results: [{
        id: 9, uuid: 'example-schema-notification', message: 'Complete required information.', type: 'warning', created_at: '2026-10-14T09:00:00Z', read_at: '2026-10-14T09:00:00Z',
        content: { title: 'Equipment information changed', message: 'Complete required information.', url: `/assets?asset_type=${type.id}&needs_update=true` },
    }] } }))
    await page.goto('/assets')
    await page.getByRole('button', { name: `Open ${type.name} equipment`, exact: true }).click()
    await expect(page.getByRole('button', { name: 'COMPLETE001', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Notifications', exact: true }).click()
    await page.getByRole('region', { name: 'Notifications', exact: true }).getByRole('button', { name: /Equipment information changed/ }).click()
    await expect(page).toHaveURL(/\/assets\?asset_type=dynamic-test-type&needs_update=true$/)
    await expect(page.getByRole('button', { name: 'MISSING001', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'COMPLETE001', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'OTHER001', exact: true })).not.toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Equipment type', exact: true })).toHaveValue(type.id)
})

test('a platform role string does not grant global catalog or shipyard controls', async ({ page }) => {
    await mock(page, { roleOnly: true, assets: [record('ENV001')] })
    await page.goto('/assets/types')
    await expect(page.getByRole('button', { name: 'Add type', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Import catalog', exact: true })).not.toBeVisible()
    await page.goto('/assets')
    await expect(page.getByRole('combobox', { name: 'Shipyard', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Type and inventory workbook', exact: true })).not.toBeVisible()
})

const workbookFile = { name: 'example-workbook.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fictional mocked workbook') }
const preview = (overrides: Partial<WorkbookPreview> = {}): WorkbookPreview => ({
    summary: { types_created: 1, types_updated: 0, assets_created: 0, assets_updated: 0, skipped_rows_count: 0 },
    preview_token: 'example-preview', can_commit: true, action_required: [], errors: [], notices: [],
    rows: [{ sheet: 'Equipment types', row: 2, kind: 'type', operation: 'create', catalog_code: 'EXAMPLE-CATALOG-01', name: 'Example crane', errors: [] }],
    ...overrides,
})

async function openWorkbook(page: Page) {
    await page.goto('/assets/types')
    await page.getByRole('button', { name: 'Import catalog', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Type and inventory import', exact: true })
    await dialog.getByLabel('Excel workbook', { exact: true }).setInputFiles(workbookFile)
    return dialog
}

test('uncertain B/C classifications require a fresh reviewed decision before atomic import', async ({ page }) => {
    await mock(page, { global: true })
    const previews: string[] = []
    const commits: string[] = []
    await page.route('**/api/assets/workbook/preview/', async route => {
        const body = route.request().postData() ?? ''
        previews.push(body)
        await route.fulfill({ json: previews.length === 1 ? preview({ can_commit: false, preview_token: null,
            action_required: [{ code: 'ambiguous_classification', sheet: '1-TAKSONOMI', row: 40, message: 'Choose B or C for this equipment.', choices: ['B', 'C'] }],
        }) : preview({ preview_token: 'example-reviewed-choice' }) })
    })
    await page.route('**/api/assets/workbook/commit/', async route => {
        commits.push(route.request().postData() ?? '')
        await route.fulfill({ json: { summary: preview().summary, detail: 'Imported.' } })
    })
    const dialog = await openWorkbook(page)
    await dialog.getByRole('button', { name: 'Review workbook', exact: true }).click()
    await expect(dialog.getByText('Choose B or C for this equipment.', { exact: false })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Import reviewed records', exact: true })).not.toBeVisible()
    await dialog.getByRole('combobox', { name: 'Preliminary sharing class', exact: true }).selectOption('B')
    await expect(dialog.getByText('Decisions changed. Review the workbook again.', { exact: true })).toBeVisible()
    expect(commits).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Review workbook', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Import reviewed records', exact: true })).toBeEnabled()
    expect(previews).toHaveLength(2)
    expect(previews[1]).toContain('"1-TAKSONOMI:40":"B"')
    await dialog.getByRole('button', { name: 'Import reviewed records', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Import completed')
    expect(commits).toHaveLength(1)
    expect(commits[0]).toContain('example-reviewed-choice')
    expect(commits[0]).toContain('"1-TAKSONOMI:40":"B"')
    await expect(dialog).toContainText('Inventory records remain private. Publish them separately for shared use.')
})

test('a stale workbook commit returns to review and does not claim success', async ({ page }) => {
    await mock(page, { global: true })
    let commits = 0
    await page.route('**/api/assets/workbook/preview/', route => route.fulfill({ json: preview() }))
    await page.route('**/api/assets/workbook/commit/', async route => {
        commits += 1
        await route.fulfill({ status: 409, json: { detail: 'Catalog changed since the preview. Review again.' } })
    })
    const dialog = await openWorkbook(page)
    await dialog.getByRole('button', { name: 'Review workbook', exact: true }).click()
    await dialog.getByRole('button', { name: 'Import reviewed records', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Catalog changed since the preview. Review again.')
    await expect(dialog.getByRole('button', { name: 'Review workbook', exact: true })).toBeEnabled()
    await expect(dialog.getByRole('button', { name: 'Import reviewed records', exact: true })).not.toBeVisible()
    await expect(dialog.getByText('Import completed', { exact: true })).not.toBeVisible()
    expect(commits).toBe(1)
})

test('workbook preview paginates 24 records and stays inside a 320px viewport', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 844 })
    await mock(page, { global: true })
    await page.route('**/api/assets/workbook/preview/', route => route.fulfill({ json: preview({ rows: Array.from({ length: 25 }, (_, index) => ({
        sheet: 'Equipment types', row: index + 2, kind: 'type', operation: 'create',
        catalog_code: `EXAMPLE-CATALOG-${index + 1}`, name: `Example portable workshop equipment ${index + 1}`, errors: [],
    })), summary: { ...preview().summary, types_created: 25, skipped_rows_count: 4 } }) }))
    const dialog = await openWorkbook(page)
    await dialog.getByRole('button', { name: 'Review workbook', exact: true }).click()
    await expect(dialog.locator('tbody tr')).toHaveCount(24)
    await expect(dialog.getByRole('status')).toContainText('4 total, heading or blank rows skipped.')
    await dialog.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(dialog.locator('tbody tr')).toHaveCount(1)
    await expect(dialog.getByText('Example portable workshop equipment 25', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Example portable workshop equipment 1', { exact: true })).not.toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('workbook-mobile-preview.png'), fullPage: true })
})
