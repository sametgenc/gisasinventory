import { expect, test, type Page, type Route } from '@playwright/test'
import type { SharedEquipment } from '../src/modules/assets/types'
import type { UsageRequest } from '../src/modules/assets/usage'

const requestId = 'b7116146-a189-4fba-bcb4-f6aa747eb811'
const assetId = '139a8d97-d665-4c9a-b74b-f30a62c3f6bd'
const equipment: SharedEquipment = {
    id: assetId, tenant: 2, tenant_name: 'Example Owner Yard', asset_type_name: 'Example scaffold', tracking_mode: 'stock', category_code: 'A', catalog_code: 'EXAMPLE-A-01',
    sharing_title: 'Example scaffold clamps', sharing_quantity: 20, sharing_capacity: 'Sample size', sharing_note: 'Arrange collection and return.',
    sharing_availability: 'available', sharing_availability_note: 'Weekdays', shared_at: '2026-10-14T09:00:00Z',
}
const exampleRequest: UsageRequest = {
    id: requestId, asset: assetId, owner_tenant: 2, owner_tenant_name: 'Example Owner Yard', requester_tenant: 1, requester_tenant_name: 'Example Requester Yard', requested_by: 1,
    listing_snapshot: { title: equipment.sharing_title!, asset_type_name: equipment.asset_type_name, catalog_code: 'EXAMPLE-A-01', category_code: 'A', sharing_capacity: 'Sample size', sharing_note: equipment.sharing_note!, sharing_availability_note: 'Weekdays', sharing_contact_name: '', sharing_contact_email: '', sharing_contact_phone: '' },
    start_date: '2026-10-14', end_date: '2026-10-16', quantity: 10, purpose: 'Sample hull assembly', status: 'requested', status_label: 'Onay bekliyor', decision_note: '',
    approved_at: null, handed_over_at: null, returned_at: null, closed_at: null, created_at: '2026-10-14T09:00:00Z', updated_at: '2026-10-14T09:00:00Z', allowed_actions: ['cancel'],
}

async function mock(page: Page, options: { owner?: boolean; global?: boolean; equipment?: SharedEquipment[]; request?: UsageRequest; count?: number; action?: (route: Route) => Promise<void>; create?: (route: Route) => Promise<void>; detailError?: boolean } = {}) {
    let usage = structuredClone(options.request ?? exampleRequest)
    const writes: { path: string; body: Record<string, unknown> }[] = []
    const reads: URL[] = []
    await page.addInitScript(() => { localStorage.setItem('language', 'en'); localStorage.setItem('vite-ui-theme', 'light') })
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } } : { user: {
        id: '1', username: 'example', email: 'example@example.test', is_superuser: !!options.global,
        role: options.global ? 'platform_admin' : options.owner ? 'tenant_admin' : 'tenant_user',
        tenant_id: options.global ? null : options.owner ? 2 : 1,
        tenant_slug: options.global ? null : options.owner ? 'example-owner' : 'example-requester',
        tenant_name: options.global ? null : options.owner ? 'Example Owner Yard' : 'Example Requester Yard',
    }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const url = new URL(request.url())
        const path = url.pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (path.startsWith('/api/assets/usage-requests/')) {
            if (request.method() === 'POST') {
                const body = request.postDataJSON() as Record<string, unknown>
                writes.push({ path, body })
                if (path === '/api/assets/usage-requests/') {
                    if (options.create) return options.create(route)
                    usage = { ...usage, ...body } as UsageRequest
                    return route.fulfill({ status: 201, json: usage })
                }
                if (options.action) return options.action(route)
                const action = path.split('/').at(-2)
                if (action === 'approve') usage = { ...usage, status: 'approved', allowed_actions: ['handover', 'cancel'], decision_note: String(body.note ?? '') }
                if (action === 'handover') usage = { ...usage, status: 'active', allowed_actions: ['receive'] }
                if (action === 'receive') usage = { ...usage, status: 'returned', allowed_actions: [] }
                if (action === 'cancel') usage = { ...usage, status: 'cancelled', allowed_actions: [] }
                if (action === 'reject') usage = { ...usage, status: 'rejected', allowed_actions: [] }
                return route.fulfill({ json: usage })
            }
            reads.push(url)
            if (path !== '/api/assets/usage-requests/') {
                if (options.detailError) return route.fulfill({ status: 404, json: { detail: 'Not found.' } })
                return route.fulfill({ json: usage })
            }
            return route.fulfill({ json: { count: options.count ?? 1, next: options.count ? '/next' : null, previous: null, results: [usage] } })
        }
        if (path === '/api/assets/items/shared/') return route.fulfill({ json: { count: options.equipment?.length ?? 1, results: options.equipment ?? [equipment], next: null, previous: null } })
        if (path.endsWith('/unread_count/')) return route.fulfill({ json: { unread_count: 0 } })
        return route.fulfill({ json: [] })
    })
    return { writes, reads, setRequest: (next: UsageRequest) => { usage = next } }
}

