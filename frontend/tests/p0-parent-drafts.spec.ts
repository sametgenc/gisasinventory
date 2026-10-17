import { expect, test, type Page } from '@playwright/test'
import type { SharedEquipment } from '../src/modules/assets/types'

const offer: SharedEquipment = {
    id: 'public-offer', tenant: 2, tenant_name: 'Owner yard', asset_type_name: 'Example scaffold', tracking_mode: 'stock', category_code: 'A', catalog_code: 'EX-1',
    sharing_title: 'Published offer title', sharing_quantity: 20, sharing_capacity: 'Published capacity', sharing_note: 'Published conditions', sharing_availability: 'available',
    sharing_availability_note: 'Published availability', shared_at: null,
}

async function mock(page: Page, global = false) {
    const state = { failedPath: '', sharedStatus: 200, withdrawn: false, sharedReads: 0, writes: 0 }
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: {
        status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config')
            ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } }
            : { user: { id: '1', username: 'example', email: 'example@example.test', is_superuser: global, role: global ? 'platform_admin' : 'tenant_user', tenant_id: global ? null : 1, tenant_slug: global ? null : 'example', tenant_name: global ? null : 'Example yard' }, methods: [] },
    } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (request.method() === 'POST') { state.writes++; return route.fulfill({ status: 201, json: { created_count: 2, assets: [] } }) }
        if (path === state.failedPath) return route.fulfill({ status: 403, json: { detail: 'Access could not be verified.' } })
        if (path === '/api/assets/items/shared/') {
            state.sharedReads++
            if (state.sharedStatus !== 200) return route.fulfill({ status: state.sharedStatus, json: { detail: 'Availability could not be verified.' } })
            return route.fulfill({ json: { count: state.withdrawn ? 0 : 1, next: null, previous: null, results: state.withdrawn ? [] : [offer] } })
        }
        let data: unknown = []
        if (path === '/api/assets/types/') data = [{ id: 'example-equipment', name: 'Example equipment', description: '', schema: [], tracking_mode: 'individual' }]
        if (path === '/api/tenants/') data = [{ id: 1, name: 'Example yard', slug: 'example' }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        await route.fulfill({ json: data })
    })
    return state
}

for (const path of ['/api/assets/items/', '/api/assets/types/', '/api/tenants/']) {
    test(`batch draft survives failed background dependency ${path} while save stays blocked`, async ({ page }) => {
        const state = await mock(page, path === '/api/tenants/')
        await page.goto('/assets')
        await page.getByRole('button', { name: 'Add equipment', exact: true }).first().click()
        const dialog = page.getByRole('dialog', { name: 'Add equipment', exact: true })
        await dialog.getByRole('combobox', { name: 'Equipment type', exact: true }).fill('Example')
        await dialog.getByRole('option').filter({ hasText: 'Example equipment' }).click()
        await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('12')
        if (path === '/api/tenants/') await dialog.getByRole('combobox', { name: 'Shipyard that owns these records', exact: true }).selectOption('1')
        state.failedPath = path
        await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
        await expect(dialog.getByRole('alert')).toContainText('Required data could not be verified', { timeout: 15000 })
        await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('12')
        await expect(dialog.getByRole('button', { name: 'Add to inventory', exact: true })).toBeDisabled()
        await dialog.locator('form').dispatchEvent('submit')
        expect(state.writes).toBe(0)
        state.failedPath = ''
        await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
        await expect(dialog.getByRole('button', { name: 'Add to inventory', exact: true })).toBeEnabled()
        await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('12')
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
        await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('12')
    })
}

async function openUsage(page: Page) {
    await page.goto('/shared-equipment')
    await page.getByRole('button', { name: 'View sharing details: Published offer title', exact: true }).click()
    await page.getByRole('button', { name: 'Request free shared use', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Request free shared use', exact: true })
    await dialog.getByRole('textbox', { name: 'Quantity requested', exact: true }).fill('2')
    await dialog.getByRole('textbox', { name: 'What will you use it for?', exact: true }).fill('Preserve my work purpose')
    return dialog
}

test('usage draft survives availability error without retaining public metadata; retry restores sending', async ({ page }) => {
    const state = await mock(page)
    const dialog = await openUsage(page)
    state.sharedStatus = 403
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    await expect(dialog.getByRole('alert')).toContainText('This offer cannot currently be verified')
    await expect(dialog.getByRole('textbox', { name: 'What will you use it for?', exact: true })).toHaveValue('Preserve my work purpose')
    await expect(dialog.getByRole('textbox', { name: 'Quantity requested', exact: true })).toHaveValue('2')
    await expect(dialog).not.toContainText('Published offer title')
    await expect(dialog).not.toContainText('Owner yard')
    await expect(dialog.getByRole('button', { name: 'Send request', exact: true })).toBeDisabled()
    await dialog.locator('form').dispatchEvent('submit')
    expect(state.writes).toBe(0)
    state.sharedStatus = 200
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(dialog).toContainText('Published offer title')
    await expect(dialog.getByRole('button', { name: 'Send request', exact: true })).toBeEnabled()
    await expect(dialog.getByRole('textbox', { name: 'What will you use it for?', exact: true })).toHaveValue('Preserve my work purpose')
})

test('withdrawn offer removes public metadata but preserves unsent usage draft with send disabled', async ({ page }) => {
    const state = await mock(page)
    const dialog = await openUsage(page)
    state.withdrawn = true
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    await expect.poll(() => state.sharedReads).toBeGreaterThan(1)
    await expect(dialog.getByRole('alert')).toContainText('This offer is no longer available for requests')
    await expect(dialog.getByRole('textbox', { name: 'What will you use it for?', exact: true })).toHaveValue('Preserve my work purpose')
    await expect(dialog).not.toContainText('Published offer title')
    await expect(dialog).not.toContainText('Owner yard')
    await expect(dialog.getByRole('button', { name: 'Send request', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: 'What will you use it for?', exact: true })).toHaveValue('Preserve my work purpose')
    expect(state.writes).toBe(0)
})
