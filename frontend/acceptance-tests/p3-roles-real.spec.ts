import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { mkdir } from 'node:fs/promises'
import { activate, assertLocalDemo, csrf, enter, expectFits, login, mainLink, managementLink, select } from './helpers'

const nonce = Date.now().toString()
const typeName = `P3 keyboard equipment ${nonce}`
let typeId = ''
const modes = [
    { name: 'desktop', width: 1440, height: 1000, keyboard: false },
    { name: 'mobile', width: 390, height: 844, keyboard: false },
    { name: 'keyboard', width: 1440, height: 900, keyboard: true },
]

test('personnel imports the real practice workbook with review and Turkish guide screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await login(page, 'personel@demo.gisas.test', false, 'tr')
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Excel’den aktar', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    const sample = await page.request.get('/demo/downloads/envanter-forklift.xlsx')
    expect(sample.status()).toBe(200)
    await dialog.locator('input[type=file]').setInputFiles({ name: 'envanter-forklift.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await sample.body() })
    await mkdir('/private/tmp/p3-guide', { recursive: true })
    await dialog.screenshot({ path: '/private/tmp/p3-guide/inventory-import-file.png', animations: 'disabled' })
    await dialog.getByRole('button', { name: 'Önizle ve Devam Et', exact: true }).click()
    await expect(dialog).toContainText('Dosyayı inceledik')
    await expect(dialog.getByRole('button', { name: /2 hazır kaydı aktar/ })).toBeEnabled()
    await dialog.screenshot({ path: '/private/tmp/p3-guide/inventory-import.png', animations: 'disabled' })
    await dialog.getByRole('button', { name: /2 hazır kaydı aktar/ }).click()
    await expect(dialog).toContainText('2 satır işlendi')
    const inventory = await (await page.request.get('/api/assets/items/')).json()
    expect(inventory.filter((asset: { custom_data: { asset_code?: string } }) => ['PRACTICE-FL-001', 'PRACTICE-FL-002'].includes(asset.custom_data.asset_code ?? ''))).toHaveLength(2)
})

test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL })
    const page = await context.newPage()
    await assertLocalDemo(page, baseURL)
    await login(page, 'admin@demo.gisas.test')
    const response = await page.request.post('/api/assets/types/', { headers: await csrf(page), data: {
        name: typeName, catalog_code: `P3-KEY-${nonce}`, category_code: 'B', tracking_mode: 'individual',
        schema: [{ key: 'serial', label: 'Serial', type: 'text', is_unique_key: true, required: true }],
    } })
    expect(response.status()).toBe(201)
    typeId = (await response.json()).id
    await context.close()
})

