import { expect, test, type Page } from '@playwright/test'
import type { SharedEquipment } from '../src/modules/assets/types'
import type { UsageRequest } from '../src/modules/assets/usage'

const id = 'b7116146-a189-4fba-bcb4-f6aa747eb811'
const equipment: SharedEquipment = {
    id: '139a8d97-d665-4c9a-b74b-f30a62c3f6bd', tenant: 2, tenant_name: 'Owner Yard', asset_type_name: 'Scaffold', tracking_mode: 'stock',
    category_code: 'A', catalog_code: 'TEST-01', sharing_title: 'Offered scaffold', sharing_quantity: 12, sharing_capacity: '2 metre platform',
    sharing_note: 'Arrange collection', sharing_availability: 'available', sharing_contact_email: 'published@example.test', shared_at: null,
}
const usage: UsageRequest = {
    id, asset: equipment.id, owner_tenant: 2, owner_tenant_name: 'Owner Yard', requester_tenant: 1, requester_tenant_name: 'Our Yard', requested_by: 7,
    listing_snapshot: { title: 'Offered scaffold', asset_type_name: 'Scaffold', catalog_code: 'TEST-01', category_code: 'A', sharing_capacity: '2 metre platform', sharing_note: 'Arrange collection', sharing_availability_note: '', sharing_contact_name: '', sharing_contact_email: '', sharing_contact_phone: '' },
    start_date: '2099-01-01', end_date: '2099-01-02', quantity: 2, purpose: '', status: 'requested', status_label: '', decision_note: '',
    approved_at: null, handed_over_at: null, returned_at: null, closed_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', allowed_actions: ['cancel'],
}

async function mock(page: Page, options: { role?: 'tenant_admin' | 'tenant_user' | 'platform_admin'; unassigned?: boolean; failedCount?: boolean; items?: SharedEquipment[]; status?: UsageRequest['status']; actions?: UsageRequest['allowed_actions'] } = {}) {
    const role = options.role ?? 'tenant_admin'
    const global = role === 'platform_admin'
    const reads: URL[] = []
    let failed = !!options.failedCount
    let detailFailed = false
    const record = { ...usage, status: options.status ?? usage.status, allowed_actions: options.actions ?? usage.allowed_actions, requested_by_display: 'Elif Sample' }
    await page.addInitScript(() => { localStorage.setItem('language', 'en'); localStorage.setItem('vite-ui-theme', 'light') })
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } } : { user: { id: '1', username: 'sample', email: 'sample@example.test', is_superuser: global, role, tenant_id: global || options.unassigned ? null : 1, tenant_slug: global || options.unassigned ? null : 'our-yard', tenant_name: global || options.unassigned ? null : 'Our Yard' }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), route => {
        const url = new URL(route.request().url())
        reads.push(url)
        if (url.pathname.endsWith('/stream/')) return route.abort()
        if (url.pathname === '/api/assets/usage-requests/') {
            if (failed) return route.fulfill({ status: 503, json: { detail: 'Temporarily unavailable' } })
            const counts = { requested: 31, approved: 5, active: 8 }
            return route.fulfill({ json: { count: counts[url.searchParams.get('status') as keyof typeof counts] ?? 1, results: [record], next: '/next', previous: null } })
        }
        if (url.pathname.startsWith('/api/assets/usage-requests/')) return detailFailed ? route.fulfill({ status: 403, json: { detail: 'Access changed' } }) : route.fulfill({ json: record })
        if (url.pathname === '/api/assets/items/shared/') return route.fulfill({ json: { count: options.items?.length ?? 1, results: options.items ?? [equipment], next: null, previous: null } })
        if (url.pathname.endsWith('/unread_count/')) return route.fulfill({ json: { unread_count: 0 } })
        return route.fulfill({ json: [] })
    })
    return { reads, recover: () => { failed = false }, setDetailFailure: (value: boolean) => { detailFailed = value } }
}

