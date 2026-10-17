import { mkdir } from 'node:fs/promises'
import { expect, test, type BrowserContext, type Locator, type Page, type Response } from '@playwright/test'
import type { UsageRequest } from '../src/modules/assets/usage'

// Run only against the disposable P3 demo. Business transitions use the UI;
// authenticated API calls create and remove this test's own catalog fixture.
test.use({ trace: 'off', screenshot: 'off', video: 'off' })
const baseURL = 'http://127.0.0.1:5191'
const guideDirectory = '/private/tmp/p3-guide'
type Input = 'mouse' | 'touch' | 'keyboard'

async function keyboardTo(page: Page, target: Locator) {
    await expect(target).toBeVisible()
    for (let attempt = 0; attempt < 90; attempt++) {
        if (await target.evaluate(element => document.activeElement === element)) return
        await page.keyboard.press('Tab')
    }
    throw new Error(`Control cannot be reached using Tab: ${await target.textContent()}`)
}
async function activate(page: Page, target: Locator, input: Input) {
    if (input === 'keyboard') { await keyboardTo(page, target); await page.keyboard.press('Enter') }
    else if (input === 'touch') await target.tap()
    else await target.click()
}
async function submitAndWait(page: Page, target: Locator, input: Input, matches: (response: Response) => boolean) {
    if (input === 'keyboard') await keyboardTo(page, target)
    const [response] = await Promise.all([
        page.waitForResponse(matches),
        input === 'keyboard' ? page.keyboard.press('Enter') : activate(page, target, input),
    ])
    return response
}
async function enter(page: Page, target: Locator, text: string, input: Input) {
    if (input === 'keyboard') { await keyboardTo(page, target); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(text) }
    else await target.fill(text)
}
async function login(page: Page, email: string, input: Input) {
    await page.addInitScript(() => { localStorage.setItem('language', 'tr'); localStorage.setItem('vite-ui-theme', 'light') })
    await page.goto('/login')
    await enter(page, page.locator('#login-email'), email, input)
    await enter(page, page.locator('#login-password'), 'GisasDemo!2026', input)
    await activate(page, page.locator('button[type="submit"]'), input)
    await expect(page).toHaveURL(/\/dashboard$/)
}
async function csrf(page: Page) {
    const cookies = await page.context().cookies()
    return { 'X-CSRFToken': cookies.find(cookie => cookie.name === 'csrftoken')?.value ?? '', Referer: `${baseURL}/` }
}
async function capture(page: Page, input: Input, name: string) {
    if (input !== 'mouse') return
    await mkdir(guideDirectory, { recursive: true })
    await page.screenshot({ path: `${guideDirectory}/${name}.png`, animations: 'disabled' })
}

test.beforeAll(async ({ request }) => {
    const response = await request.get('/demo/health/')
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ demo: true, status: 'ready' })
})