for (const mode of modes) {
    test.describe(mode.name, () => {
    test.use({ viewport: { width: mode.width, height: mode.height }, hasTouch: mode.name === 'mobile', isMobile: mode.name === 'mobile' })
    test(`personnel real add edit export and guide with ${mode.name}`, async ({ page }) => {
        await page.setViewportSize(mode)
        await login(page, 'personel@demo.gisas.test', mode.keyboard)
        await activate(page, await mainLink(page, 'My inventory', mode.keyboard), mode.keyboard)
        await activate(page, page.getByRole('button', { name: 'Add equipment', exact: true }).first(), mode.keyboard)
        const dialog = page.getByRole('dialog', { name: 'Add equipment', exact: true })
        const picker = dialog.getByRole('combobox', { name: 'Equipment type', exact: true })
        await enter(page, picker, typeName, mode.keyboard)
        if (mode.keyboard) { await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter') }
        else await dialog.getByRole('option').filter({ hasText: typeName }).click()
        const serial = `P3-${mode.name}-${nonce}`
        await enter(page, dialog.getByRole('textbox', { name: 'Serial', exact: true }), serial, mode.keyboard)
        await activate(page, dialog.getByRole('button', { name: 'Add to inventory', exact: true }), mode.keyboard)
        await expect(dialog).not.toBeVisible()
        const inventoryResponse = await page.request.get('/api/assets/items/')
        const inventory = await inventoryResponse.json()
        const created = inventory.find((asset: { asset_type: string; custom_data: { serial?: string } }) => asset.asset_type === typeId && asset.custom_data.serial === serial)
        expect(created).toMatchObject({ is_shared: false, is_listed_for_sharing: false })
        await enter(page, page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' }), serial, mode.keyboard)
        await activate(page, page.getByRole('button', { name: 'All records', exact: true }), mode.keyboard)
        const record = page.getByRole('article')
        await expect(record).toHaveCount(1)
        await activate(page, record.getByRole('button', { name: created.inventory_code, exact: true }), mode.keyboard)
        const detail = page.getByRole('dialog')
        await expect(detail.getByRole('button', { name: 'Manage sharing', exact: true })).toHaveCount(0)
        await activate(page, detail.getByRole('button', { name: 'Edit', exact: true }), mode.keyboard)
        const edit = page.getByRole('dialog', { name: 'Edit equipment', exact: true })
        await enter(page, edit.getByRole('textbox', { name: 'Serial', exact: true }), `${serial}-EDIT`, mode.keyboard)
        await activate(page, edit.getByRole('button', { name: 'Save', exact: true }), mode.keyboard)
        await expect(edit).not.toBeVisible()
        await enter(page, page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' }), `${serial}-EDIT`, mode.keyboard)
        await activate(page, page.getByRole('button', { name: 'More actions', exact: true }), mode.keyboard)
        await activate(page, page.getByRole('button', { name: 'Visible results (CSV)', exact: true }), mode.keyboard)
        const exportDialog = page.getByRole('dialog', { name: 'Export inventory', exact: true })
        await expect(exportDialog).toContainText('1 record')
        const downloaded = page.waitForEvent('download')
        await activate(page, exportDialog.getByRole('button', { name: 'Download CSV', exact: true }), mode.keyboard)
        expect(await readFile((await (await downloaded).path())!, 'utf8')).toContain(`${serial}-EDIT`)
        await activate(page, page.getByRole('button', { name: 'Import from Excel', exact: true }).first(), mode.keyboard)
        await expect(page.getByRole('dialog').getByRole('button', { name: 'Download combined template', exact: true })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await page.goto('/help?task=excel&step=1')
        await expect(page.getByRole('heading', { name: 'Import my Excel inventory', exact: true })).toBeVisible()
        await expectFits(page)
    })

    test(`platform real shipyard user assignment and catalog with ${mode.name}`, async ({ page }) => {
        await page.setViewportSize(mode)
        await login(page, 'admin@demo.gisas.test', mode.keyboard)
        await activate(page, await managementLink(page, 'Shipyards', mode.keyboard), mode.keyboard)
        await activate(page, page.getByRole('button', { name: 'New Shipyard', exact: true }), mode.keyboard)
        const shipyard = page.getByRole('dialog')
        const yardName = `P3 ${mode.name} Yard ${nonce}`
        await enter(page, shipyard.getByRole('textbox', { name: 'Shipyard Name', exact: true }), yardName, mode.keyboard)
        await activate(page, shipyard.getByRole('button', { name: 'Create', exact: true }), mode.keyboard)
        await expect(shipyard).not.toBeVisible()
        const yards = await (await page.request.get('/api/tenants/')).json()
        const yard = yards.find((value: { name: string }) => value.name === yardName)
        expect(yard?.slug).toBeTruthy()
        await activate(page, await managementLink(page, 'Users', mode.keyboard), mode.keyboard)
        await activate(page, page.getByRole('button', { name: 'Create New User', exact: true }), mode.keyboard)
        const user = page.getByRole('dialog')
        const username = `p3_${mode.name}_${nonce}`
        await enter(page, user.getByRole('textbox', { name: 'Username', exact: true }), username, mode.keyboard)
        await enter(page, user.getByRole('textbox', { name: 'Email', exact: true }), `${username}@example.test`, mode.keyboard)
        await enter(page, user.locator('input[type=password]'), 'Fictional-user!2026', mode.keyboard)
        await select(page, user.getByRole('combobox', { name: 'Shipyard', exact: true }), yard.slug, mode.keyboard)
        await activate(page, user.getByRole('button', { name: /^Shipyard Admin/ }), mode.keyboard)
        await activate(page, user.getByRole('button', { name: 'Review user', exact: true }), mode.keyboard)
        await expect(user).toContainText(yardName)
        await expect(user).not.toContainText('Fictional-user!2026')
        await activate(page, user.getByRole('button', { name: 'Create user and assign', exact: true }), mode.keyboard)
        await expect(user).not.toBeVisible()
        const users = await (await page.request.get('/api/tenants/all-users/')).json()
        expect(users.find((value: { username: string }) => value.username === username)).toMatchObject({ tenant_slug: yard.slug, role: 'tenant_admin' })
        await activate(page, await mainLink(page, 'Common catalog', mode.keyboard), mode.keyboard)
        await activate(page, page.getByRole('button', { name: 'Add type', exact: true }), mode.keyboard)
        const catalog = page.getByRole('dialog')
        const name = `P3 catalog ${mode.name} ${nonce}`
        await enter(page, catalog.getByRole('textbox', { name: 'Equipment type name', exact: true }), name, mode.keyboard)
        await activate(page, catalog.getByRole('button', { name: 'Create', exact: true }), mode.keyboard)
        await expect(catalog).not.toBeVisible()
        const types = await (await page.request.get('/api/assets/types/')).json()
        expect(types.some((value: { name: string }) => value.name === name)).toBe(true)
        expect((await page.request.get('/api/assets/usage-requests/')).status()).toBe(403)
        await expectFits(page)
    })
    })
}

for (const username of ['p3_unassigned', 'p3_role', 'p3_bound']) {
    test(`real restricted account ${username} keeps existing scope`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await login(page, `${username}@demo.gisas.test`, true)
        await activate(page, page.getByRole('button', { name: 'Toggle navigation menu', exact: true }), true)
        await expect(page.locator('#mobile-navigation').getByRole('link', { name: 'Shipyards', exact: true })).toHaveCount(0)
        await expect(page.locator('#mobile-navigation').getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)
        expect((await page.request.get('/api/tenants/all-users/')).status()).toBe(403)
        await page.keyboard.press('Escape')
        await page.goto('/assets')
        if (username !== 'p3_bound') await expect(page.getByRole('button', { name: 'Add equipment', exact: true }).first()).toBeDisabled()
        else {
            const records = await (await page.request.get('/api/assets/items/')).json()
            expect(new Set(records.map((record: { tenant: number }) => record.tenant)).size).toBe(1)
        }
        await expectFits(page)
    })
}
