import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { Asset, AssetType, SharedEquipmentPage } from '../src/modules/assets/types'

// The demo can contain user-supplied inventories. Capture nothing; modify only
// records created by this test, then prove all other inventory timestamps survive.
test.use({ screenshot: 'off', trace: 'off', video: 'off' })

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

async function readAssets(page: Page): Promise<Asset[]> {
    const response = await page.request.get('/api/assets/items/')
    expect(response.status()).toBe(200)
    return response.json()
}

async function readTypes(page: Page): Promise<AssetType[]> {
    const response = await page.request.get('/api/assets/types/')
    expect(response.status()).toBe(200)
    return response.json()
}

function snapshot(records: { id: string; updated_at: string }[]) {
    return records.map(record => ({ id: record.id, updated_at: record.updated_at }))
        .sort((left, right) => left.id.localeCompare(right.id))
}

async function publicSearch(page: Page, title: string): Promise<SharedEquipmentPage> {
    const response = await page.request.get(`/api/assets/items/shared/?search=${encodeURIComponent(title)}`)
    expect(response.status()).toBe(200)
    return response.json()
}

async function filterOwnerRecord(page: Page, code: string) {
    await page.goto('/assets')
    await page.getByRole('searchbox', { name: 'Search equipment, brand, model or code', exact: true }).fill(code)
    await page.getByRole('button', { name: 'All records', exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(1)
}

test.beforeAll(async ({ request }) => {
    const response = await request.get('/demo/health/')
    expect(response.ok(), 'Start the isolated local demo before running acceptance checks').toBeTruthy()
    expect(await response.json()).toMatchObject({ demo: true, status: 'ready' })
})

test('real stock sharing publishes only explicit offer details and pauses safely when stock decreases', async ({ page, browser }) => {
    await login(page, 'admin@demo.gisas.test')
    const beforeInventory = snapshot(await readAssets(page))
    const beforeTypes = snapshot(await readTypes(page))
    const nonce = Date.now()
    const code = `SHARING-DETAILS-TEST-${nonce}`
    const title = `Fictional platform sharing ${nonce}`
    const offer = {
        sharing_title: title, sharing_quantity: 50, sharing_capacity: '2.5 m fictional platform',
        sharing_availability: 'available', sharing_availability_note: 'Agree dates with the fictional owner.',
        sharing_note: 'Fictional acceptance record. Agree transport and return before use.',
        sharing_contact_name: 'Fictional sharing coordinator', sharing_contact_email: 'sharing-acceptance@example.test',
        sharing_contact_phone: '+90 (212) 555 0101',
    }
    let typeId: string | undefined
    let assetId: string | undefined
    let readerContext: BrowserContext | undefined
    try {
        const tenantResponse = await page.request.get('/api/tenants/')
        expect(tenantResponse.status()).toBe(200)
        const yards: { id: number; name: string }[] = await tenantResponse.json()
        const yard = yards.find(item => item.name === 'Mavi Körfez Demo Tersanesi')
        expect(yard, 'The fictional owner shipyard must exist in the isolated demo').toBeDefined()

        const createdType = await page.request.post('/api/assets/types/', { headers: await csrf(page), data: {
            name: `Fictional sharing acceptance stock ${nonce}`, tracking_mode: 'stock',
        } })
        expect(createdType.status()).toBe(201)
        typeId = (await createdType.json()).id as string
        const createdAsset = await page.request.post('/api/assets/items/', { headers: await csrf(page), data: {
            asset_type: typeId, tenant: yard!.id, custom_data: {
                material_code: code, material_name: 'Fictional private platform name', quantity: 1000,
                contact_email: 'private-acceptance@example.test', internal_note: 'FICTIONAL-PRIVATE-MAINTENANCE',
            },
        } })
        expect(createdAsset.status()).toBe(201)
        assetId = (await createdAsset.json()).id as string

        await filterOwnerRecord(page, code)
        await page.getByRole('button', { name: `Actions: ${code}`, exact: true }).click()
        await page.getByRole('button', { name: `Manage sharing: ${code}`, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Shared list visibility' })
        await expect(dialog.getByLabel('Name in the shared list')).toHaveValue('')
        await expect(dialog.getByLabel('Quantity offered')).toHaveValue('')
        await expect(dialog).toContainText('Private stock: 1,000 pieces.')
        await dialog.getByRole('checkbox').check()
        await dialog.getByLabel('Name in the shared list').fill(offer.sharing_title)
        await dialog.getByLabel('Quantity offered').fill(String(offer.sharing_quantity))
        await dialog.getByLabel('Capacity or size').fill(offer.sharing_capacity)
        await dialog.getByLabel('Availability', { exact: true }).selectOption(offer.sharing_availability)
        await dialog.getByLabel('Availability note').fill(offer.sharing_availability_note)
        await dialog.getByLabel('Public sharing note').fill(offer.sharing_note)
        await dialog.getByText('Contact details (optional)', { exact: true }).click()
        await dialog.getByLabel('Contact name').fill(offer.sharing_contact_name)
        await dialog.getByLabel('Contact email').fill(offer.sharing_contact_email)
        await dialog.getByLabel('Contact phone').fill(offer.sharing_contact_phone)
        const preview = dialog.getByRole('region', { name: 'What other shipyards will see' })
        await expect(preview).toContainText('50 pieces offered')
        for (const secret of [code, 'Fictional private platform name', '1,000', 'private-acceptance@example.test']) await expect(preview).not.toContainText(secret)
        const saved = page.waitForResponse(response => new URL(response.url()).pathname === `/api/assets/items/${assetId}/sharing/` && response.request().method() === 'PATCH')
        await dialog.getByRole('button', { name: 'Save', exact: true }).click()
        const sharingResponse = await saved
        expect(sharingResponse.status()).toBe(200)
        expect(await sharingResponse.json()).toMatchObject({ ...offer, is_shared: true, is_listed_for_sharing: true })
        await expect(dialog).not.toBeVisible()

        readerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5190' })
        const other = await readerContext.newPage()
        await login(other, 'diger@demo.gisas.test')
        const listing = await publicSearch(other, title)
        expect(listing.count).toBe(1)
        expect(listing.results).toHaveLength(1)
        const publication = listing.results[0]
        expect(publication).toMatchObject({ ...offer, id: assetId, tracking_mode: 'stock', tenant_name: yard!.name })
        expect(Object.keys(publication).sort()).toEqual([
            'id', 'tenant', 'tenant_name', 'asset_type_name', 'category_code', 'catalog_code', 'tracking_mode', 'shared_at', ...Object.keys(offer),
        ].sort())
        expect(Object.values(publication)).not.toContain(1000)
        const publicBody = JSON.stringify(publication)
        for (const secret of [code, 'Fictional private platform name', 'private-acceptance@example.test', 'FICTIONAL-PRIVATE-MAINTENANCE']) expect(publicBody).not.toContain(secret)
        for (const key of ['custom_data', 'quantity', 'assigned_to', 'assigned_to_username', 'contact_email', 'tenant_contact_email', 'schema', 'sharing_needs_review']) expect(publication).not.toHaveProperty(key)

        await other.goto('/shared-equipment')
        await other.getByRole('searchbox', { name: 'Search equipment or shipyard', exact: true }).fill(title)
        await other.getByRole('button', { name: 'Search', exact: true }).click()
        await expect(other.getByRole('article')).toHaveCount(1)
        await other.getByRole('button', { name: `View sharing details: ${title}`, exact: true }).click()
        const details = other.getByRole('dialog', { name: 'Sharing details' })
        await expect(details).toContainText('50 pieces offered')
        await expect(details).toContainText(offer.sharing_capacity)
        await expect(details).toContainText(offer.sharing_note)
        await expect(details).toContainText(offer.sharing_contact_name)
        await expect(details.getByRole('link', { name: offer.sharing_contact_email })).toHaveAttribute('href', 'mailto:sharing-acceptance%40example.test')
        for (const secret of [code, 'Fictional private platform name', '1,000', 'private-acceptance@example.test']) await expect(details).not.toContainText(secret)

        await expect(details.getByText('1000', { exact: true })).not.toBeVisible()

        const decrease = await page.request.patch(`/api/assets/items/${assetId}/`, { headers: await csrf(page), data: { custom_data: { quantity: 20 } } })
        expect(decrease.status()).toBe(200)
        expect(await decrease.json()).toMatchObject({ ...offer, is_shared: false, is_listed_for_sharing: false, sharing_needs_review: true, shared_at: null, custom_data: { quantity: 20, material_code: code } })
        expect((await publicSearch(other, title)).results).toEqual([])
        await other.reload()
        await other.getByRole('searchbox', { name: 'Search equipment or shipyard', exact: true }).fill(title)
        await other.getByRole('button', { name: 'Search', exact: true }).click()
        await expect(other.getByRole('dialog')).not.toBeVisible()
        await expect(other.getByText('No equipment matches your search', { exact: true })).toBeVisible()
        await filterOwnerRecord(page, code)
        await expect(page.getByRole('article')).toContainText('Sharing paused · review required')

        const increase = await page.request.patch(`/api/assets/items/${assetId}/`, { headers: await csrf(page), data: { custom_data: { quantity: 1000 } } })
        expect(increase.status()).toBe(200)
        expect(await increase.json()).toMatchObject({ ...offer, is_shared: false, is_listed_for_sharing: false, sharing_needs_review: false, custom_data: { quantity: 1000 } })
        expect((await publicSearch(other, title)).results).toEqual([])
    } finally {
        try {
            if (assetId) expect((await page.request.delete(`/api/assets/items/${assetId}/`, { headers: await csrf(page) })).status()).toBe(204)
        } finally {
            try {
                if (typeId) expect((await page.request.delete(`/api/assets/types/${typeId}/`, { headers: await csrf(page) })).status()).toBe(204)
            } finally {
                await readerContext?.close()
                expect(snapshot(await readAssets(page))).toEqual(beforeInventory)
                expect(snapshot(await readTypes(page))).toEqual(beforeTypes)
            }
        }
    }
})
