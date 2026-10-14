import { expect, test, type Page, type Route } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import type { Asset, AssetType, SharedEquipment } from '../src/modules/assets/types'

const stockType: AssetType = {
    id: 'fictional-stock', name: 'Example scaffold materials', description: '', tracking_mode: 'stock', category_code: 'A', catalog_code: 'EXAMPLE-A-01',
    sharing_excluded: false, schema: [
        { key: 'material_code', label: 'Material code', type: 'text', required: true, is_unique_key: true },
        { key: 'material_name', label: 'Material name', type: 'text', required: true },
        { key: 'quantity', label: 'Stock quantity', type: 'number', required: true },
    ], created_at: '', updated_at: '', created_by: null,
}
const privateAsset: Asset = {
    id: 'fictional-asset', tenant: 1, tenant_name: 'Example Yard', asset_type: stockType.id, asset_type_name: stockType.name,
    custom_data: { material_code: 'PRIVATE-EXAMPLE-01', material_name: 'Private example platform', quantity: 1000, model: 'Private model', email: 'private@example.test' },
    created_at: '', updated_at: '', created_by: null, assigned_to: null, assigned_to_username: null, is_shared: false, is_listed_for_sharing: false,
}
const publicAsset: SharedEquipment = {
    id: 'fictional-public', tenant: 2, tenant_name: 'Other Example Yard', asset_type_name: stockType.name, category_code: 'A', catalog_code: 'EXAMPLE-A-01',
    tracking_mode: 'stock', sharing_title: 'Example platform for shared use', sharing_quantity: 50, sharing_capacity: '2.5 m', sharing_note: 'Transport must be agreed. Return clean after use.',
    sharing_availability: 'available', sharing_availability_note: 'Dates to be agreed with the owner.', sharing_contact_name: 'Example coordinator', sharing_contact_email: 'sharing@example.test', sharing_contact_phone: '+90 (212) 555 0101', shared_at: '2026-10-14T09:00:00Z',
}

