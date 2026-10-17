import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import type { Asset, AssetType } from '../src/modules/assets/types'

// The real demo may contain source inventories. Only explicit captures of this
// test's synthetic dialog and filtered summary are retained.
test.use({ screenshot: 'off', trace: 'off', video: 'off' })
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

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
    return { 'X-CSRFToken': cookies.find(cookie => cookie.name === 'csrftoken')?.value ?? '', Referer: new URL('/', page.url()).href }
}

async function assets(page: Page): Promise<Asset[]> {
    const response = await page.request.get('/api/assets/items/')
    expect(response.status()).toBe(200)
    return response.json()
}

async function types(page: Page): Promise<AssetType[]> {
    const response = await page.request.get('/api/assets/types/')
    expect(response.status()).toBe(200)
    return response.json()
}

function snapshot(records: { id: string; updated_at: string }[]) {
    return records.map(record => ({ id: record.id, updated_at: record.updated_at }))
        .sort((left, right) => left.id.localeCompare(right.id))
}

async function chooseType(row: Locator, name: string) {
    await row.getByRole('combobox', { name: 'Equipment type', exact: true }).fill(name)
    await row.getByRole('option').filter({ hasText: name }).click()
}

test.beforeAll(async ({ request }) => {
    const response = await request.get('/demo/health/')
    expect(response.ok(), 'Start the isolated demo before running real inventory acceptance').toBeTruthy()
    expect(await response.json()).toMatchObject({ demo: true, status: 'ready' })
})

