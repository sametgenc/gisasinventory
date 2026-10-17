import { expect, test, type Locator, type Page } from '@playwright/test'
import type { SharedEquipment } from '../src/modules/assets/types'
import type { UsageAction, UsageRequest } from '../src/modules/assets/usage'

const requestId = 'b7116146-a189-4fba-bcb4-f6aa747eb811'
const equipment: SharedEquipment = {
    id: '139a8d97-d665-4c9a-b74b-f30a62c3f6bd', tenant: 2, tenant_name: 'South Yard', asset_type_name: 'Scaffold', tracking_mode: 'stock',
    category_code: 'A', catalog_code: 'DEMO-A-01', sharing_title: 'Scaffold for shared use', sharing_quantity: 12, sharing_capacity: '2 metre platform',
    sharing_note: 'Agree collection before visiting.', sharing_availability: 'available', sharing_contact_email: 'public@example.test', shared_at: null,
}
const initialRequest: UsageRequest = {
    id: requestId, asset: equipment.id, owner_tenant: 2, owner_tenant_name: 'South Yard', requester_tenant: 1, requester_tenant_name: 'North Yard', requested_by: 7, requested_by_display: 'Elif Sample',
    listing_snapshot: { title: equipment.sharing_title!, asset_type_name: equipment.asset_type_name, catalog_code: equipment.catalog_code, category_code: 'A', sharing_capacity: '2 metre platform', sharing_note: equipment.sharing_note!, sharing_availability_note: '', sharing_contact_name: '', sharing_contact_email: '', sharing_contact_phone: '' },
    start_date: '2099-01-01', end_date: '2099-01-02', quantity: 2, purpose: 'Hull assembly', status: 'requested', status_label: '', decision_note: '', approved_at: null, handed_over_at: null, returned_at: null, closed_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', allowed_actions: ['cancel'],
}
const member = { id: 7, username: 'elif.sample', email: 'elif@example.test', first_name: 'Elif', last_name: 'Sample', role: 'tenant_user', is_active: true, is_superuser: false, date_joined: '2026-01-01T00:00:00Z', last_login: null, tenant_name: 'North Yard', tenant_slug: 'north-yard' }

async function mock(page: Page, options: { role?: 'tenant_admin' | 'tenant_user' | 'platform_admin'; owner?: boolean; unassigned?: boolean; empty?: boolean; actions?: UsageAction[]; language?: 'tr' | 'en' } = {}) {
    const role = options.role ?? 'tenant_user'
    const global = role === 'platform_admin'
    let usage = { ...initialRequest, allowed_actions: options.actions ?? (options.owner && role === 'tenant_admin' ? ['approve', 'reject'] as UsageAction[] : ['cancel'] as UsageAction[]) }
    let user = { ...member }
    const writes: { path: string; data: Record<string, unknown> }[] = []
    const reads: URL[] = []
    await page.addInitScript(language => { localStorage.setItem('language', language); localStorage.setItem('vite-ui-theme', 'light') }, options.language ?? 'en')
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } } : { user: { id: '7', username: 'sample', email: 'sample@example.test', is_superuser: global, is_active: true, role, tenant_id: global || options.unassigned ? null : options.owner ? 2 : 1, tenant_slug: global || options.unassigned ? null : options.owner ? 'south-yard' : 'north-yard', tenant_name: global || options.unassigned ? null : options.owner ? 'South Yard' : 'North Yard' }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (request.method() !== 'GET') {
            const data = request.postDataJSON() as Record<string, unknown>
            writes.push({ path, data })
            if (path === '/api/tenants/update-user/7/') { user = { ...user, ...data }; return route.fulfill({ json: user }) }
            const action = path.split('/').at(-2)
            if (path === '/api/assets/usage-requests/') usage = { ...usage, ...data } as UsageRequest
            if (action === 'approve') usage = { ...usage, status: 'approved', allowed_actions: ['handover', 'cancel'], decision_note: String(data.note ?? '') }
            if (action === 'reject') usage = { ...usage, status: 'rejected', allowed_actions: [] }
            if (action === 'handover') usage = { ...usage, status: 'active', allowed_actions: ['receive'] }
            if (action === 'receive') usage = { ...usage, status: 'returned', allowed_actions: [] }
            if (action === 'cancel') usage = { ...usage, status: 'cancelled', allowed_actions: [] }
            return route.fulfill({ status: path === '/api/assets/usage-requests/' ? 201 : 200, json: usage })
        }
        reads.push(url)
        if (path === '/api/assets/items/shared/') return route.fulfill({ json: { count: 1, results: [equipment], next: null, previous: null } })
        if (path === '/api/assets/usage-requests/') return route.fulfill({ json: { count: options.empty ? 0 : 1, results: options.empty ? [] : [usage], next: null, previous: null } })
        if (path.startsWith('/api/assets/usage-requests/')) return route.fulfill({ json: usage })
        if (path === '/api/tenants/my-users/') return route.fulfill({ json: [user] })
        if (path === '/api/tenants/current/') return route.fulfill({ json: { id: 1, slug: 'north-yard', name: 'North Yard', is_active: true } })
        if (path.endsWith('/unread_count/')) return route.fulfill({ json: { unread_count: 0 } })
        return route.fulfill({ json: [] })
    })
    return { writes, reads }
}