async function openCreate(page: Page) {
    await page.goto('/shared-equipment')
    await page.getByRole('button', { name: 'View sharing details: Example scaffold clamps' }).click()
    await page.getByRole('button', { name: 'Request free shared use', exact: true }).click()
    return page.getByRole('dialog', { name: 'Request free shared use' })
}

test('free request form sends only dates quantity purpose and follows owner approval', async ({ page }) => {
    const { writes } = await mock(page)
    const dialog = await openCreate(page)
    await expect(dialog).toContainText('shipyard manager approves')
    await dialog.getByLabel('Quantity requested').fill('5')
    await dialog.getByLabel('What will you use it for?').fill('Sample assembly')
    await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Request sent' })).toContainText('Waiting for the owner’s approval')
    expect(writes).toHaveLength(1)
    expect(Object.keys(writes[0].body).sort()).toEqual(['asset', 'end_date', 'purpose', 'quantity', 'start_date'])
    expect(writes[0].body).toMatchObject({ asset: assetId, quantity: 5, purpose: 'Sample assembly' })
    await page.getByRole('link', { name: 'Track request', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/shared-usage\\?request=${requestId}`))
    await expect(page.getByRole('dialog', { name: 'Request details' })).toContainText('Sample assembly')
    await expect(page.locator('body')).not.toContainText('Payment')
})

test('request form validates whole quantity and inclusive dates before writing', async ({ page }) => {
    const { writes } = await mock(page)
    const dialog = await openCreate(page)
    for (const quantity of ['0', '1.5', '21', '9007199254740992', '1e1']) {
        await dialog.getByLabel('Quantity requested').fill(quantity)
        await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
        await expect(dialog.getByRole('alert')).toContainText('positive whole number')
    }
    await dialog.getByLabel('Quantity requested').fill('5')
    await dialog.getByLabel('Start date').fill('2099-01-02')
    await dialog.getByLabel('Return date').fill('2099-01-01')
    await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('on or after the start')
    expect(writes).toHaveLength(0)
})

test('own unpublished quantity and unavailable equipment have no request action', async ({ page }) => {
    await mock(page, { equipment: [
        { ...equipment, tenant: 1, tenant_name: 'Example Requester Yard' },
        { ...equipment, id: 'unknown', sharing_title: 'Unknown amount', sharing_quantity: null },
        { ...equipment, id: 'unavailable', sharing_title: 'Unavailable equipment', sharing_availability: 'unavailable' },
    ] })
    await page.goto('/shared-equipment')
    for (const name of ['Example scaffold clamps', 'Unknown amount', 'Unavailable equipment']) {
        await page.getByRole('button', { name: `View sharing details: ${name}` }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog.getByRole('button', { name: 'Request free shared use', exact: true })).toHaveCount(0)
        await dialog.getByRole('button', { name: 'Close', exact: true }).last().click()
    }
})

test('global admin cannot request or browse shipyard usage requests', async ({ page }) => {
    const { reads } = await mock(page, { global: true })
    await page.goto('/shared-equipment')
    await expect(page.getByRole('link', { name: 'Usage requests', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'View sharing details: Example scaffold clamps' }).click()
    await expect(page.getByRole('button', { name: 'Request free shared use', exact: true })).toHaveCount(0)
    await page.goto('/shared-usage')
    await expect(page.getByText('Shipyard account required', { exact: true })).toBeVisible()
    expect(reads).toHaveLength(0)
})

test('owner reviews approval then handover and return with server allowed actions', async ({ page }) => {
    const { writes } = await mock(page, { owner: true, request: { ...exampleRequest, allowed_actions: ['approve', 'reject'] } })
    await page.goto(`/shared-usage?request=${requestId}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await expect(dialog.getByRole('button', { name: 'Approve', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
    expect(writes).toHaveLength(0)
    await expect(dialog).toContainText('Equipment will be reserved')
    await dialog.getByLabel('Explanation', { exact: true }).fill('Sample collection agreed')
    await dialog.getByRole('button', { name: 'Complete action', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Hand over', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Hand over', exact: true }).click()
    await dialog.getByRole('button', { name: 'Complete action', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Receive return', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Receive return', exact: true }).click()
    await dialog.getByRole('button', { name: 'Complete action', exact: true }).click()
    await expect(dialog.getByText('Return received', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Receive return', exact: true })).toHaveCount(0)
    expect(writes.map(write => write.path.split('/').at(-2))).toEqual(['approve', 'handover', 'receive'])
    expect(writes[0].body).toEqual({ note: 'Sample collection agreed' })
})

test('requester cannot see owner approval action and can review cancellation', async ({ page }) => {
    const { writes } = await mock(page)
    await page.goto(`/shared-usage?request=${requestId}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await expect(dialog.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel request', exact: true }).click()
    await expect(dialog).toContainText('reserved quantity will be released')
    await dialog.getByRole('button', { name: 'Complete action', exact: true }).click()
    await expect(dialog).toContainText('Cancelled')
    expect(writes).toHaveLength(1)
})

test('capacity conflict keeps explanation and refreshes server actions before retry', async ({ page }) => {
    const control = await mock(page, { owner: true, request: { ...exampleRequest, allowed_actions: ['approve', 'reject'] }, action: async route => {
        control.setRequest({ ...exampleRequest, status: 'cancelled', allowed_actions: [] })
        await route.fulfill({ status: 409, json: { detail: 'Only 5 offered pieces remain.', available_quantity: 5 } })
    } })
    await page.goto(`/shared-usage?request=${requestId}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
    await dialog.getByRole('button', { name: 'Complete action', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Only 5 offered pieces remain.')
    await expect(dialog).toContainText('Request refreshed')
    await expect(dialog.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
    expect(control.writes).toHaveLength(1)
})

test('pending writes disable double submit dismissal and action changes', async ({ page }) => {
    let release: (() => void) | undefined
    const pending = new Promise<void>(resolve => { release = resolve })
    const control = await mock(page, { owner: true, request: { ...exampleRequest, allowed_actions: ['approve', 'reject'] }, action: async route => {
        await pending
        const approved: UsageRequest = { ...exampleRequest, status: 'approved', allowed_actions: ['handover', 'cancel'] }
        control.setRequest(approved)
        await route.fulfill({ json: approved })
    } })
    await page.goto(`/shared-usage?request=${requestId}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
    await dialog.getByRole('button', { name: 'Complete action', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Complete action', exact: true })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    expect(control.writes).toHaveLength(1)
    release?.()
    await expect(dialog.getByRole('button', { name: 'Hand over', exact: true })).toBeVisible()
})

test('filters reset pagination and scoped deep link failure hides request text', async ({ page }) => {
    const { reads } = await mock(page, { count: 50, detailError: true })
    await page.goto('/shared-usage')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect.poll(() => reads.some(url => url.searchParams.get('page') === '2')).toBe(true)
    await page.getByRole('tab', { name: 'Requests received', exact: true }).click()
    await expect.poll(() => reads.some(url => url.searchParams.get('direction') === 'received' && url.searchParams.get('page') === '1')).toBe(true)
    await page.getByLabel('Request status', { exact: true }).selectOption('active')
    await expect.poll(() => reads.some(url => url.searchParams.get('status') === 'active')).toBe(true)
    await page.goto(`/shared-usage?request=${requestId}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await expect(dialog).toContainText('Request could not be opened')
    await expect(dialog).not.toContainText('Sample hull assembly')
    await expect(dialog.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
})

test('mobile request and approval dialogs stay within viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mock(page, { owner: true, request: { ...exampleRequest, allowed_actions: ['approve', 'reject'] } })
    await page.goto(`/shared-usage?request=${requestId}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Complete action', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