async function mock(page: Page, options: { asset?: Asset; type?: AssetType; role?: string; shared?: SharedEquipment[]; language?: 'en' | 'tr'; write?: (route: Route) => Promise<void> } = {}) {
    let asset = options.asset ?? { ...privateAsset }
    const type = options.type ?? stockType
    const writes: Record<string, unknown>[] = []
    let privateQueries = 0
    await page.addInitScript(language => { localStorage.setItem('language', language); localStorage.setItem('vite-ui-theme', 'light') }, options.language ?? 'en')
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? {
        account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
    } : { user: { id: '1', username: 'example', email: 'account@example.test', role: options.role ?? 'tenant_admin', tenant_slug: 'example-yard', tenant_name: asset.tenant_name }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (path.endsWith('/sharing/') && request.method() === 'PATCH') {
            const body = request.postDataJSON() as Record<string, unknown>
            writes.push(body)
            if (options.write) return options.write(route)
            asset = { ...asset, ...body, is_listed_for_sharing: body.is_shared as boolean }
            return route.fulfill({ json: asset })
        }
        let data: unknown = []
        if (path === '/api/assets/types/') data = [type]
        if (path === '/api/assets/items/') { privateQueries += 1; data = [asset] }
        if (path === '/api/assets/items/shared/') data = { count: options.shared?.length ?? 1, next: null, previous: null, results: options.shared ?? [publicAsset] }
        if (path === '/api/tenants/') data = [{ id: 1, name: asset.tenant_name, contact_email: 'tenant-private@example.test' }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
    return { writes, privateQueries: () => privateQueries }
}

async function ownerForm(page: Page, asset = privateAsset, expectPaused = false) {
    await page.goto('/assets')
    await page.getByRole('button', { name: 'All records', exact: true }).click()
    if (expectPaused) await expect(page.getByRole('article')).toContainText('Sharing paused · review required')
    await page.getByRole('button', { name: `Actions: ${asset.custom_data.material_code ?? 'EXAMPLE-INDIVIDUAL'}`, exact: true }).click()
    await page.getByRole('button', { name: `Manage sharing: ${asset.custom_data.material_code ?? 'EXAMPLE-INDIVIDUAL'}`, exact: true }).click()
    return page.getByRole('dialog', { name: 'Shared list visibility' })
}

test('legacy publication keeps optional details blank and public preview never copies private inventory or contacts', async ({ page }) => {
    const asset = { ...privateAsset, is_shared: true, is_listed_for_sharing: true, sharing_note: 'Existing public terms.' }
    const { writes } = await mock(page, { asset })
    const dialog = await ownerForm(page, asset)
    await expect(dialog.getByLabel('Name in the shared list')).toHaveValue('')
    await expect(dialog.getByLabel('Quantity offered')).toHaveValue('')
    await expect(dialog).toContainText('Private stock: 1,000 pieces.')
    await expect(dialog.getByLabel('Capacity or size')).toHaveValue('')
    await expect(dialog.getByLabel('Availability', { exact: true })).toHaveValue('by_arrangement')
    const preview = dialog.getByRole('region', { name: 'What other shipyards will see' })
    await expect(preview).toContainText(stockType.name)
    for (const value of ['PRIVATE-EXAMPLE-01', 'Private example platform', '1000', 'private@example.test', 'account@example.test', 'tenant-private@example.test']) await expect(preview).not.toContainText(value)
    await dialog.getByLabel('Public sharing note').fill('Updated public terms.')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes[0]).toMatchObject({ is_shared: true, sharing_title: '', sharing_quantity: null, sharing_availability: 'by_arrangement', sharing_contact_email: '' })
    expect(JSON.stringify(writes)).not.toContain('PRIVATE-EXAMPLE-01')
})

test('stock publication uses the entered offer amount, validates bounds and requires quantity for available status', async ({ page }) => {
    const { writes } = await mock(page)
    const dialog = await ownerForm(page)
    await dialog.getByRole('checkbox').check()
    await dialog.getByLabel('Availability', { exact: true }).selectOption('available')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).toContainText('Declare a quantity before marking this offer available.')
    for (const quantity of ['0', '1.5', '1.000', '1e3', '1001', '9007199254740992']) {
        await dialog.getByLabel('Quantity offered').fill(quantity)
        await dialog.getByRole('button', { name: 'Save', exact: true }).click()
        await expect(dialog.getByLabel('Quantity offered')).toHaveAttribute('aria-invalid', 'true')
    }
    expect(writes).toHaveLength(0)
    await dialog.getByLabel('Name in the shared list').fill('Example offer')
    await dialog.getByLabel('Quantity offered').fill('50')
    await dialog.getByLabel('Capacity or size').fill('2.5 m')
    const preview = dialog.getByRole('region', { name: 'What other shipyards will see' })
    await expect(preview).toContainText('50 pieces offered')
    await expect(preview).not.toContainText('1,000')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes[0]).toMatchObject({ sharing_title: 'Example offer', sharing_quantity: 50, sharing_capacity: '2.5 m', is_shared: true })
})