for (const input of ['mouse', 'touch', 'keyboard'] as const) test(`real shared use lifecycle rejection and cancellation with ${input}`, async ({ page, browser }, testInfo) => {
    test.setTimeout(180000)
    const viewport = { width: input === 'touch' ? 390 : 1440, height: input === 'touch' ? 844 : 1000 }
    const contexts: BrowserContext[] = []
    let typeId: string | undefined
    let assetId: string | undefined
    let complete = false
    const code = `P3-USAGE-${input.toUpperCase()}-${Date.now()}`
    const typeName = `P3 Eğitim iskelesi ${input} ${code}`
    const title = 'Örnek iskele bağlantıları'
    const privateName = `${code}-PRIVATE`
    await login(page, 'admin@demo.gisas.test', 'mouse')
    const health = await page.request.get('/demo/health/')
    expect(await health.json()).toMatchObject({ demo: true, status: 'ready' })
    try {
        const tenantResponse = await page.request.get('/api/tenants/')
        expect(tenantResponse.status()).toBe(200)
        const tenants: { id: number; name: string }[] = await tenantResponse.json()
        const ownerTenant = tenants.find(tenant => tenant.name.includes('Poyraz'))
        expect(ownerTenant).toBeDefined()
        const createdType = await page.request.post('/api/assets/types/', { headers: await csrf(page), data: {
            name: typeName, catalog_code: code, category_code: 'A', sharing_class: 'B', tracking_mode: 'stock',
            schema: [
                { key: 'name', label: 'Malzeme adı', type: 'text', role: 'display_name', required: false },
                { key: 'quantity', label: 'Stok adedi', type: 'number', role: 'quantity', required: false },
            ],
        } })
        expect(createdType.status(), await createdType.text()).toBe(201)
        typeId = (await createdType.json()).id as string
        const createdAsset = await page.request.post('/api/assets/items/', { headers: await csrf(page), data: {
            asset_type: typeId, tenant: ownerTenant!.id, inventory_code: code,
            custom_data: { name: privateName, quantity: 80 },
        } })
        expect(createdAsset.status(), await createdAsset.text()).toBe(201)
        assetId = (await createdAsset.json()).id as string

        const ownerContext = await browser.newContext({ baseURL, viewport, isMobile: input === 'touch', hasTouch: input === 'touch' })
        const requesterContext = await browser.newContext({ baseURL, viewport, isMobile: input === 'touch', hasTouch: input === 'touch' })
        contexts.push(ownerContext, requesterContext)
        const owner = await ownerContext.newPage(), requester = await requesterContext.newPage()
        await login(owner, 'diger@demo.gisas.test', input)
        await login(requester, 'personel@demo.gisas.test', input)

        await owner.goto(`/assets?asset_type=${typeId}`)
        await activate(owner, owner.getByRole('button', { name: 'Tüm kayıtlar', exact: true }), input)
        await expect(owner.getByRole('article')).toHaveCount(1)
        await activate(owner, owner.getByRole('button', { name: `İşlemler: ${code}`, exact: true }), input)
        await activate(owner, owner.getByRole('button', { name: `Paylaşımı yönet: ${code}`, exact: true }), input)
        const sharing = owner.getByRole('dialog', { name: 'Ortak liste görünürlüğü', exact: true })
        if (input === 'keyboard') { await keyboardTo(owner, sharing.getByRole('checkbox')); await owner.keyboard.press('Space') }
        else if (input === 'touch') await sharing.getByRole('checkbox').tap()
        else await sharing.getByRole('checkbox').check()
        await enter(owner, sharing.getByLabel('Ortak listede görünen ad', { exact: true }), title, input)
        await enter(owner, sharing.getByLabel('Paylaşıma açılan adet', { exact: true }), '12', input)
        await enter(owner, sharing.getByLabel('Kapasite veya ölçü', { exact: true }), '2 metre çalışma platformu', input)
        if (input === 'keyboard') {
            await keyboardTo(owner, sharing.getByLabel('Kullanım uygunluğu', { exact: true }))
            await owner.keyboard.type('k')
        } else await sharing.getByLabel('Kullanım uygunluğu', { exact: true }).selectOption('available')
        await enter(owner, sharing.getByLabel('Ortak listede görünen açıklama', { exact: true }), 'Teslim ve nakliyeyi önceden görüşün. Bu kayıt eğitim içindir.', input)
        await expect(sharing.getByLabel('Kullanım uygunluğu', { exact: true })).toHaveValue('available')
        if (input === 'mouse') {
            await sharing.getByRole('heading', { name: code, exact: true }).scrollIntoViewIfNeeded()
            await capture(owner, input, 'sharing-modal')
            const preview = sharing.getByRole('region', { name: 'Diğer tersanelerin göreceği bilgiler', exact: true })
            await expect(preview).toContainText('12')
            await expect(preview).not.toContainText(privateName)
            await preview.scrollIntoViewIfNeeded()
            await capture(owner, input, 'sharing-preview')
        }
        const sharingResponse = await submitAndWait(owner, sharing.getByRole('button', { name: 'Kaydet', exact: true }), input,
            response => response.url().endsWith(`/api/assets/items/${assetId}/sharing/`) && response.request().method() === 'PATCH')
        expect(sharingResponse.status()).toBe(200)
        await expect(sharing).toHaveCount(0)
        expect((await requester.request.get(`/api/assets/items/${assetId}/`)).status()).toBe(404)

        async function createRequest(purpose: string, screenshots = false) {
            await requester.goto('/shared-equipment')
            await enter(requester, requester.getByRole('searchbox', { name: 'Ekipman veya tersane ara', exact: true }), typeName, input)
            await activate(requester, requester.getByRole('button', { name: 'Ara', exact: true }), input)
            await expect(requester.getByRole('article')).toHaveCount(1)
            await expect(requester.getByRole('article')).not.toContainText(privateName)
            if (screenshots) await capture(requester, input, 'shared-equipment')
            await activate(requester, requester.getByRole('button', { name: `Paylaşım detaylarını gör: ${title}`, exact: true }), input)
            await activate(requester, requester.getByRole('button', { name: 'Bedelsiz kullanım talebi', exact: true }), input)
            const create = requester.getByRole('dialog', { name: 'Bedelsiz kullanım talebi', exact: true })
            await enter(requester, create.getByRole('textbox', { name: 'İstenen adet', exact: true }), '2', input)
            await enter(requester, create.getByLabel('Ne için kullanacaksınız?', { exact: true }), purpose, input)
            if (screenshots) await capture(requester, input, 'usage-request')
            const response = await submitAndWait(requester, create.getByRole('button', { name: 'Talebi gönder', exact: true }), input,
                response => new URL(response.url()).pathname === '/api/assets/usage-requests/' && response.request().method() === 'POST')
            expect(response.status(), await response.text()).toBe(201)
            const result: UsageRequest = await response.json()
            expect(result).toMatchObject({ status: 'requested', allowed_actions: ['cancel'], quantity: 2 })
            expect(result.listing_snapshot).not.toHaveProperty('custom_data')
            expect(JSON.stringify(result.listing_snapshot)).not.toContain(privateName)
            await activate(requester, requester.getByRole('link', { name: 'Talebi takip et', exact: true }), input)
            await expect(requester.getByRole('dialog', { name: 'Talep ayrıntıları', exact: true })).toContainText(purpose)
            await expect(requester.getByRole('button', { name: /^(Onayla|Reddet|Teslim et|İade al)$/ })).toHaveCount(0)
            return result
        }

        async function ownerAction(id: string, action: string, status: string, note?: string) {
            await owner.goto(`/shared-usage?direction=received&request=${id}`)
            const details = owner.getByRole('dialog', { name: 'Talep ayrıntıları', exact: true })
            const actionNames: Record<string, string> = { approve: 'Onayla', reject: 'Reddet', handover: 'Teslim et', receive: 'İade al' }
            await activate(owner, details.getByRole('button', { name: actionNames[action], exact: true }), input)
            if (note) await enter(owner, details.getByLabel('Açıklama', { exact: true }), note, input)
            if (action === 'approve') await capture(owner, input, 'usage-approval')
            const response = await submitAndWait(owner, details.getByRole('button', { name: 'İşlemi tamamla', exact: true }), input,
                response => new URL(response.url()).pathname === `/api/assets/usage-requests/${id}/${action}/` && response.request().method() === 'POST')
            expect(response.status(), await response.text()).toBe(200)
            expect(await response.json()).toMatchObject({ status })
            await expect(details.getByRole('status')).toContainText('İşlem tamamlandı.')
        }

        const lifecycle = await createRequest('Gövde montajı için iki bağlantı elemanı gerekiyor.', true)
        expect((await page.request.get(`/api/assets/usage-requests/${lifecycle.id}/`)).status()).toBe(403)
        await ownerAction(lifecycle.id, 'approve', 'approved', 'Teslim koşulları görüşüldü.')
        await ownerAction(lifecycle.id, 'handover', 'active')
        await ownerAction(lifecycle.id, 'receive', 'returned')
        await expect(owner.getByRole('dialog')).toContainText('İade alındı')
        await capture(owner, input, 'usage-return')
        await requester.reload()
        await expect(requester.getByRole('dialog')).toContainText('İade alındı')

        const rejected = await createRequest('Bakım haftasında geçici ihtiyaç.')
        await ownerAction(rejected.id, 'reject', 'rejected', 'Kontrol çalışması nedeniyle uygun değil.')
        await requester.reload()
        await expect(requester.getByRole('dialog')).toContainText('Reddedildi')

        const cancelled = await createRequest('Plan değişikliği nedeniyle iptal örneği.')
        const details = requester.getByRole('dialog', { name: 'Talep ayrıntıları', exact: true })
        await activate(requester, details.getByRole('button', { name: 'Talebi iptal et', exact: true }), input)
        const cancelResponse = await submitAndWait(requester, details.getByRole('button', { name: 'İşlemi tamamla', exact: true }), input,
            response => new URL(response.url()).pathname === `/api/assets/usage-requests/${cancelled.id}/cancel/` && response.request().method() === 'POST')
        expect(cancelResponse.status()).toBe(200)
        await expect(details).toContainText('İptal edildi')
        for (const actor of [owner, requester]) expect(await actor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        complete = true
    } finally {
        await Promise.allSettled(contexts.map(context => context.close()))
        if (complete) {
            if (assetId) expect((await page.request.delete(`/api/assets/items/${assetId}/`, { headers: await csrf(page) })).status()).toBe(204)
            if (typeId) expect((await page.request.delete(`/api/assets/types/${typeId}/`, { headers: await csrf(page) })).status()).toBe(204)
        } else await testInfo.attach('Own P3 fixture retained for failure inspection', { body: JSON.stringify({ code, typeId, assetId }), contentType: 'application/json' })
    }
})
