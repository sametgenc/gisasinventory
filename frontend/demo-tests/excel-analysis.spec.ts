import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ImportPreview } from '../src/modules/assets/types'

const sample = (name: string) => path.resolve('..', 'var', 'demo', 'samples', name)
const automaticFile = sample('Otomatik_aktarim_ornegi.xlsx')
const reviewFile = sample('Kontrol_gereken_aktarim_ornegi.xlsx')

interface DemoAsset {
    id: string
    asset_type: string
    updated_at: string
    custom_data: { material_code?: string; material_name?: string; quantity?: number }
}

// These real-server tests touch only a temporary fictional type. Avoid captures
// because the isolated demo can also contain inventories supplied by the user.
test.use({ screenshot: 'off', trace: 'off' })

async function login(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('vite-ui-theme', 'light')
    })
    await page.goto('/login')
    await page.locator('#login-email').fill('admin@demo.gisas.test')
    await page.locator('#login-password').fill('GisasDemo!2026')
    await page.locator('button[type=submit]').click()
    await expect(page).toHaveURL(/\/dashboard$/)
}

async function csrf(page: Page) {
    const cookies = await page.context().cookies()
    return {
        'X-CSRFToken': cookies.find(cookie => cookie.name === 'csrftoken')?.value ?? '',
        Referer: 'http://127.0.0.1:5190/',
    }
}

async function assets(page: Page): Promise<DemoAsset[]> {
    const response = await page.request.get('/api/assets/items/')
    expect(response.ok()).toBeTruthy()
    return response.json()
}

function snapshot(records: DemoAsset[], temporaryTypeId: string) {
    return records.filter(record => record.asset_type !== temporaryTypeId)
        .map(record => ({ id: record.id, updated_at: record.updated_at }))
        .sort((left, right) => left.id.localeCompare(right.id))
}

async function createTemporaryType(page: Page) {
    const response = await page.request.post('/api/assets/types/', {
        headers: await csrf(page),
        data: { name: `Fictional Excel acceptance stock ${Date.now()}`, tracking_mode: 'stock' },
    })
    expect(response.status()).toBe(201)
    return (await response.json()).id as string
}

async function cleanupTemporaryType(page: Page, typeId: string) {
    for (const record of (await assets(page)).filter(record => record.asset_type === typeId)) {
        const deleted = await page.request.delete(`/api/assets/items/${record.id}/`, { headers: await csrf(page) })
        expect(deleted.status()).toBe(204)
    }
    const deleted = await page.request.delete(`/api/assets/types/${typeId}/`, { headers: await csrf(page) })
    expect(deleted.status()).toBe(204)
}

async function selectShipyard(page: Page): Promise<string> {
    const response = await page.request.get('/api/tenants/')
    expect(response.ok()).toBeTruthy()
    const yards: { id: number; name: string }[] = await response.json()
    const yard = yards.find(item => item.name === 'Mavi Körfez Demo Tersanesi')
    expect(yard, 'The fictional demo shipyard must exist').toBeDefined()
    return String(yard!.id)
}

async function previewFromWizard(page: Page, dialog: Locator, buttonName: string): Promise<ImportPreview> {
    const response = page.waitForResponse(item => new URL(item.url()).pathname === '/api/assets/items/preview_import/' && item.request().method() === 'POST')
    await dialog.getByRole('button', { name: buttonName, exact: true }).last().click()
    const result = await response
    expect(result.ok()).toBeTruthy()
    const preview: ImportPreview = await result.json()
    expect(preview.analysis, 'The running demo backend must load the current inventory analyzer').toBeDefined()
    await expect(dialog.getByText('We reviewed your file', { exact: true })).toBeVisible()
    return preview
}

async function analyzeFile(page: Page, filename: string, typeId: string, tenantId: string) {
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Import from Excel', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Bulk Asset Import' })
    await dialog.getByRole('combobox', { name: 'Shipyard', exact: true }).selectOption(tenantId)
    await dialog.getByLabel('Equipment Excel file').setInputFiles(filename)
    let preview = await previewFromWizard(page, dialog, 'Preview & continue')
    expect(preview.analysis).toMatchObject({ sheet_name: 'Stok', header_row: 4, layout_confidence: 'high' })
    await expect(dialog).toContainText('Worksheet: Stok · Header row: 4')
    const type = dialog.getByRole('combobox', { name: 'Equipment type', exact: true })
    if (await type.inputValue() !== typeId) {
        await type.selectOption(typeId)
        preview = await previewFromWizard(page, dialog, 'Recheck file')
    }
    expect(preview.analysis?.analysis_asset_type_id).toBe(typeId)
    return { dialog, preview }
}

async function strictImport(page: Page, filename: string, typeId: string, tenantId: string, preview: ImportPreview) {
    const analysis = preview.analysis!
    return page.request.post('/api/assets/items/raw_import/', {
        headers: await csrf(page),
        multipart: {
            file: {
                name: path.basename(filename),
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                buffer: await readFile(filename),
            },
            asset_type: typeId, tenant: tenantId, require_review: 'true',
            sheet_name: analysis.sheet_name, header_row: String(analysis.header_row),
            data_start_row: String(analysis.data_start_row),
            mapping: JSON.stringify(analysis.analysis_mapping),
        },
    })
}