test('one physical equipment record cannot offer fifty items', async ({ page }) => {
    const type = { ...stockType, tracking_mode: 'individual' as const, schema: [{ key: 'code', label: 'Equipment code', type: 'text' as const, is_unique_key: true }] }
    const asset = { ...privateAsset, custom_data: { code: 'EXAMPLE-INDIVIDUAL', quantity: 50 } }
    await mock(page, { type, asset })
    await page.goto('/assets')
    await page.getByRole('button', { name: `Open ${stockType.name} equipment` }).click()
    await page.getByRole('button', { name: 'Actions: EXAMPLE-INDIVIDUAL' }).click()
    await page.getByRole('button', { name: 'Manage sharing: EXAMPLE-INDIVIDUAL' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Quantity offered')).toHaveValue('')
    await dialog.getByRole('checkbox').check()
    await dialog.getByLabel('Quantity offered').fill('50')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).toContainText('One equipment record can offer only 1 item.')
})

test('withdrawal sends state only even when a stored offer exceeds stock', async ({ page }) => {
    const asset = { ...privateAsset, is_shared: true, sharing_quantity: 1500, sharing_availability: 'available' as const }
    const { writes } = await mock(page, { asset })
    const dialog = await ownerForm(page, asset)
    await dialog.getByRole('checkbox').uncheck()
    await expect(dialog.getByLabel('Name in the shared list')).toBeDisabled()
    await dialog.getByRole('button', { name: 'Remove from shared list', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes).toEqual([{ is_shared: false }])
})

test('paused offer requires review; pending write locks fields and dismissal, rejected save preserves entered details', async ({ page }) => {
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const asset = { ...privateAsset, sharing_needs_review: true, sharing_quantity: 50 }
    const { writes } = await mock(page, { asset, write: async route => { await pending; await route.fulfill({ status: 400, json: { detail: 'Review the offered amount.' } }) } })
    const dialog = await ownerForm(page, asset, true)
    await expect(dialog).toContainText('Publication paused after an inventory change.')
    await dialog.getByRole('checkbox').check()
    await dialog.getByLabel('Name in the shared list').fill('Example offer retained')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.getByLabel('Name in the shared list')).toBeDisabled()
    await expect(dialog.getByRole('checkbox')).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    release()
    await expect(dialog.getByRole('alert')).toContainText('Review the offered amount.')
    await expect(dialog.getByLabel('Name in the shared list')).toHaveValue('Example offer retained')
    expect(writes).toHaveLength(1)
})

for (const width of [1440, 320]) {
    test(`public details remain accessible at ${width}px and use only declared public fields`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        const turkish = width === 1440
        const equipment = turkish ? { ...publicAsset,
            tenant_name: 'Örnek Demo Tersanesi', asset_type_name: 'Örnek iskele parçaları', catalog_code: 'ORNEK-A-01',
            sharing_title: 'Örnek yürüme platformu', sharing_capacity: '2,5 m',
            sharing_note: 'Taşıma ve iade tarihi birlikte kararlaştırılır. Kullanım sonrası temiz teslim edilir.',
            sharing_availability_note: 'Kullanım tarihini ekipman sorumlusuyla görüşün.',
            sharing_contact_name: 'Örnek ekipman sorumlusu', sharing_contact_email: 'paylasim@ornek.test',
        } : publicAsset
        const { privateQueries, writes } = await mock(page, { shared: [equipment], language: turkish ? 'tr' : 'en' })
        await page.goto('/shared-equipment')
        await expect(page.getByRole('article')).toContainText(turkish ? 'Paylaşım adedi: 50' : '50 pieces offered')
        await expect(page.getByRole('article')).toContainText(turkish ? 'Kullanıma uygun' : 'Available')
        await expect(page.getByRole('article')).not.toContainText(equipment.sharing_contact_email!)
        const trigger = page.getByRole('button', { name: turkish ? 'Paylaşım detaylarını gör: Örnek yürüme platformu' : 'View sharing details: Example platform for shared use' })
        await trigger.focus()
        await page.keyboard.press('Enter')
        const dialog = page.getByRole('dialog', { name: turkish ? 'Paylaşım detayları' : 'Sharing details' })
        await expect(dialog).toContainText(equipment.sharing_availability_note!)
        await expect(dialog).toContainText(equipment.sharing_contact_name!)
        await expect(dialog.getByRole('link', { name: equipment.sharing_contact_email! })).toHaveAttribute('href', `mailto:${encodeURIComponent(equipment.sharing_contact_email!)}`)
        await expect(dialog.getByRole('link', { name: '+90 (212) 555 0101' })).toHaveAttribute('href', 'tel:+902125550101')
        expect(privateQueries()).toBe(0)
        expect(writes).toHaveLength(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.keyboard.press('Tab')
        expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true)
        if (width === 1440) {
            await mkdir('../var/demo/screenshots', { recursive: true })
            await page.screenshot({ path: '../var/demo/screenshots/sharing-public-details-fictional.png' })
        }
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
        await expect(trigger).toBeFocused()
    })
}