test('manager home counts scoped server totals and opens matching received status', async ({ page }) => {
    const { reads } = await mock(page)
    await page.goto('/dashboard')
    const approval = page.getByRole('link', { name: /Awaiting your approval/ })
    await expect(approval).toContainText('31')
    await expect(page.getByRole('link', { name: /Ready for handover/ })).toContainText('5')
    await expect(page.getByRole('link', { name: /Awaiting return/ })).toContainText('8')
    expect(reads.filter(url => url.pathname === '/api/assets/usage-requests/').every(url => url.searchParams.get('direction') === 'received')).toBe(true)
    await approval.click()
    await expect(page.getByRole('tab', { name: 'Requests received', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByLabel('Request status', { exact: true })).toHaveValue('requested')
})

test('personnel home tracks institution sent counts without owner action labels', async ({ page }) => {
    const { reads } = await mock(page, { role: 'tenant_user' })
    await page.goto('/dashboard')
    await expect(page.getByRole('region', { name: 'Our shipyard’s requests' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Waiting for owner approval/ })).toContainText('31')
    await expect(page.getByRole('link', { name: /Awaiting your approval/ })).toHaveCount(0)
    expect(reads.filter(url => url.pathname === '/api/assets/usage-requests/').every(url => url.searchParams.get('direction') === 'sent')).toBe(true)
})

for (const options of [{ role: 'platform_admin' as const }, { unassigned: true }]) test(`ineligible home makes no shared usage calls ${JSON.stringify(options)}`, async ({ page }) => {
    const { reads } = await mock(page, options)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Inventory overview', exact: true })).toBeVisible()
    if ('role' in options) {
        const administration = page.getByRole('region', { name: 'Administration', exact: true })
        await expect(administration.getByRole('link', { name: 'Manage shipyards', exact: true })).toHaveAttribute('href', '/platform/tenants')
        await expect(administration).toContainText('Participating shipyards handle usage requests')
    }
    expect(reads.filter(url => url.pathname.startsWith('/api/assets/usage-requests/'))).toHaveLength(0)
    await expect(page.getByRole('link', { name: /Awaiting your approval/ })).toHaveCount(0)
})

test('failed home counts stay unknown and retry recovers totals', async ({ page }) => {
    const control = await mock(page, { failedCount: true })
    await page.goto('/dashboard')
    const section = page.getByRole('region', { name: 'Received usage requests' })
    await expect(section.getByRole('alert')).toContainText('Counts could not be loaded', { timeout: 10000 })
    await expect(section.getByRole('link', { name: /Awaiting your approval/ })).toContainText('—')
    control.recover()
    await section.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(section.getByRole('link', { name: /Awaiting your approval/ })).toContainText('31')
})

test('request list identifies institution scope creator and next responsible role', async ({ page }) => {
    await mock(page, { role: 'tenant_user', actions: [] })
    await page.goto(`/shared-usage?direction=sent&status=requested&request=${id}`)
    await expect(page.getByRole('tab', { name: 'Our shipyard’s requests', exact: true })).toBeVisible()
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await expect(dialog).toContainText('Elif Sample')
    await expect(dialog).toContainText('Responsible: Owner Yard shipyard administrator')
    await expect(dialog).toContainText('Pending requests do not reserve equipment')
    await expect(dialog.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
})

test('blocked public offers explain reason and use only explicitly published contacts', async ({ page }) => {
    await mock(page, { items: [
        { ...equipment, id: 'own', sharing_title: 'Own offer', tenant: 1, tenant_name: 'Our Yard' },
        { ...equipment, id: 'unknown', sharing_title: 'Unknown offer', sharing_quantity: null },
        { ...equipment, id: 'unavailable', sharing_title: 'Unavailable offer', sharing_availability: 'unavailable' },
    ] })
    await page.goto('/shared-equipment')
    for (const [name, reason] of [['Own offer', 'This equipment belongs to your shipyard'], ['Unknown offer', 'The owner has not declared an offered quantity'], ['Unavailable offer', 'The owner marked this equipment unavailable']]) {
        await page.getByRole('button', { name: `View sharing details: ${name}` }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toContainText(reason)
        await expect(dialog.getByRole('button', { name: 'Request free shared use', exact: true })).toHaveCount(0)
        if (name !== 'Own offer') await expect(dialog).toContainText('Use the published contact details above')
        await dialog.getByRole('button', { name: 'Close', exact: true }).last().click()
    }
})

test('usage decision draft survives background failure and asks before dismissal', async ({ page }) => {
    const control = await mock(page, { actions: ['approve', 'reject'] })
    await page.goto(`/shared-usage?request=${id}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
    await dialog.getByLabel('Explanation', { exact: true }).fill('Collection after inspection')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible()
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByLabel('Explanation', { exact: true })).toHaveValue('Collection after inspection')
    control.setDetailFailure(true)
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    await expect(dialog).toContainText('Request could not be opened')
    await expect(dialog).not.toContainText('Elif Sample')
    control.setDetailFailure(false)
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(dialog.getByLabel('Explanation', { exact: true })).toHaveValue('Collection after inspection')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(dialog).toHaveCount(0)
})

for (const [status, message] of [
    ['approved', 'The approved quantity is reserved for the agreed dates'],
    ['active', 'Quantity stays reserved until the return is recorded, even after the planned return date'],
    ['returned', 'Returned quantity is available again'],
    ['rejected', 'No equipment was reserved for this request'],
    ['cancelled', 'Any quantity reserved by this request has been released'],
] as const) test(`request ${status} explains next step and reservation without inventing actions`, async ({ page }) => {
    await mock(page, { role: 'tenant_user', status, actions: [] })
    await page.goto(`/shared-usage?request=${id}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await expect(dialog).toContainText('Next step:')
    await expect(dialog).toContainText(message)
    await expect(dialog).toContainText(status === 'approved' || status === 'active' ? 'Responsible: Owner Yard shipyard administrator' : 'Responsible: No action required')
    await expect(dialog.getByRole('button', { name: /^(Approve|Hand over|Receive return|Cancel request)$/ })).toHaveCount(0)
})

test('role home and institution request cards fit a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await mock(page)
    await page.goto('/dashboard')
    await expect(page.getByRole('link', { name: /Awaiting your approval/ })).toContainText('31')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('link', { name: /Awaiting your approval/ }).click()
    await expect(page.getByRole('button', { name: 'Open request', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
