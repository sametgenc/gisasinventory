import { expect, test, type Page } from '@playwright/test'
import type { AssetType, ImportPreview } from '../src/modules/assets/types'

const assetType: AssetType = {
    id: 'draft-stock', name: 'Example stock', description: '', tracking_mode: 'stock', created_at: '', updated_at: '', created_by: null,
    schema: [
        { key: 'code', label: 'Material code', type: 'text', required: true, role: 'identifier' },
        { key: 'quantity', label: 'Quantity', type: 'number', required: true, role: 'quantity' },
        { key: 'note', label: 'Note', type: 'text' },
    ],
}

async function openImport(page: Page) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    let previews = 0
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: {
        status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config')
            ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } }
            : { user: { id: '1', username: 'example', email: 'example@example.test', role: 'tenant_admin', tenant_slug: 'example', tenant_name: 'Example yard' }, methods: [] },
    } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (path.endsWith('/preview_import/')) {
            const mapping = { Code: 'code', Quantity: 'quantity', Note: ++previews > 1 ? null : 'note' }
            const preview: ImportPreview = {
                headers: ['Code', 'Quantity', 'Note'], preview_rows: [['EX-1', '4', 'Example'], ['EX-2', '', 'Needs review']], total_rows: 2,
                analysis: {
                    version: 1, sheet_name: 'Stock', sheet_names: ['Stock'], header_row: 1, data_start_row: 2, layout_confidence: 'high',
                    suggested_asset_type_id: assetType.id, analysis_asset_type_id: assetType.id, analysis_mapping: mapping, suggested_mapping: mapping,
                    type_suggestions: [{ asset_type_id: assetType.id, asset_type_name: assetType.name, confidence: 'high', mapping, matched_fields: 2 }],
                    counts: { data: 2, skipped: 0, review: 1, ready: 1 }, blockers: [], warnings: [], skipped_rows: [],
                    review_rows: [{ row_number: 3, reason: 'missing_required', fields: ['quantity'] }], review_row_numbers: [3],
                },
            }
            return route.fulfill({ json: preview })
        }
        let data: unknown = []
        if (path === '/api/assets/types/') data = [assetType]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Import from Excel', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Bulk Asset Import', exact: true })
    await expect(dialog).toBeVisible()
    return dialog
}

async function selectFile(dialog: ReturnType<Page['getByRole']>) {
    await dialog.getByLabel('Equipment Excel file').setInputFiles({ name: 'my-stock.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('synthetic inventory') })
}

test('single-type import preserves selected file and unfinished skip rule after cancel', async ({ page }) => {
    const dialog = await openImport(page)
    await selectFile(dialog)
    await dialog.locator('summary').filter({ hasText: 'File layout' }).click()
    await dialog.getByRole('textbox', { name: 'Skip rows', exact: true }).fill('KEEP THIS RULE')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByText('my-stock.xlsx', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Skip rows', exact: true })).toHaveValue('KEEP THIS RULE')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await page.getByRole('button', { name: 'Import from Excel', exact: true }).click()
    await expect(dialog.getByText('my-stock.xlsx', { exact: true })).not.toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('single-type import preserves mapping and excluded review rows through close confirmation', async ({ page }) => {
    const dialog = await openImport(page)
    await selectFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'Map column Note', exact: true }).selectOption('')
    await dialog.getByRole('button', { name: 'Recheck file', exact: true }).last().click()
    const excluded = dialog.getByRole('checkbox', { name: 'Exclude all 1 rows needing review and import the ready records', exact: true })
    await excluded.check()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByRole('combobox', { name: 'Map column Note', exact: true })).toHaveValue('')
    await expect(excluded).toBeChecked()
})

test('single-type import guards catalog link before discarding file', async ({ page }) => {
    const dialog = await openImport(page)
    await selectFile(dialog)
    const link = dialog.getByRole('link', { name: 'Open equipment types', exact: true })
    await link.click()
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByText('my-stock.xlsx', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/assets$/)
    await link.click()
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(page).toHaveURL(/\/assets\/types$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('single-type import cannot close during commit and completed result closes normally', async ({ page }) => {
    const dialog = await openImport(page)
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve })
    await page.route('**/api/assets/items/raw_import/', async route => {
        await gate
        await route.fulfill({ json: { created_count: 1, updated_count: 0, skipped_count: 1, error_count: 0, errors: [], message: 'Import saved' } })
    })
    await selectFile(dialog)
    await dialog.getByRole('button', { name: 'Preview & continue', exact: true }).click()
    await dialog.getByRole('checkbox').check()
    await dialog.getByRole('button', { name: 'Import 1 ready records', exact: true }).click()
    await expect(dialog).toHaveAttribute('aria-busy', 'true')
    await page.keyboard.press('Escape')
    await page.mouse.click(2, 2)
    await expect(page.getByRole('dialog')).toHaveCount(1)
    finish()
    await expect(dialog.getByText('Import saved', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
})