test('real tenant batch creates 50 cranes and 30 generators privately, rejects replay, and preserves per-unit editing', async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(120000)
    await login(page, 'admin@demo.gisas.test')
    const beforeInventory = snapshot(await assets(page))
    const beforeTypes = snapshot(await types(page))
    const nonce = Date.now()
    const names = [`Fictional batch crane ${nonce}`, `Fictional batch generator ${nonce}`]
    const temporaryTypes: string[] = []
    let ownerContext: BrowserContext | undefined
    try {
        for (const name of names) {
            const created = await page.request.post('/api/assets/types/', { headers: await csrf(page), data: {
                name, tracking_mode: 'individual', description: 'Synthetic real-server acceptance equipment.',
                schema: [{ key: 'capacity', label: 'Fictional capacity', type: 'number', required: false }],
            } })
            expect(created.status()).toBe(201)
            temporaryTypes.push((await created.json()).id as string)
        }

        ownerContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
        const owner = await ownerContext.newPage()
        await login(owner, 'yonetici@demo.gisas.test')
        const ownerBefore = await assets(owner)
        expect(ownerBefore.length).toBeGreaterThan(0)
        const ownerTenant = ownerBefore[0].tenant
        expect(ownerBefore.every(record => record.tenant === ownerTenant)).toBe(true)
        await owner.goto('/assets')
        await owner.getByRole('button', { name: 'Add equipment', exact: true }).first().click()
        const dialog = owner.getByRole('dialog', { name: 'Add equipment', exact: true })
        await expect(dialog.getByRole('combobox', { name: 'Shipyard that owns these records', exact: true })).not.toBeVisible()
        const first = dialog.getByRole('region', { name: 'Line 1', exact: true })
        await chooseType(first, names[0])
        await first.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('50')
        await expect(first.getByRole('spinbutton', { name: 'Fictional capacity', exact: true })).not.toBeVisible()
        await dialog.getByRole('button', { name: 'Add another equipment type', exact: true }).click()
        const second = dialog.getByRole('region', { name: 'Line 2', exact: true })
        await chooseType(second, names[1])
        await second.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('30')
        await expect(dialog.getByText('80 individual equipment', { exact: true })).toBeVisible()
        await dialog.screenshot({ path: testInfo.outputPath('inventory-batch-real-entry.png') })

        const saved = owner.waitForResponse(response => new URL(response.url()).pathname === '/api/assets/items/batch_create/' && response.request().method() === 'POST')
        await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
        const response = await saved
        expect(response.status()).toBe(201)
        expect(await response.json()).toMatchObject({ created_count: 80, record_count: 80, unit_count: 80 })
        const submitted = response.request().postDataJSON() as { operation_id: string; rows: unknown[] }
        expect(submitted.rows).toHaveLength(2)
        await expect(dialog).not.toBeVisible()
        await expect(owner.getByRole('status').filter({ hasText: 'Inventory added: 80 individual equipment' })).toHaveText('Inventory added: 80 individual equipment')

        const createdInventory = (await assets(owner)).filter(record => temporaryTypes.includes(record.asset_type))
        expect(createdInventory).toHaveLength(80)
        expect(createdInventory.filter(record => record.asset_type === temporaryTypes[0])).toHaveLength(50)
        expect(createdInventory.filter(record => record.asset_type === temporaryTypes[1])).toHaveLength(30)
        expect(createdInventory.every(record => record.tenant === ownerTenant && record.is_shared === false && record.is_listed_for_sharing === false)).toBe(true)
        expect(createdInventory.every(record => Object.keys(record.custom_data).length === 0)).toBe(true)
        expect(new Set(createdInventory.map(record => record.inventory_code)).size).toBe(80)
        expect(createdInventory.every(record => record.inventory_code?.startsWith('BATCH-'))).toBe(true)

        const replay = await owner.request.post('/api/assets/items/batch_create/', { headers: await csrf(owner), data: submitted })
        expect(replay.status()).toBe(409)
        expect((await assets(owner)).filter(record => temporaryTypes.includes(record.asset_type))).toHaveLength(80)

        await owner.getByRole('searchbox', { name: 'Search equipment, brand, model or code', exact: true }).fill(String(nonce))
        const groupButtons = owner.locator('section[aria-labelledby="inventory-type-heading"] button').filter({ hasText: String(nonce) })
        await expect(groupButtons).toHaveCount(2)
        await expect(groupButtons.filter({ hasText: names[0] })).toContainText('50')
        await expect(groupButtons.filter({ hasText: names[1] })).toContainText('30')
        // Capture the exact summary section; surrounding demo inventory remains private.
        const summary = owner.locator('section[aria-labelledby="inventory-type-heading"]')
        await expect(summary).toBeVisible()
        await summary.screenshot({
            path: testInfo.outputPath('inventory-batch-real-summary.png'),
            style: 'button[aria-label="Proposal or development request"] { visibility: hidden; }',
        })

        const edited = createdInventory.find(record => record.asset_type === temporaryTypes[0])!
        await owner.getByRole('button', { name: 'All records', exact: true }).first().click()
        await owner.getByRole('searchbox', { name: 'Search equipment, brand, model or code', exact: true }).fill(edited.inventory_code!)
        await expect(owner.getByRole('article')).toHaveCount(1)
        await owner.getByRole('button', { name: `Actions: ${edited.inventory_code}`, exact: true }).click()
        await owner.getByRole('button', { name: `Edit: ${edited.inventory_code}`, exact: true }).click()
        const edit = owner.getByRole('dialog', { name: 'Edit equipment', exact: true })
        await edit.getByRole('spinbutton', { name: 'Fictional capacity', exact: true }).fill('25')
        const updated = owner.waitForResponse(item => new URL(item.url()).pathname === `/api/assets/items/${edited.id}/` && item.request().method() === 'PATCH')
        await edit.getByRole('button', { name: 'Save', exact: true }).click()
        expect((await updated).status()).toBe(200)
        await expect(edit).not.toBeVisible()
        const afterEdit = (await assets(owner)).filter(record => temporaryTypes.includes(record.asset_type))
        expect(afterEdit).toHaveLength(80)
        expect(afterEdit.filter(record => Number(record.custom_data.capacity) === 25)).toHaveLength(1)
        expect(Number(afterEdit.find(record => record.id === edited.id)?.custom_data.capacity)).toBe(25)
    } finally {
        const cleanupFailures: string[] = []
        try {
            for (const record of (await assets(page)).filter(record => temporaryTypes.includes(record.asset_type))) {
                try {
                    const deleted = await page.request.delete(`/api/assets/items/${record.id}/`, { headers: await csrf(page) })
                    if (deleted.status() !== 204) cleanupFailures.push(`Item ${record.id}: ${deleted.status()}`)
                } catch {
                    cleanupFailures.push(`Item ${record.id}: cleanup request failed`)
                }
            }
            for (const id of temporaryTypes) {
                try {
                    const deleted = await page.request.delete(`/api/assets/types/${id}/`, { headers: await csrf(page) })
                    if (deleted.status() !== 204) cleanupFailures.push(`Type ${id}: ${deleted.status()}`)
                } catch {
                    cleanupFailures.push(`Type ${id}: cleanup request failed`)
                }
            }
        } finally {
            await ownerContext?.close()
            expect(snapshot(await assets(page))).toEqual(beforeInventory)
            expect(snapshot(await types(page))).toEqual(beforeTypes)
        }
        expect(cleanupFailures).toEqual([])
    }
})