test.beforeAll(async ({ request }) => {
    const response = await request.get('/demo/health/')
    expect(response.ok(), 'Start the isolated demo with bash scripts/start-demo.sh').toBeTruthy()
    expect(await response.json()).toMatchObject({ demo: true, status: 'ready' })
})

test('real Excel wizard proposes layout, skips aggregates and reimports stock without adding quantities', async ({ page }) => {
    test.skip(!existsSync(automaticFile), 'Local fictional Excel sample is not installed on this host')
    await login(page)
    const typeId = await createTemporaryType(page)
    try {
        const before = snapshot(await assets(page), typeId)
        const tenantId = await selectShipyard(page)
        const { dialog, preview } = await analyzeFile(page, automaticFile, typeId, tenantId)
        expect(preview.analysis?.counts).toEqual({ data: 3, skipped: 4, review: 0, ready: 3 })
        expect(preview.analysis?.blockers).toEqual([])
        await dialog.getByText('Why 4 rows were skipped', { exact: true }).click()
        await expect(dialog).toContainText('Excel row 7 · Total or subtotal')
        await expect(dialog).toContainText('Excel row 8 · Repeated column headings')
        await expect(dialog).toContainText('Excel row 11 · Total or subtotal')
        await expect(dialog.getByRole('row').filter({ hasText: 'ORNEK-PARSE-02' })).toContainText('0')
        await expect(dialog.getByRole('row').filter({ hasText: 'ORNEK-PARSE-03' })).toContainText('Toplam ölçüm aparatı')

        const imported = page.waitForResponse(item => new URL(item.url()).pathname === '/api/assets/items/raw_import/' && item.request().method() === 'POST')
        await dialog.getByRole('button', { name: 'Import 3 ready records', exact: true }).click()
        const first = await imported
        expect(first.ok()).toBeTruthy()
        expect(await first.json()).toMatchObject({ created_count: 3, updated_count: 0, skipped_count: 4, error_count: 0 })
        await expect(dialog.getByRole('button', { name: 'New import', exact: true })).toBeVisible()

        const second = await strictImport(page, automaticFile, typeId, tenantId, preview)
        expect(second.ok()).toBeTruthy()
        expect(await second.json()).toMatchObject({ created_count: 0, updated_count: 3, skipped_count: 4, error_count: 0 })
        const after = await assets(page)
        const importedStock = after.filter(record => record.asset_type === typeId)
        expect(importedStock).toHaveLength(3)
        expect(importedStock.reduce((sum, record) => sum + Number(record.custom_data.quantity), 0)).toBe(750)
        expect(importedStock.find(record => record.custom_data.material_code === 'ORNEK-PARSE-02')?.custom_data.quantity).toBe(0)
        expect(importedStock.find(record => record.custom_data.material_code === 'ORNEK-PARSE-03')?.custom_data.material_name).toBe('Toplam ölçüm aparatı')
        expect(snapshot(after, typeId)).toEqual(before)
    } finally {
        await cleanupTemporaryType(page, typeId)
    }
})

test('real Excel review blocks duplicates and invalid quantities before any write until deliberate exclusion', async ({ page }) => {
    test.skip(!existsSync(reviewFile), 'Local fictional Excel sample is not installed on this host')
    await login(page)
    const typeId = await createTemporaryType(page)
    try {
        const before = snapshot(await assets(page), typeId)
        const tenantId = await selectShipyard(page)
        const { dialog, preview } = await analyzeFile(page, reviewFile, typeId, tenantId)
        expect(preview.analysis?.counts).toEqual({ data: 6, skipped: 4, review: 4, ready: 2 })
        expect(preview.analysis?.review_row_numbers).toEqual([5, 12, 13, 14])
        await expect(dialog).toContainText('Excel row 5 · Repeated equipment identifier')
        await expect(dialog).toContainText('Excel row 12 · Repeated equipment identifier')
        await expect(dialog).toContainText('Excel row 13 · Invalid value')
        await expect(dialog).toContainText('Excel row 14 · Required value missing')
        const importButton = dialog.getByRole('button', { name: 'Import 2 ready records', exact: true })
        await expect(importButton).toBeDisabled()

        const blocked = await strictImport(page, reviewFile, typeId, tenantId, preview)
        expect(blocked.status()).toBe(400)
        expect((await blocked.json()).analysis.review_row_numbers).toEqual([5, 12, 13, 14])
        const after = await assets(page)
        expect(after.filter(record => record.asset_type === typeId)).toHaveLength(0)
        expect(snapshot(after, typeId)).toEqual(before)

        await dialog.getByRole('checkbox', { name: 'Exclude all 4 rows needing review and import the ready records', exact: true }).check()
        await expect(importButton).toBeEnabled()
        // Explicit exclusion enables import; this case remains read-only.
    } finally {
        await cleanupTemporaryType(page, typeId)
    }
})