async function keyboardTo(page: Page, target: Locator) {
    await expect(target).toBeVisible()
    for (let attempt = 0; attempt < 70; attempt++) {
        if (await target.evaluate(element => element === document.activeElement)) return
        await page.keyboard.press('Tab')
    }
    throw new Error(`Could not reach control using Tab: ${await target.getAttribute('aria-label') ?? await target.textContent()}`)
}

async function activate(page: Page, target: Locator) { await keyboardTo(page, target); await page.keyboard.press('Enter') }
async function typeInto(page: Page, target: Locator, text: string) { await keyboardTo(page, target); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(text) }
async function fits(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }

for (const width of [1440, 390]) {
    test(`discarding an action draft keeps focus inside remaining modal at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        const { writes } = await mock(page, { role: 'tenant_admin', owner: true })
        await page.goto(`/shared-usage?request=${requestId}`)
        const detail = page.getByRole('dialog', { name: 'Request details', exact: true })
        await detail.getByRole('button', { name: 'Approve', exact: true }).click()
        await detail.getByLabel('Explanation', { exact: true }).fill('Draft decision')
        await detail.getByRole('button', { name: 'Cancel', exact: true }).click()
        await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
        await expect(detail).toBeVisible()
        await expect.poll(() => detail.evaluate(element => element.contains(document.activeElement))).toBe(true)
        await page.keyboard.press('Tab')
        await expect(detail.getByRole('button', { name: 'Close', exact: true }).first()).toBeFocused()
        expect(writes).toHaveLength(0)
    })
}

for (const width of [1440, 390, 320]) {
    test(`manager keyboard received request approval handover return at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
        const { writes } = await mock(page, { role: 'tenant_admin', owner: true })
        await page.goto('/dashboard')
        await activate(page, page.getByRole('link', { name: /Awaiting your approval/ }))
        await expect(page.getByRole('tab', { name: 'Requests received', exact: true })).toHaveAttribute('aria-selected', 'true')
        await activate(page, page.getByRole('button', { name: 'Open request', exact: true }))
        const dialog = page.getByRole('dialog', { name: 'Request details' })
        await activate(page, dialog.getByRole('button', { name: 'Approve', exact: true }))
        await expect(dialog.getByLabel('Explanation', { exact: true })).toBeFocused()
        await page.keyboard.type('Collection agreed')
        await page.screenshot({ path: testInfo.outputPath(`manager-approval-${width}.png`), animations: 'disabled' })
        await activate(page, dialog.getByRole('button', { name: 'Complete action', exact: true }))
        await expect(dialog.getByRole('status')).toContainText('Action completed')
        for (const label of ['Hand over', 'Receive return']) {
            await activate(page, dialog.getByRole('button', { name: label, exact: true }))
            await expect(dialog.getByRole('button', { name: 'Complete action', exact: true })).toBeFocused()
            await page.keyboard.press('Enter')
        }
        await expect(dialog.getByText('Return received', { exact: true })).toBeVisible()
        await expect(dialog.getByRole('button', { name: /^(Approve|Reject|Hand over|Receive return|Cancel request)$/ })).toHaveCount(0)
        expect(writes.map(write => write.path.split('/').at(-2))).toEqual(['approve', 'handover', 'receive'])
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Open request', exact: true })).toBeFocused()
        await fits(page)
    })

    test(`personnel keyboard public equipment request tracking cancellation at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
        const { writes } = await mock(page)
        await page.goto('/shared-equipment')
        await activate(page, page.getByRole('button', { name: 'View sharing details: Scaffold for shared use' }))
        await fits(page)
        await page.screenshot({ path: testInfo.outputPath(`personnel-sharing-${width}.png`), animations: 'disabled' })
        await activate(page, page.getByRole('button', { name: 'Request free shared use', exact: true }))
        const create = page.getByRole('dialog', { name: 'Request free shared use' })
        await typeInto(page, create.getByLabel('Quantity requested'), '3')
        await typeInto(page, create.getByLabel('What will you use it for?'), 'Assembly work')
        await activate(page, create.getByRole('button', { name: 'Send request', exact: true }))
        await expect(page.getByRole('link', { name: 'Track request', exact: true })).toBeFocused()
        await page.keyboard.press('Enter')
        const detail = page.getByRole('dialog', { name: 'Request details' })
        await expect(detail).toContainText('Assembly work')
        await expect(detail.getByRole('button', { name: /^(Approve|Reject|Hand over|Receive return)$/ })).toHaveCount(0)
        await activate(page, detail.getByRole('button', { name: 'Cancel request', exact: true }))
        await expect(detail.getByLabel('Explanation', { exact: true })).toBeFocused()
        await activate(page, detail.getByRole('button', { name: 'Complete action', exact: true }))
        await expect(detail).toContainText('Cancelled')
        expect(writes.map(write => write.path)).toEqual(['/api/assets/usage-requests/', `/api/assets/usage-requests/${requestId}/cancel/`])
        expect(writes[0].data).toMatchObject({ quantity: 3, purpose: 'Assembly work' })
        await fits(page)
    })

    test(`manager user edit keyboard preserves role and assignment at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
        const { writes } = await mock(page, { role: 'tenant_admin' })
        await page.goto('/tenant/users')
        await activate(page, page.getByRole('button', { name: 'Edit', exact: true }))
        const dialog = page.getByRole('dialog', { name: 'Edit user', exact: true })
        await typeInto(page, dialog.getByLabel('First Name', { exact: true }), 'Elif updated')
        await expect(dialog.getByRole('button', { name: /Platform Admin/ })).toHaveCount(0)
        await expect(dialog.getByLabel('Shipyard', { exact: true })).toHaveCount(0)
        await page.screenshot({ path: testInfo.outputPath(`manager-user-edit-${width}.png`), animations: 'disabled' })
        await activate(page, dialog.getByRole('button', { name: 'Save', exact: true }))
        await expect(dialog).toHaveCount(0)
        expect(writes).toHaveLength(1)
        expect(writes[0].path).toBe('/api/tenants/update-user/7/')
        expect(writes[0].data).toEqual({ first_name: 'Elif updated', last_name: 'Sample', email: 'elif@example.test', role: 'tenant_user', is_active: true })
        await fits(page)
    })

    test(`personnel received records expose only server allowed actions at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        const { writes } = await mock(page, { owner: true, actions: [] })
        await page.goto(`/shared-usage?direction=received&request=${requestId}`)
        const dialog = page.getByRole('dialog', { name: 'Request details' })
        await expect(dialog).toContainText('Responsible: South Yard shipyard administrator')
        await expect(dialog.getByRole('button', { name: /^(Approve|Reject|Hand over|Receive return|Cancel request)$/ })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        expect(writes).toHaveLength(0)
        await fits(page)
    })

    test(`manager keyboard rejection closes request without handover at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        const { writes } = await mock(page, { role: 'tenant_admin', owner: true })
        await page.goto(`/shared-usage?direction=received&request=${requestId}`)
        const dialog = page.getByRole('dialog', { name: 'Request details' })
        await activate(page, dialog.getByRole('button', { name: 'Reject', exact: true }))
        await expect(dialog.getByLabel('Explanation', { exact: true })).toBeFocused()
        await page.keyboard.type('Equipment needs inspection')
        await activate(page, dialog.getByRole('button', { name: 'Complete action', exact: true }))
        await expect(dialog.getByText('Rejected', { exact: true })).toBeVisible()
        await expect(dialog.getByRole('button', { name: /^(Approve|Reject|Hand over|Receive return|Cancel request)$/ })).toHaveCount(0)
        expect(writes).toEqual([{ path: `/api/assets/usage-requests/${requestId}/reject/`, data: { note: 'Equipment needs inspection' } }])
        await fits(page)
    })

    if (width < 1000) test(`manager sees available approval actions before scrolling at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        const { writes } = await mock(page, { role: 'tenant_admin', owner: true })
        await page.goto(`/shared-usage?direction=received&request=${requestId}`)
        const dialog = page.getByRole('dialog', { name: 'Request details' })
        await expect(dialog.getByRole('button', { name: 'Approve', exact: true })).toBeInViewport()
        await expect(dialog.getByRole('button', { name: 'Reject', exact: true })).toBeInViewport()
        expect(writes).toHaveLength(0)
    })
}

test('request directions follow arrow Home End keyboard tab pattern and reset pagination', async ({ page }) => {
    const { reads } = await mock(page)
    await page.goto('/shared-usage?page=2')
    const sent = page.getByRole('tab', { name: 'Our shipyard’s requests', exact: true })
    const received = page.getByRole('tab', { name: 'Requests received', exact: true })
    await keyboardTo(page, sent)
    await page.keyboard.press('ArrowRight')
    await expect(received).toBeFocused()
    await expect(received).toHaveAttribute('aria-selected', 'true')
    await expect(sent).toHaveAttribute('tabindex', '-1')
    await expect.poll(() => reads.some(url => url.pathname === '/api/assets/usage-requests/' && url.searchParams.get('direction') === 'received' && url.searchParams.get('page') === '1')).toBe(true)
    await page.keyboard.press('Home')
    await expect(sent).toBeFocused()
    await page.keyboard.press('End')
    await expect(received).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(sent).toBeFocused()
})

test('invalid request quantity and dates focus the field and explain correction', async ({ page }) => {
    const { writes } = await mock(page)
    await page.goto('/shared-equipment')
    await page.getByRole('button', { name: 'View sharing details: Scaffold for shared use' }).click()
    await page.getByRole('button', { name: 'Request free shared use', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Request free shared use' })
    const quantity = dialog.getByLabel('Quantity requested')
    await quantity.fill('13')
    await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
    await expect(quantity).toBeFocused()
    await expect(quantity).toHaveAttribute('aria-invalid', 'true')
    await expect(quantity).toHaveAccessibleDescription(/positive whole number/)
    await quantity.fill('2')
    await dialog.getByLabel('Start date').fill('2099-01-02')
    await dialog.getByLabel('Return date').fill('2099-01-01')
    await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
    await expect(dialog.getByLabel('Return date')).toBeFocused()
    await expect(dialog.getByLabel('Return date')).toHaveAttribute('aria-invalid', 'true')
    expect(writes).toHaveLength(0)
})

test('received empty and filtered empty offer relevant next steps', async ({ page }) => {
    const { writes } = await mock(page, { role: 'tenant_admin', owner: true, empty: true })
    await page.goto('/shared-usage?direction=received')
    await expect(page.getByText('Requests sent to your shipyard appear here.', { exact: true })).toBeVisible()
    await expect(page.getByText('Choose equipment from the shared list and send a usage request.', { exact: true })).toHaveCount(0)
    await page.getByLabel('Request status', { exact: true }).selectOption('approved')
    await expect(page.getByRole('button', { name: 'Show all statuses', exact: true })).toBeVisible()
    await activate(page, page.getByRole('button', { name: 'Show all statuses', exact: true }))
    await expect(page.getByLabel('Request status', { exact: true })).toHaveValue('')
    expect(writes).toHaveLength(0)
})

for (const options of [{ role: 'platform_admin' as const }, { role: 'tenant_user' as const, unassigned: true }]) test(`ineligible usage stays inaccessible with keyboard ${JSON.stringify(options)}`, async ({ page }) => {
    const { reads, writes } = await mock(page, options)
    await page.goto('/shared-usage')
    await expect(page.getByText('Shipyard account required', { exact: true })).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)
    expect(reads.filter(url => url.pathname.startsWith('/api/assets/usage-requests/'))).toHaveLength(0)
    expect(writes).toHaveLength(0)
})
