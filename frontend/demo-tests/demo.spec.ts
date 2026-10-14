import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'

const sample = (name: string) => path.resolve('..', 'var', 'demo', 'downloads', name)
// Local demo imports can contain private inventories; runtime captures stay outside the public docs.
const screenshot = (name: string) => path.resolve('..', 'var', 'demo', 'screenshots', name)

async function login(page: Page, email: string) {
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('vite-ui-theme', 'light')
    })
    await page.goto('/login')
    await page.locator('#login-email').fill(email)
    await page.locator('#login-password').fill('GisasDemo!2026')
    await page.locator('button[type=submit]').click()
    await expect(page).toHaveURL(/\/dashboard$/)
}

async function csrf(page: Page) {
    const cookies = await page.context().cookies()
    return { 'X-CSRFToken': cookies.find(cookie => cookie.name === 'csrftoken')?.value ?? '', Referer: 'http://127.0.0.1:5190/' }
}

test.beforeAll(async ({ request }) => {
    const response = await request.get('/demo/health/')
    expect(response.ok(), 'Start the isolated demo with bash scripts/start-demo.sh').toBeTruthy()
    expect(await response.json()).toMatchObject({ demo: true, status: 'ready' })
})

test('real sign-in shows populated dashboard and an accessible guide', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.goto('/help?task=inspect&step=0')
    await expect(page).toHaveURL(/\/login\?redirect=/)
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/help?task=inspect&step=0')
    await expect(page.locator('a[href^="/help"]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'User guide', exact: true })).not.toBeVisible()
    await login(page, 'admin@demo.gisas.test')
    await expect(page.getByRole('heading', { name: 'Your equipment in one place' })).toBeVisible()
    const equipment = await page.request.get('/api/assets/items/')
    expect(equipment.ok()).toBeTruthy()
    expect((await equipment.json()).length).toBeGreaterThanOrEqual(30)
    const types = await (await page.request.get('/api/assets/types/')).json()
    const welding = types.find((type: { name: string }) => type.name === 'MIG/MAG kaynak makinesi')
    expect((await page.request.get(`/api/assets/types/${welding.id}/export_template/`)).ok()).toBeTruthy()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: screenshot('demo-dashboard.png'), fullPage: true })
    await page.goto('/help')
    await expect(page.getByRole('heading', { name: 'User guide', exact: true })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search guide' }).fill('empty Description')
    await expect(page.locator('summary').filter({ hasText: 'What do empty cells do in a catalog update?' })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search guide' }).fill('')
    await page.screenshot({ path: screenshot('demo-guide.png'), fullPage: true })
})

test('real member session shows only its own shipyard and no admin user query', async ({ page }) => {
    const privilegedCalls: string[] = []
    page.on('request', request => { if (request.url().includes('/all-users/')) privilegedCalls.push(request.url()) })
    await login(page, 'personel@demo.gisas.test')
    const response = await page.request.get('/api/assets/items/')
    expect(response.ok()).toBeTruthy()
    const equipment = await response.json()
    expect(equipment.length).toBeGreaterThan(0)
    expect(equipment.every((item: { tenant_name: string }) => item.tenant_name === 'Mavi Körfez Demo Tersanesi')).toBeTruthy()
    expect(privilegedCalls).toEqual([])
    await page.goto('/assets/types')
    await expect(page.getByRole('button', { name: 'Import catalog', exact: true })).not.toBeVisible()
})

test('real catalog preview rejects bad rows and commits valid rows', async ({ page }) => {
    await login(page, 'admin@demo.gisas.test')
    const before = await (await page.request.get('/api/assets/types/')).json()
    const beforeIds = new Set(before.map((type: { id: string }) => type.id))
    await page.goto('/assets/types')
    await page.getByRole('button', { name: 'Import catalog', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Import equipment types from Excel' })
    await dialog.locator('input[type=file]').setInputFiles(sample('katalog-hatali.xlsx'))
    await dialog.getByRole('button', { name: 'Preview file', exact: true }).click()
    await expect(dialog.getByText('No records will be imported until all error rows are fixed.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /Import \d+ changes/ })).toBeDisabled()
    await dialog.locator('input[type=file]').setInputFiles(sample('katalog-gecerli.xlsx'))
    await dialog.getByRole('button', { name: 'Preview file', exact: true }).click()
    await expect(dialog.getByText('Pratik — Portatif vinç')).toBeVisible()
    await dialog.screenshot({ path: screenshot('demo-catalog-preview.png') })
    const button = dialog.getByRole('button', { name: /Import \d+ changes/ })
    if (await button.isEnabled()) {
        await button.click()
        await expect(dialog.getByRole('heading', { name: 'Catalog imported' })).toBeVisible()
    }
    // Remove only practice types created by this test; seeded types and user edits survive.
    const after = await (await page.request.get('/api/assets/types/')).json()
    for (const type of after) {
        if (!beforeIds.has(type.id) && String(type.catalog_code).startsWith('DEMO-PRACTICE-')) {
            const deleted = await page.request.delete(`/api/assets/types/${type.id}/`, { headers: await csrf(page) })
            expect(deleted.status()).toBe(204)
        }
    }
})

test('inventory template can be imported twice without duplicating equipment', async ({ page }) => {
    await login(page, 'yonetici@demo.gisas.test')
    const types = await (await page.request.get('/api/assets/types/')).json()
    const forklift = types.find((type: { catalog_code: string }) => type.catalog_code === 'DEMO-G-01')
    const before = await (await page.request.get('/api/assets/items/')).json()
    const beforeIds = new Set(before.map((asset: { id: string }) => asset.id))
    const file = await page.request.get('/demo/downloads/envanter-forklift.xlsx')
    const buffer = await file.body()
    const body = { asset_type: forklift.id, file: { name: 'forklift.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer } }
    const first = await page.request.post('/api/assets/items/bulk_import/', { multipart: body, headers: await csrf(page) })
    expect(first.ok()).toBeTruthy()
    expect((await first.json()).error_count).toBe(0)
    const second = await page.request.post('/api/assets/items/bulk_import/', { multipart: body, headers: await csrf(page) })
    expect(await second.json()).toMatchObject({ created_count: 0, updated_count: 2, error_count: 0 })
    const after = await (await page.request.get('/api/assets/items/')).json()
    expect(after.filter((asset: { custom_data: { asset_code: string } }) => asset.custom_data.asset_code.startsWith('PRACTICE-FL-')).length).toBe(2)
    await page.goto('/assets')
    await page.screenshot({ path: screenshot('demo-inventory.png'), fullPage: true })
    for (const asset of after) {
        if (!beforeIds.has(asset.id) && String(asset.custom_data.asset_code).startsWith('PRACTICE-FL-')) {
            const deleted = await page.request.delete(`/api/assets/items/${asset.id}/`, { headers: await csrf(page) })
            expect(deleted.status()).toBe(204)
        }
    }
})

test('50 seeded forklifts appear as one model and open into a paged list without changing records', async ({ page }) => {
    await login(page, 'yonetici@demo.gisas.test')
    const writes: string[] = []
    page.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') writes.push(request.method())
    })
    await page.goto('/assets')
    await page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' }).fill('DEMO-FL-50-')
    const group = page.getByRole('button', { name: 'Open Forklift · Toyota 8FD equipment', exact: true })
    await expect(group).toContainText('50 matching items')
    await expect(page.getByRole('button', { name: /^Open .* equipment$/ })).toHaveCount(1)
    await expect(page.getByRole('article')).toHaveCount(0)
    await group.click()
    await expect(page.getByRole('article')).toHaveCount(24)
    await expect(page.getByText('1–24 of 50', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Last', exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(2)
    await expect(page.getByText('49–50 of 50', { exact: true })).toBeVisible()
    const detail = page.getByRole('article').first().getByRole('button').first()
    const code = await detail.innerText()
    expect(code).toMatch(/^DEMO-FL-50-\d{3}$/)
    await detail.click()
    await expect(page.getByRole('dialog')).toContainText(code)
    await expect(page.getByRole('dialog')).toContainText('Toyota')
    await expect(page.getByRole('dialog')).toContainText('8FD')
    await page.keyboard.press('Escape')
    await expect(detail).toBeFocused()
    expect(writes).toEqual([])
})

test('owner publishes via UI, another shipyard reads only public fields, then owner removes it', async ({ page, browser }) => {
    await login(page, 'yonetici@demo.gisas.test')
    const own = await (await page.request.get('/api/assets/items/')).json()
    const sampleItem = own.find((item: { asset_type_name: string }) => item.asset_type_name === 'Forklift')
    const code = `SHARING-TEST-${Date.now()}`
    const created = await page.request.post('/api/assets/items/', { headers: await csrf(page), data: { asset_type: sampleItem.asset_type, custom_data: { ...sampleItem.custom_data, asset_code: code, location: 'PRIVATE-LOCATION-NOT-PUBLIC' } } })
    expect(created.status()).toBe(201)
    const asset = await created.json()
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5190' })
    const other = await context.newPage()
    try {
        await page.goto('/assets')
        await page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' }).fill(code)
        await page.getByRole('button', { name: /^Open Forklift/ }).click()
        await page.getByRole('button', { name: `Actions: ${code}`, exact: true }).click()
        await page.getByRole('button', { name: `Manage sharing: ${code}`, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Shared list visibility' })
        await dialog.getByRole('checkbox').check()
        await dialog.getByRole('textbox', { name: 'Public sharing note' }).fill(code.replace('SHARING-TEST-', 'Public forklift trial '))
        await dialog.getByRole('button', { name: 'Save', exact: true }).click()
        await expect(dialog).not.toBeVisible()
        await login(other, 'diger@demo.gisas.test')
        await other.goto('/shared-equipment')
        const publicNote = code.replace('SHARING-TEST-', 'Public forklift trial ')
        await other.getByRole('searchbox', { name: 'Search equipment or shipyard' }).fill(publicNote)
        await other.getByRole('button', { name: 'Search', exact: true }).click()
        await expect(other.getByText(publicNote, { exact: true })).toBeVisible()
        await expect(other.getByText(code, { exact: true })).not.toBeVisible()
        await expect(other.getByText('PRIVATE-LOCATION-NOT-PUBLIC')).not.toBeVisible()
        const publicResults = await (await other.request.get(`/api/assets/items/shared/?search=${encodeURIComponent(publicNote)}`)).json()
        expect(publicResults.results).toHaveLength(1)
        expect(publicResults.results[0]).not.toHaveProperty('custom_data')
        expect(publicResults.results[0]).not.toHaveProperty('assigned_to')
        await page.getByRole('button', { name: `Actions: ${code}`, exact: true }).click()
        await page.getByRole('button', { name: `Manage sharing: ${code}`, exact: true }).click()
        await dialog.getByRole('checkbox').uncheck()
        await dialog.getByRole('button', { name: 'Remove from shared list', exact: true }).click()
        await expect(dialog).not.toBeVisible()
        await other.reload()
        await other.getByRole('searchbox', { name: 'Search equipment or shipyard' }).fill(publicNote)
        await other.getByRole('button', { name: 'Search', exact: true }).click()
        await expect(other.getByText('No equipment matches your search')).toBeVisible()
    } finally {
        expect((await page.request.delete(`/api/assets/items/${asset.id}/`, { headers: await csrf(page) })).status()).toBe(204)
        await context.close()
    }
})

test('mobile navigation, forms and dark guide fit viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, 'personel@demo.gisas.test')
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click()
    await page.locator('#mobile-navigation').getByRole('link', { name: 'My inventory', exact: true }).click()
    await expect(page).toHaveURL(/\/assets$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
    await page.getByRole('button', { name: 'Add equipment', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add equipment' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Toggle theme' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.locator('html')).not.toHaveClass(/theme-transitioning/)
    await page.screenshot({ path: screenshot('demo-inventory-mobile-dark.png'), fullPage: true })
    await page.goto('/help')
    await expect(page.getByRole('heading', { name: 'User guide', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
    await page.screenshot({ path: screenshot('demo-guide-mobile-dark.png'), fullPage: true })
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.guide-print').getByText('In Update by catalog code mode, empty Description', { exact: false })).toBeVisible()
    expect(await page.getByRole('heading', { name: 'User guide', exact: true }).evaluate(element => getComputedStyle(element).color)).toBe('rgb(17, 17, 17)')
})
