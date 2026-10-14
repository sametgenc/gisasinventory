import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { Asset, AssetType } from '../src/modules/assets/types'
import type { UsageRequest } from '../src/modules/assets/usage'
import type { WorkbookPreview } from '../src/modules/assets/workbook'

// Existing demo inventory may be private. Capture only this test's fictional
// dialog and clean only its catalog, stock, requests and request notifications.
test.use({ screenshot: 'off', trace: 'off', video: 'off', actionTimeout: 10000, navigationTimeout: 15000 })

const backend = path.resolve('..', 'backend')
const python = path.join(backend, '.venv', 'bin', 'python')
const baseURL = 'http://127.0.0.1:5190'

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
    return { 'X-CSRFToken': cookies.find(cookie => cookie.name === 'csrftoken')?.value ?? '', Referer: `${baseURL}/` }
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
    return records.map(({ id, updated_at }) => ({ id, updated_at })).sort((left, right) => left.id.localeCompare(right.id))
}

function workbook(code: string, inventoryCode: string, name: string): Buffer {
    const sheets = [
        ['Ekipman türleri', [
            ['Katalog kodu', 'Ekipman türü', 'Kategori kodu', 'Ön paylaşım sınıfı', 'Takip biçimi'],
            [code, name, 'A', 'B', 'stock'],
        ]],
        ['Alanlar', [
            ['Katalog kodu', 'Alan kodu', 'Alan adı', 'Alan türü', 'Zorunlu', 'Görevi'],
            [code, 'title', 'Malzeme adı', 'text', null, 'display_name'],
            [code, 'count', 'Adet', 'number', null, 'quantity'],
        ]],
        ['Envanter', [
            ['Katalog kodu', 'Envanter kodu', 'Malzeme adı', 'Adet'],
            [code, inventoryCode, null, 80],
            ['Toplam', null, null, 80],
        ]],
    ]
    return execFileSync(python, ['-c', `
import json, sys
from io import BytesIO
from openpyxl import Workbook
workbook = Workbook()
workbook.remove(workbook.active)
for name, rows in json.load(sys.stdin):
    sheet = workbook.create_sheet(name)
    for row in rows:
        sheet.append(row)
stream = BytesIO()
workbook.save(stream)
workbook.close()
sys.stdout.buffer.write(stream.getvalue())
`], { input: JSON.stringify(sheets) })
}

function cleanFixture(code: string, title: string, purpose: string) {
    // No production connection can enter this helper, even through environment
    // overrides. Preserve append-only audit rows as evidence of the acceptance run.
    execFileSync(python, ['manage.py', 'shell', '--settings=config.demo_settings', '-c', `
import json, sys
from pathlib import Path
from django.conf import settings
from django.db import connection, transaction
from apps.assets.models import AssetType, Asset
from apps.assets.usage_models import SharedUsageRequest
from apps.notifications.models import Notification
code, title, purpose = json.load(sys.stdin)
assert settings.DEMO_MODE and connection.vendor == 'sqlite'
assert Path(connection.settings_dict['NAME']).resolve() == Path(settings.DEMO_DATABASE_PATH).resolve()
assert code.startswith('DEMO-ACCEPT-USAGE-')
with transaction.atomic():
    catalog = AssetType.objects.filter(catalog_code=code)
    assert catalog.count() <= 1
    inventory = Asset.objects.filter(asset_type__in=catalog, inventory_code=code + '-STOCK')
    assert inventory.count() <= 1
    requests = SharedUsageRequest.objects.filter(asset__in=inventory, listing_snapshot__title=title, purpose=purpose)
    assert requests.count() <= 1
    for request in requests:
        request_id = str(request.pk)
        Notification.objects.filter(content__usage_request_id=request_id,
                                    deduplication_key__startswith='usage:' + request_id + ':').delete()
    requests.delete()
    assert not SharedUsageRequest.objects.filter(asset__in=inventory).exists()
    inventory.delete()
    assert not Asset.objects.filter(asset_type__in=catalog).exists()
    catalog.delete()
`], { cwd: backend, input: JSON.stringify([code, title, purpose]), stdio: ['pipe', 'pipe', 'pipe'] })
}

test.beforeAll(async ({ request }) => {
    const response = await request.get('/demo/health/')
    expect(response.ok(), 'Start the isolated local demo before running this acceptance test').toBeTruthy()
    expect(await response.json()).toMatchObject({ demo: true, status: 'ready' })
})

