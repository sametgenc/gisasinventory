import { expect, test, type Page, type Route } from '@playwright/test'
import type { ImportPreview, AssetType } from '../src/modules/assets/types'

const stockType: AssetType = {
    id: 'example-stock', name: 'Example scaffold stock', description: '', tracking_mode: 'stock',
    schema: [
        { key: 'material_code', label: 'Material code', type: 'text', required: true, is_unique_key: true },
        { key: 'material_name', label: 'Material name', type: 'text', required: true },
        { key: 'quantity', label: 'Stock quantity', type: 'number', required: true },
    ], created_at: '', updated_at: '', created_by: null,
}
const otherType = { ...stockType, id: 'example-other', name: 'Example workshop stock' }
const mapping = { Code: 'material_code', Name: 'material_name', Quantity: 'quantity', Yard: null }
const basePreview: ImportPreview = {
    headers: Object.keys(mapping), preview_rows: [['DEMO-01', 'Example platform', '50', 'Example source yard'], ['DEMO-02', 'Example barrier', '25', 'Example source yard'], ['DEMO-03', 'Example zero stock', '0', 'Example source yard']],
    preview_row_numbers: [5, 6, 9], total_rows: 3,
    analysis: {
        version: 1, sheet_name: 'Stock', sheet_names: ['Notes', 'Stock'], header_row: 4, data_start_row: 5,
        layout_confidence: 'high', suggested_asset_type_id: stockType.id, analysis_asset_type_id: stockType.id,
        analysis_mapping: mapping, suggested_mapping: mapping,
        type_suggestions: [{ asset_type_id: stockType.id, asset_type_name: stockType.name, confidence: 'high', mapping, matched_fields: 3 }],
        counts: { data: 3, skipped: 3, review: 0, ready: 3 }, blockers: [], warnings: [{ code: 'unmatched_columns', headers: ['Yard'] }],
        skipped_rows: [{ row_number: 7, reason: 'total', label: 'Grand total' }, { row_number: 8, reason: 'repeated_header' }, { row_number: 10, reason: 'blank' }],
        review_rows: [], review_row_numbers: [],
    },
}
function preview(overrides: Partial<NonNullable<ImportPreview['analysis']>> = {}): ImportPreview {
    return structuredClone({ ...basePreview, analysis: { ...basePreview.analysis!, ...overrides } })
}
function part(body: string, key: string): string | undefined {
    return body.match(new RegExp(`name="${key}"\\r\\n\\r\\n([^\\r]+)`))?.[1]
}
async function session(page: Page, respond: (route: Route, requestNumber: number) => Promise<void>, types = [stockType, otherType]) {
    const previews: string[] = []
    const imports: string[] = []
    await page.addInitScript(() => { localStorage.setItem('language', 'en'); localStorage.setItem('vite-ui-theme', 'light') })
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? {
        account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
    } : { user: { id: '1', username: 'example', email: 'example@example.test', role: 'tenant_admin', tenant_slug: 'example-yard', tenant_name: 'Example Yard' }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (path.endsWith('/preview_import/')) { previews.push(route.request().postData() ?? ''); return respond(route, previews.length) }
        if (path.endsWith('/raw_import/') || path.endsWith('/bulk_import/')) {
            imports.push(route.request().postData() ?? '')
            return route.fulfill({ json: { created_count: 3, updated_count: 0, skipped_count: 3, error_count: 0, errors: [], message: 'Example import complete' } })
        }
        let data: unknown = []
        if (path === '/api/assets/types/') data = types
        if (path === '/api/tenants/') data = [{ id: 1, name: 'Example Yard' }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Import from Excel', exact: true }).click()
    return { dialog: page.getByRole('dialog', { name: 'Bulk Asset Import' }), previews, imports }
}
async function chooseFile(dialog: ReturnType<Page['getByRole']>, name = 'example-stock.xlsx') {
    await dialog.getByLabel('Equipment Excel file').setInputFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fictional mocked workbook') })
}

test('automatic proposal detects row four, reports totals and preserves zero stock and Excel row numbers', async ({ page }) => {
    const { dialog, previews, imports } = await session(page, route => route.fulfill({ json: preview() }))
    await chooseFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    await expect(dialog.getByText('We reviewed your file', { exact: true })).toBeVisible()
    await expect(dialog).toContainText('Worksheet: Stock · Header row: 4')
    await expect(dialog.getByRole('combobox', { name: 'Equipment type', exact: true })).toHaveValue(stockType.id)
    expect(part(previews[0], 'header_row')).toBeUndefined()
    expect(part(previews[0], 'skip_rows')).toBeUndefined()
    await expect(dialog).toContainText('Unmatched columns are not imported')
    await expect(dialog.getByRole('combobox', { name: 'Map column Yard', exact: true })).toHaveValue('')
    await dialog.getByText('Why 3 rows were skipped', { exact: true }).click()
    await expect(dialog).toContainText('Excel row 7 · Total or subtotal · Grand total')
    await expect(dialog).toContainText('Excel row 8 · Repeated column headings')
    await expect(dialog.getByRole('row').filter({ hasText: 'DEMO-03' })).toContainText('9')
    await expect(dialog.getByRole('row').filter({ hasText: 'DEMO-03' })).toContainText('0')
    await dialog.getByRole('button', { name: 'Import 3 ready records' }).click()
    await expect(dialog).toContainText('Example import complete')
    expect(part(imports[0], 'header_row')).toBe('4')
    expect(part(imports[0], 'sheet_name')).toBe('Stock')
    expect(part(imports[0], 'require_review')).toBe('true')
    expect(part(imports[0], 'mapping')).toContain('"Yard":null')
    expect(part(imports[0], 'tenant')).toBeUndefined()
})

test('equal type candidates require manual choice and a fresh preview before any write', async ({ page }) => {
    const ambiguous = preview({ suggested_asset_type_id: null, analysis_asset_type_id: null, analysis_mapping: {}, blockers: [{ code: 'asset_type_selection_required' }], counts: { data: 3, skipped: 3, review: 0, ready: 0 },
        type_suggestions: [stockType, otherType].map(type => ({ asset_type_id: type.id, asset_type_name: type.name, confidence: 'review', mapping, matched_fields: 3 })) })
    const { dialog, previews, imports } = await session(page, (route, count) => route.fulfill({ json: count === 1 ? ambiguous : preview() }))
    await chooseFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    const type = dialog.getByRole('combobox', { name: 'Equipment type', exact: true })
    await expect(type).toHaveValue('')
    await expect(dialog).toContainText('Choose the equipment type; several types may match.')
    await expect(dialog.getByRole('button', { name: 'Import 0 ready records' })).toBeDisabled()
    await type.selectOption(stockType.id)
    await dialog.getByRole('button', { name: 'Recheck file', exact: true }).last().click()
    expect(imports).toHaveLength(0)
    expect(previews).toHaveLength(2)
    expect(part(previews[1], 'asset_type')).toBe(stockType.id)
    await expect(dialog.getByRole('button', { name: 'Import 3 ready records' })).toBeEnabled()
})

test('missing required columns and duplicate targets explain why import is blocked', async ({ page }) => {
    const conflictMap = { ...mapping, Quantity: 'material_name' }
    const { dialog, imports } = await session(page, route => route.fulfill({ json: preview({ analysis_mapping: conflictMap, suggested_mapping: conflictMap, blockers: [{ code: 'ambiguous_mapping', fields: ['material_name'] }, { code: 'missing_required_mapping', fields: ['quantity'] }] }) }))
    await chooseFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    await expect(dialog).toContainText('More than one column points to the same field: Material name')
    await expect(dialog).toContainText('Map the required fields before importing: Stock quantity')
    await expect(dialog.getByRole('button', { name: 'Import 3 ready records' })).toBeDisabled()
    expect(imports).toHaveLength(0)
    await dialog.getByRole('combobox', { name: 'Map column Quantity', exact: true }).selectOption('quantity')
    await expect(dialog.getByRole('combobox', { name: 'Map column Name', exact: true }).getByRole('option', { name: 'Stock quantity', exact: true })).toBeDisabled()
    await expect(dialog).toContainText('Settings changed. Recheck the file before importing')
})

test('formula and duplicate rows require explicit exclusion; edits clear consent and recheck before writes', async ({ page }) => {
    const needsReview = preview({ counts: { data: 5, skipped: 3, review: 2, ready: 3 }, warnings: [{ code: 'formula_review_required' }, { code: 'duplicate_identifier' }],
        review_rows: [{ row_number: 11, reason: 'formula', fields: ['quantity'] }, { row_number: 12, reason: 'duplicate_identifier', fields: ['material_code'] }], review_row_numbers: [11, 12] })
    const { dialog, imports, previews } = await session(page, route => route.fulfill({ json: needsReview }))
    await chooseFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    await expect(dialog).toContainText('Excel row 11 · Formula needs review · Stock quantity')
    await expect(dialog).toContainText('Excel row 12 · Repeated equipment identifier · Material code')
    const consent = dialog.getByRole('checkbox', { name: 'Exclude all 2 rows needing review and import the ready records' })
    await expect(dialog.getByRole('button', { name: 'Import 3 ready records' })).toBeDisabled()
    await consent.check()
    await expect(dialog).toContainText('5 rows excluded')
    await expect(dialog.getByRole('button', { name: 'Import 3 ready records' })).toBeEnabled()
    await dialog.getByRole('combobox', { name: 'Map column Yard', exact: true }).selectOption('')
    await expect(consent).not.toBeChecked()
    await expect(consent).toBeDisabled()
    await dialog.getByRole('button', { name: 'Recheck file', exact: true }).last().click()
    expect(previews).toHaveLength(2)
    expect(imports).toHaveLength(0)
    await consent.check()
    await dialog.getByRole('button', { name: 'Import 3 ready records' }).click()
    await expect(dialog).toContainText('Example import complete')
    expect(part(imports[0], 'exclude_row_numbers')).toBe('[11,12]')
})

test('ambiguous file layout needs deliberate worksheet and header confirmation', async ({ page }) => {
    const uncertain = preview({ layout_confidence: 'review', blockers: [{ code: 'sheet_selection_required' }, { code: 'header_selection_required' }] })
    const { dialog, previews, imports } = await session(page, (route, count) => route.fulfill({ json: count === 1 ? uncertain : preview() }))
    await chooseFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    await expect(dialog.getByRole('button', { name: 'Import 3 ready records' })).toBeDisabled()
    await dialog.locator('summary').filter({ hasText: 'File layout' }).click()
    await dialog.getByRole('combobox', { name: 'Worksheet', exact: true }).selectOption('Stock')
    await dialog.getByRole('spinbutton', { name: 'Header row', exact: true }).fill('4')
    await dialog.getByRole('button', { name: 'Use this worksheet and header row', exact: true }).click()
    await dialog.getByRole('button', { name: 'Recheck file', exact: true }).last().click()
    expect(part(previews[1], 'sheet_name')).toBe('Stock')
    expect(part(previews[1], 'header_row')).toBe('4')
    expect(imports).toHaveLength(0)
    await expect(dialog.getByRole('button', { name: 'Import 3 ready records' })).toBeEnabled()
})

test('analysis requests lock controls; replacing a file removes old type, mapping, layout and exclusions', async ({ page }) => {
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    const { dialog, previews, imports } = await session(page, async (route, count) => {
        if (count === 1) await wait
        await route.fulfill({ json: count === 1 ? preview() : preview({ suggested_asset_type_id: null, analysis_asset_type_id: null, analysis_mapping: {}, type_suggestions: [], blockers: [{ code: 'asset_type_selection_required' }], counts: { data: 3, skipped: 3, review: 0, ready: 0 } }) })
    })
    await chooseFile(dialog, 'first-example.xlsx')
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    await expect(dialog.getByLabel('Equipment Excel file')).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0)
    release()
    await expect(dialog.getByRole('button', { name: 'Import 3 ready records' })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Back', exact: true }).click()
    await dialog.locator('summary').click()
    await dialog.getByRole('spinbutton', { name: 'Header row', exact: true }).fill('7')
    await dialog.getByRole('textbox', { name: 'Skip rows', exact: true }).fill('OLD-FOOTER')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await chooseFile(dialog, 'second-example.xlsx')
    await expect(dialog.getByRole('spinbutton', { name: 'Header row', exact: true })).toHaveValue('1')
    await expect(dialog).not.toContainText('OLD-FOOTER')
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    await expect(dialog.getByRole('combobox', { name: 'Equipment type', exact: true })).toHaveValue('')
    expect(part(previews[1], 'asset_type')).toBeUndefined()
    expect(part(previews[1], 'mapping')).toBeUndefined()
    expect(part(previews[1], 'header_row')).toBeUndefined()
    expect(part(previews[1], 'skip_rows')).toBeUndefined()
    expect(imports).toHaveLength(0)
})

test('template import receives the analyzed sheet and explicit review exclusions', async ({ page }) => {
    const template = { ...preview({ counts: { data: 4, skipped: 3, review: 1, ready: 3 }, review_rows: [{ row_number: 11, reason: 'formula' }], review_row_numbers: [11] }), detected_template: { asset_type_id: stockType.id, asset_type_name: stockType.name } }
    const { dialog, imports } = await session(page, route => route.fulfill({ json: template }))
    await chooseFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    await expect(dialog).toContainText('Template detected')
    await expect(dialog.getByRole('button', { name: 'Import 3 ready records' })).toBeDisabled()
    await dialog.getByRole('checkbox', { name: 'Exclude all 1 rows needing review and import the ready records' }).check()
    await dialog.getByRole('button', { name: 'Import 3 ready records' }).click()
    await expect(dialog).toContainText('Example import complete')
    expect(part(imports[0], 'sheet_name')).toBe('Stock')
    expect(part(imports[0], 'exclude_row_numbers')).toBe('[11]')
    expect(part(imports[0], 'require_review')).toBe('true')
})

test('320px analysis remains readable and layout controls work from keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    const { dialog } = await session(page, route => route.fulfill({ json: preview() }))
    await chooseFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    await expect(dialog.getByText('We reviewed your file', { exact: true })).toBeVisible()
    const layout = dialog.locator('summary').filter({ hasText: 'File layout' })
    await layout.focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('spinbutton', { name: 'Header row', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(dialog.getByRole('combobox', { name: 'Map column Quantity', exact: true })).toHaveValue('quantity')
})

test('changing worksheets discards old column overrides and analyzes the new headings', async ({ page }) => {
    const newMapping = { 'New code': 'material_code', 'New name': 'material_name', 'New quantity': 'quantity' }
    const secondSheet = { ...preview({ sheet_name: 'Other stock', sheet_names: ['Stock', 'Other stock'], analysis_mapping: newMapping, suggested_mapping: newMapping, warnings: [] }), headers: Object.keys(newMapping), preview_rows: [['DEMO-NEW', 'Example new material', '0']], preview_row_numbers: [2], total_rows: 1 }
    const { dialog, previews, imports } = await session(page, (route, count) => route.fulfill({ json: count === 1 ? { ...preview(), analysis: { ...preview().analysis!, sheet_names: ['Stock', 'Other stock'] } } : secondSheet }))
    await chooseFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    await dialog.getByRole('combobox', { name: 'Map column Yard', exact: true }).selectOption('')
    await dialog.locator('summary').filter({ hasText: 'File layout' }).click()
    await dialog.getByRole('combobox', { name: 'Worksheet', exact: true }).selectOption('Other stock')
    await dialog.getByRole('button', { name: 'Recheck file', exact: true }).last().click()
    expect(part(previews[1], 'sheet_name')).toBe('Other stock')
    expect(part(previews[1], 'mapping')).toBeUndefined()
    expect(imports).toHaveLength(0)
    await expect(dialog.getByRole('combobox', { name: 'Map column New code', exact: true })).toHaveValue('material_code')
    await expect(dialog.getByRole('combobox', { name: 'Map column Yard', exact: true })).toHaveCount(0)
})

test('template keeps confirmed header, data start, column plan and custom skip rules; result includes skipped count', async ({ page }) => {
    const template = (headerRow: number) => ({ ...preview({ header_row: headerRow, data_start_row: 4 }), detected_template: { asset_type_id: stockType.id, asset_type_name: stockType.name } })
    const { dialog, previews, imports } = await session(page, (route, count) => route.fulfill({ json: template(count === 1 ? 1 : 2) }))
    await chooseFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue' }).click()
    await dialog.locator('summary').filter({ hasText: 'File layout' }).click()
    await dialog.getByRole('spinbutton', { name: 'Header row', exact: true }).fill('2')
    await dialog.getByRole('textbox', { name: 'Skip rows', exact: true }).fill('EXAMPLE-FOOTER')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await dialog.getByRole('button', { name: 'Recheck file', exact: true }).last().click()
    expect(imports).toHaveLength(0)
    expect(part(previews[1], 'header_row')).toBe('2')
    expect(part(previews[1], 'skip_rows')).toBe('["EXAMPLE-FOOTER"]')
    await dialog.getByRole('button', { name: 'Import 3 ready records' }).click()
    await expect(dialog).toContainText('Example import complete')
    expect(part(imports[0], 'header_row')).toBe('2')
    expect(part(imports[0], 'data_start_row')).toBe('4')
    expect(part(imports[0], 'skip_rows')).toBe('["EXAMPLE-FOOTER"]')
    expect(JSON.parse(part(imports[0], 'mapping')!)).toEqual(mapping)
    expect(part(imports[0], 'sheet_name')).toBe('Stock')
    await expect(dialog.getByText('Skipped', { exact: true }).locator('..')).toContainText('3')
})