test('legacy public cards retain type fallback and unsafe contact strings never become links', async ({ page }) => {
    const legacy = { ...publicAsset, sharing_title: '', sharing_quantity: null, sharing_availability: undefined, sharing_contact_email: 'bad@example.test?subject=unsafe', sharing_contact_phone: 'javascript:alert(1)' }
    await mock(page, { shared: [legacy] })
    await page.goto('/shared-equipment')
    await expect(page.getByRole('article')).toContainText('Quantity to be agreed')
    await page.getByRole('button', { name: `View sharing details: ${stockType.name}` }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('link')).toHaveCount(0)
    await expect(dialog).toContainText('bad@example.test?subject=unsafe')
})

test('public details close when the latest shared response withdraws the offer', async ({ page }) => {
    await mock(page)
    let requests = 0
    await page.route('**/api/assets/items/shared/**', async route => {
        requests += 1
        await route.fulfill({ json: { count: requests > 1 ? 0 : 1, next: null, previous: null, results: requests > 1 ? [] : [publicAsset] } })
    })
    await page.goto('/shared-equipment')
    await page.getByRole('button', { name: 'View sharing details: Example platform for shared use' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    await expect.poll(() => requests).toBeGreaterThan(1)
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByText('sharing@example.test')).not.toBeVisible()
})

test('tenant member can browse public details but cannot manage publication', async ({ page }) => {
    await mock(page, { role: 'tenant_user' })
    await page.goto('/assets')
    await page.getByRole('button', { name: 'All records', exact: true }).click()
    await page.getByRole('button', { name: 'Actions: PRIVATE-EXAMPLE-01', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Manage sharing: PRIVATE-EXAMPLE-01', exact: true })).toHaveCount(0)
    await page.goto('/shared-equipment')
    await page.getByRole('button', { name: 'View sharing details: Example platform for shared use' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
})

test('owner form fits 320px; Turkish preview screenshot contains only fictional data', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await mock(page)
    const dialog = await ownerForm(page)
    await expect(dialog.getByLabel('Name in the shared list')).toBeVisible()
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.setViewportSize({ width: 1440, height: 1000 })
    const exampleType = { ...stockType, name: 'Örnek iskele parçaları', catalog_code: 'ORNEK-A-01' }
    const exampleAsset = { ...privateAsset, tenant_name: 'Örnek Demo Tersanesi', asset_type_name: exampleType.name,
        custom_data: { material_code: 'ORNEK-PLT-01', material_name: 'Örnek yürüme platformu', quantity: 1000 } }
    await mock(page, { type: exampleType, asset: exampleAsset, language: 'tr' })
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Change language', exact: true }).click()
    await page.getByRole('button', { name: 'tr Türkçe', exact: true }).click()
    await page.getByRole('button', { name: 'Tüm kayıtlar', exact: true }).click()
    await page.getByRole('button', { name: 'İşlemler: ORNEK-PLT-01', exact: true }).click()
    await page.getByRole('button', { name: 'Paylaşımı yönet: ORNEK-PLT-01', exact: true }).click()
    const turkish = page.getByRole('dialog')
    await turkish.getByRole('checkbox').check()
    await turkish.getByLabel('Ortak listede görünen ad').fill('Örnek yürüme platformu')
    await turkish.getByLabel('Paylaşıma açılan adet').fill('50')
    await turkish.getByLabel('Kapasite veya ölçü').fill('2,5 m')
    await turkish.getByLabel('Kullanım uygunluğu', { exact: true }).selectOption('available')
    await turkish.getByLabel('Uygunluk açıklaması').fill('Kullanım tarihini ekipman sorumlusuyla görüşün.')
    await turkish.getByLabel('Ortak listede görünen açıklama').fill('Taşıma ve iade tarihi birlikte kararlaştırılır. Kullanım sonrası temiz teslim edilir.')
    await turkish.getByText('İletişim bilgileri (isteğe bağlı)', { exact: true }).click()
    await turkish.getByLabel('İletişim kişisi').fill('Örnek ekipman sorumlusu')
    await turkish.getByLabel('İletişim e-postası').fill('paylasim@ornek.test')
    await turkish.getByLabel('İletişim telefonu').fill('+90 (212) 555 0101')
    await turkish.getByText('İletişim bilgileri (isteğe bağlı)', { exact: true }).click()
    await turkish.getByLabel('Ortak listede görünen ad').scrollIntoViewIfNeeded()
    await mkdir('../var/demo/screenshots', { recursive: true })
    await page.screenshot({ path: '../var/demo/screenshots/sharing-owner-form-fictional.png' })
    const preview = turkish.getByRole('region', { name: 'Diğer tersanelerin göreceği bilgiler' })
    await expect(preview).toContainText('Paylaşım adedi: 50')
    await expect(preview).not.toContainText('ORNEK-PLT-01')
    await expect(preview).not.toContainText('1.000')
    await preview.scrollIntoViewIfNeeded()
    await page.screenshot({ path: '../var/demo/screenshots/sharing-owner-preview-fictional.png' })
})

test('optional contact requires explicit entry and field errors use readable labels', async ({ page }) => {
    const { writes } = await mock(page, { write: route => route.fulfill({ status: 400, json: { sharing_contact_email: ['Contact address could not be accepted.'] } }) })
    const dialog = await ownerForm(page)
    await dialog.getByText('Contact details (optional)', { exact: true }).click()
    await expect(dialog.getByLabel('Contact email')).toHaveValue('')
    await dialog.getByLabel('Contact name').fill('Example sharing coordinator')
    await dialog.getByLabel('Contact email').fill('not-an-address')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).toContainText('Enter a valid contact email address.')
    expect(writes).toHaveLength(0)
    await dialog.getByLabel('Contact email').fill('coordinator@example.test')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Contact email: Contact address could not be accepted.')
    await expect(dialog.getByRole('alert')).not.toContainText('sharing_contact_email')
    await expect(dialog.getByLabel('Contact email')).toHaveValue('coordinator@example.test')
    expect(writes[0]).toMatchObject({ sharing_contact_email: 'coordinator@example.test', sharing_contact_name: 'Example sharing coordinator' })
})

test('Excel result explains automatic sharing pauses without changing import totals', async ({ page }) => {
    await mock(page)
    await page.route('**/api/assets/items/preview_import/', route => route.fulfill({ json: { headers: ['Material code', 'Material name', 'Stock quantity'], preview_rows: [['EXAMPLE-01', 'Example platform', '20']], total_rows: 1, detected_template: { asset_type_id: stockType.id, asset_type_name: stockType.name } } }))
    await page.route('**/api/assets/items/bulk_import/', route => route.fulfill({ json: { created_count: 0, updated_count: 1, success_count: 1, skipped_count: 0, error_count: 0, sharing_paused_count: 1, errors: [], message: 'Example stock updated' } }))
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Import from Excel', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Bulk Asset Import' })
    await dialog.getByLabel('Equipment Excel file').setInputFiles({ name: 'fictional-stock.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fictional mocked workbook') })
    await dialog.getByRole('button', { name: 'Preview & continue', exact: true }).click()
    await dialog.getByRole('button', { name: 'Run template import', exact: true }).click()
    await expect(dialog).toContainText('Example stock updated')
    await expect(dialog.getByRole('status')).toContainText('1 sharing publication(s) paused because updated stock no longer supports the offer.')
    await expect(dialog).toContainText('Review them in Manage sharing before publishing again.')
})