test('real workbook imports optional stock, then owner approves free use through handover and return', async ({ page, browser }) => {
    test.setTimeout(90000)
    await login(page, 'admin@demo.gisas.test')
    const beforeAssets = snapshot(await assets(page))
    const beforeTypes = snapshot(await types(page))
    const code = `DEMO-ACCEPT-USAGE-${Date.now()}`
    const inventoryCode = `${code}-STOCK`
    const name = `Fictional acceptance scaffold ${code}`
    const title = `Fictional shared scaffold ${code}`
    const purpose = `Fictional assembly exercise ${code}`
    const contexts: BrowserContext[] = []
    try {
        const tenantResponse = await page.request.get('/api/tenants/')
        expect(tenantResponse.status()).toBe(200)
        const yards: { id: number; name: string }[] = await tenantResponse.json()
        const yard = yards.find(item => item.name === 'Mavi Körfez Demo Tersanesi')
        expect(yard).toBeDefined()

        await page.goto('/assets/types')
        await page.getByRole('button', { name: 'Import catalog', exact: true }).click()
        const importDialog = page.getByRole('dialog', { name: 'Type and inventory import' })
        await importDialog.getByLabel('Inventory target shipyard', { exact: true }).selectOption(String(yard!.id))
        await importDialog.getByLabel('Excel workbook', { exact: true }).setInputFiles({
            name: 'fictional-shared-use.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: workbook(code, inventoryCode, name),
        })
        const previewResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assets/workbook/preview/' && response.request().method() === 'POST')
        await importDialog.getByRole('button', { name: 'Review workbook', exact: true }).click()
        const reviewed = await previewResponse
        expect(reviewed.status()).toBe(200)
        const preview: WorkbookPreview = await reviewed.json()
        expect(preview).toMatchObject({ can_commit: true, errors: [], action_required: [], summary: { types_created: 1, assets_created: 1, skipped_rows_count: 1 } })
        expect((await types(page)).some(type => type.catalog_code === code)).toBe(false)
        await expect(importDialog.getByText('1 total, heading or blank rows skipped.', { exact: true })).toBeVisible()
        const commitResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assets/workbook/commit/' && response.request().method() === 'POST')
        await importDialog.getByRole('button', { name: 'Import reviewed records', exact: true }).click()
        expect((await commitResponse).status()).toBe(200)
        await expect(importDialog.getByText('Import completed', { exact: true })).toBeVisible()
        const assetType = (await types(page)).find(type => type.catalog_code === code)!
        expect(assetType.schema).toHaveLength(2)
        expect(assetType.schema.every(field => field.required === false)).toBe(true)
        const stock = (await assets(page)).find(asset => asset.inventory_code === inventoryCode)!
        expect(stock).toMatchObject({ tenant: yard!.id, is_shared: false, needs_update: false, custom_data: { count: 80 } })

        const ownerContext = await browser.newContext({ baseURL })
        contexts.push(ownerContext)
        const owner = await ownerContext.newPage()
        await login(owner, 'yonetici@demo.gisas.test')
        await owner.goto(`/assets?asset_type=${assetType.id}`)
        await owner.getByRole('button', { name: 'All records', exact: true }).click()
        await owner.getByRole('searchbox', { name: 'Search equipment, brand, model or code', exact: true }).fill(inventoryCode)
        await expect(owner.getByRole('article')).toHaveCount(1)
        await owner.getByRole('button', { name: `Actions: ${inventoryCode}`, exact: true }).click()
        await owner.getByRole('button', { name: `Manage sharing: ${inventoryCode}`, exact: true }).click()
        const sharing = owner.getByRole('dialog', { name: 'Shared list visibility' })
        await sharing.getByRole('checkbox').check()
        await sharing.getByLabel('Name in the shared list').fill(title)
        await sharing.getByLabel('Quantity offered').fill('40')
        await sharing.getByLabel('Availability', { exact: true }).selectOption('available')
        await sharing.getByLabel('Public sharing note').fill('Fictional collection and return agreed directly with the owner.')
        await sharing.getByRole('button', { name: 'Save', exact: true }).click()
        await expect(sharing).not.toBeVisible()

        const readerContext = await browser.newContext({ baseURL })
        contexts.push(readerContext)
        const reader = await readerContext.newPage()
        await login(reader, 'diger@demo.gisas.test')
        expect((await reader.request.get(`/api/assets/items/${stock.id}/`)).status()).toBe(404)
        await reader.goto('/shared-equipment')
        await reader.getByRole('searchbox', { name: 'Search equipment or shipyard', exact: true }).fill(title)
        await reader.getByRole('button', { name: 'Search', exact: true }).click()
        await expect(reader.getByRole('article')).toHaveCount(1)
        await reader.getByRole('button', { name: `View sharing details: ${title}`, exact: true }).click()
        const publicDetails = reader.getByRole('dialog', { name: 'Sharing details' })
        await expect(publicDetails).toContainText('40 pieces offered')
        await expect(publicDetails).not.toContainText(inventoryCode)
        await expect(publicDetails.getByText('80', { exact: true })).toHaveCount(0)
        await publicDetails.getByRole('button', { name: 'Request free shared use', exact: true }).click()
        const requestDialog = reader.getByRole('dialog', { name: 'Request free shared use' })
        await requestDialog.getByLabel('Quantity requested').fill('10')
        await requestDialog.getByLabel('What will you use it for?').fill(purpose)
        const createResponse = reader.waitForResponse(response => new URL(response.url()).pathname === '/api/assets/usage-requests/' && response.request().method() === 'POST')
        await requestDialog.getByRole('button', { name: 'Send request', exact: true }).click()
        const created = await createResponse
        expect(created.status()).toBe(201)
        const usage: UsageRequest = await created.json()
        expect(usage).toMatchObject({ asset: stock.id, quantity: 10, purpose, status: 'requested', allowed_actions: ['cancel'] })
        expect(JSON.stringify(usage.listing_snapshot)).not.toContain(inventoryCode)
        expect(usage.listing_snapshot).not.toHaveProperty('custom_data')
        expect(Object.keys(created.request().postDataJSON()).sort()).toEqual(['asset', 'end_date', 'purpose', 'quantity', 'start_date'])
        expect((await page.request.get(`/api/assets/usage-requests/${usage.id}/`)).status()).toBe(403)
        expect((await reader.request.post(`/api/assets/usage-requests/${usage.id}/approve/`, { headers: await csrf(reader), data: {} })).status()).toBe(403)
        await reader.getByRole('link', { name: 'Track request', exact: true }).click()
        await expect(reader.getByRole('dialog', { name: 'Request details' })).toContainText('Awaiting approval')
        await expect(reader.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)

        await owner.goto(`/shared-usage?request=${usage.id}`)
        const details = owner.getByRole('dialog', { name: 'Request details' })
        await expect(details).toContainText(purpose)
        await details.getByRole('button', { name: 'Approve', exact: true }).click()
        await expect(details).toContainText('Equipment will be reserved')
        await details.getByLabel('Explanation', { exact: true }).fill('Fictional collection agreed with the requesting shipyard.')
        await owner.setViewportSize({ width: 1280, height: 1100 })
        await details.getByRole('heading', { name: title, exact: true }).scrollIntoViewIfNeeded()
        await details.screenshot({ path: path.resolve('..', 'var', 'demo', 'screenshots', 'shared-usage-owner.png') })
        for (const [action, next] of [['approve', 'Hand over'], ['handover', 'Receive return'], ['receive', null]] as const) {
            if (action !== 'approve') await details.getByRole('button', { name: action === 'handover' ? 'Hand over' : 'Receive return', exact: true }).click()
            const transition = owner.waitForResponse(response => new URL(response.url()).pathname === `/api/assets/usage-requests/${usage.id}/${action}/` && response.request().method() === 'POST')
            await details.getByRole('button', { name: 'Complete action', exact: true }).click()
            expect((await transition).status()).toBe(200)
            if (next) await expect(details.getByRole('button', { name: next, exact: true })).toBeVisible()
        }
        await expect(details.getByText('Return received', { exact: true })).toBeVisible()
        await expect(details.getByRole('button', { name: 'Receive return', exact: true })).toHaveCount(0)
        await reader.reload()
        await expect(reader.getByRole('dialog', { name: 'Request details' })).toContainText('Return received')
        const returned = await reader.request.get(`/api/assets/usage-requests/${usage.id}/`)
        expect(returned.status()).toBe(200)
        expect(await returned.json()).toMatchObject({ status: 'returned', allowed_actions: [], quantity: 10 })
        await expect(details).not.toContainText(/Payment|Price|Fee/)
    } finally {
        await Promise.allSettled(contexts.map(context => context.close()))
        cleanFixture(code, title, purpose)
        expect(snapshot(await assets(page))).toEqual(beforeAssets)
        expect(snapshot(await types(page))).toEqual(beforeTypes)
    }
})
