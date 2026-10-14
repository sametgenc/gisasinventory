import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const english = JSON.parse(readFileSync(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8')) as { catalog: { directoryHelp: string }; workbook: { title: string } }

const typeId = 'a0000000-0000-4000-8000-000000000001'
const equipmentType = {
    id: typeId, name: 'Forklift', catalog_code: 'G-001', category_code: 'G', sharing_class: 'B',
    sharing_excluded: false, exclusion_reason: '', description: 'Yard equipment',
    schema: [{ key: 'code', label: 'Equipment code', type: 'text', required: true, is_unique_key: true }],
}
const equipment = {
    id: 'e0000000-0000-4000-8000-000000000001', asset_type: typeId,
    asset_type_name: 'Forklift', tenant: 1, tenant_name: 'Test Yard',
    custom_data: { code: 'TEST-001' }, created_at: '2026-10-14T09:00:00Z',
}

async function session(page: Page, assigned = true, platform = false) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('**/_allauth/browser/v1/**', async route => {
        const config = route.request().url().endsWith('/config')
        await route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: config ? {
            account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
        } : {
            user: { id: '1', username: 'test', email: 'test@example.test', role: platform ? 'platform_admin' : 'tenant_user',
                is_superuser: platform, tenant_id: platform ? null : assigned ? 1 : null,
                tenant_slug: platform ? null : assigned ? 'test-yard' : null, tenant_name: assigned ? 'Test Yard' : null },
            methods: [],
        } } })
    })
}

async function standardApi(page: Page, intercept?: (path: string, method: string) => { status?: number; json: unknown } | undefined) {
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        const custom = intercept?.(path, route.request().method())
        if (custom) return route.fulfill(custom)
        let data: unknown = []
        if (path === '/api/assets/types/') data = [equipmentType]
        if (path === '/api/assets/items/') data = [equipment]
        if (path === '/api/tenants/') data = [{ id: 1, name: 'Test Yard', slug: 'test-yard' }]
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        if (path.endsWith('/smtp/status/')) data = { is_configured: true }
        await route.fulfill({ json: data })
    })
}

test('inventory load failure shows retry instead of an empty inventory', async ({ page }) => {
    await session(page)
    let failing = true
    await standardApi(page, path => path === '/api/assets/items/' && failing ? { status: 503, json: { detail: 'Temporarily unavailable' } } : undefined)
    await page.goto('/assets')
    await expect(page.getByRole('alert').filter({ hasText: 'Equipment data could not be loaded.' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('No equipment found', { exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Add equipment', exact: true })).toBeDisabled()
    failing = false
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await page.getByRole('button', { name: 'Open Forklift equipment' }).click()
    await expect(page.getByRole('button', { name: 'TEST-001', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add equipment', exact: true })).toBeEnabled()
})

test('revoked session leaves protected inventory and keeps the login destination stable', async ({ page }) => {
    await session(page)
    await standardApi(page, (path, method) => path === '/api/assets/items/' && method === 'POST' ? {
        status: 401, json: { status: 401, meta: { is_authenticated: false }, data: { flows: [] } },
    } : undefined)
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Add equipment', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add equipment' })
    await dialog.getByRole('combobox', { name: /Equipment type/ }).selectOption(typeId)
    await dialog.getByRole('textbox', { name: /Equipment code/ }).fill('NEW-REVOKED')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fassets$/)
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('TEST-001', { exact: true })).not.toBeVisible()
})

test('unassigned accounts see a next step and cannot create or import equipment', async ({ page }) => {
    await session(page, false)
    let inventoryRequests = 0
    await standardApi(page, path => {
        if (path !== '/api/assets/items/') return undefined
        inventoryRequests += 1
        return { status: 403, json: { detail: 'Tenant membership required.' } }
    })
    await page.goto('/assets')
    await expect(page.getByText('Your account needs a shipyard')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add equipment', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Import from Excel', exact: true }).first()).toBeDisabled()
    await expect(page.getByText('Equipment data could not be loaded.')).not.toBeVisible()
    expect(inventoryRequests).toBe(0)
})

test('inventory filters reset and dialogs contain keyboard focus then restore it', async ({ page }) => {
    await session(page)
    await standardApi(page)
    await page.goto('/assets')
    await page.getByRole('searchbox', { name: 'Search equipment, brand, model or code' }).fill('no equipment')
    await expect(page.getByRole('button', { name: 'TEST-001', exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).first().click()
    await page.getByRole('button', { name: 'Open Forklift equipment' }).click()
    await expect(page.getByRole('button', { name: 'TEST-001', exact: true })).toBeVisible()
    const trigger = page.getByRole('button', { name: 'Add equipment', exact: true }).first()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Add equipment' })
    await dialog.getByRole('combobox', { name: /Equipment type/ }).selectOption(typeId)
    await dialog.getByRole('textbox', { name: /Equipment code/ }).fill('NEW-001')
    await dialog.getByRole('button', { name: 'Create', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await trigger.click()
    await dialog.getByRole('combobox', { name: /Equipment type/ }).selectOption(typeId)
    await expect(dialog.getByRole('textbox', { name: /Equipment code/ })).toHaveValue('')
})

test('failed equipment deletion stays in its confirmation dialog', async ({ page }) => {
    await session(page)
    await standardApi(page, (path, method) => method === 'DELETE' && path.startsWith('/api/assets/items/') ? { status: 409, json: { detail: 'Equipment is in use.' } } : undefined)
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Open Forklift equipment' }).click()
    await page.getByRole('button', { name: 'Actions: TEST-001', exact: true }).click()
    await page.getByRole('button', { name: 'Delete: TEST-001', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete equipment' })
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Equipment is in use.')
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('button', { name: 'TEST-001', exact: true })).toBeVisible()
})

test('inventory groups only represented types and retains equipment without catalog metadata', async ({ page }) => {
    await session(page)
    const legacy = { ...equipment, id: 'e1111111-0000-4000-8000-000000000002', asset_type: 'legacy-type', asset_type_name: 'Portal crane', custom_data: { old_code: 'LEGACY-001' } }
    await standardApi(page, path => path === '/api/assets/items/' ? { json: [equipment, legacy] } : path === '/api/assets/types/' ? { json: [equipmentType, { ...equipmentType, id: 'unused', name: 'Generator' }] } : undefined)
    await page.goto('/assets')
    await expect(page.getByRole('button', { name: 'Open Forklift equipment' })).toContainText('1')
    await expect(page.getByRole('button', { name: 'Open Portal crane equipment' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Generator equipment' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'TEST-001', exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'Open Portal crane equipment' }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: legacy.id, exact: true }).click()
    await expect(page.getByRole('dialog').getByText('LEGACY-001')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Back to summary' }).click()
    await expect(page.getByRole('button', { name: 'Open Forklift equipment' })).toBeVisible()
})

test('equipment type directory explains global definitions and filters by category', async ({ page }) => {
    await session(page)
    await standardApi(page, path => path === '/api/assets/types/' ? { json: [equipmentType, { ...equipmentType, id: 'global-generator', name: 'Generator', category_code: 'E' }] } : undefined)
    await page.goto('/assets/types')
    await expect(page.getByText(english.catalog.directoryHelp, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generator', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'TEST-001', exact: true })).not.toBeVisible()
    await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('G')
    await expect(page.getByRole('button', { name: 'Forklift', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generator', exact: true })).not.toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Preliminary sharing class' })).not.toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByRole('button', { name: 'Generator', exact: true })).toBeVisible()
})

test('combined inventory recalculates type counts when the owner filter changes', async ({ page }) => {
    await session(page, true, true)
    await standardApi(page, path => path === '/api/assets/items/' ? { json: [equipment, { ...equipment, id: 'other-item', tenant: 2, tenant_name: 'Other Yard', custom_data: { code: 'OTHER-001' } }] } : path === '/api/tenants/' ? { json: [{ id: 1, name: 'Test Yard' }, { id: 2, name: 'Other Yard' }] } : undefined)
    await page.goto('/assets')
    const group = page.getByRole('button', { name: 'Open Forklift equipment' })
    await expect(group).toContainText('2')
    await page.getByRole('combobox', { name: 'Shipyard', exact: true }).selectOption('2')
    await expect(group).toContainText('1')
    await group.click()
    await expect(page.getByRole('button', { name: 'OTHER-001', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'TEST-001', exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(group).toContainText('2')
})

test('shared listing reads only public API and recovers from a removed last page', async ({ page }) => {
    await session(page)
    let privateQueries = 0
    let firstPageCalls = 0
    await standardApi(page, path => { if (path === '/api/assets/items/') privateQueries += 1; return undefined })
    await page.route('**/api/assets/items/shared/**', async route => {
        const currentPage = new URL(route.request().url()).searchParams.get('page')
        if (currentPage === '2') return route.fulfill({ status: 404, json: { detail: 'Invalid page.' } })
        firstPageCalls += 1
        await route.fulfill({ json: { count: 25, next: '?page=2', previous: null, results: [{ id: 'public-item', tenant: 2, tenant_name: 'Other Yard', asset_type_name: 'Forklift', category_code: 'G', catalog_code: 'G-001', sharing_note: 'Public lifting note', shared_at: null }] } })
    })
    await page.goto('/shared-equipment')
    await expect(page.getByText('Public lifting note')).toBeVisible()
    expect(privateQueries).toBe(0)
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Shared list could not be loaded')
    await page.getByRole('button', { name: 'First', exact: true }).click()
    await expect(page.getByText('Public lifting note')).toBeVisible()
    expect(firstPageCalls).toBeGreaterThan(1)
})

test('unassigned account does not request the shared inventory', async ({ page }) => {
    await session(page, false)
    let sharedQueries = 0
    await standardApi(page, path => { if (path === '/api/assets/items/shared/') sharedQueries += 1; return undefined })
    await page.goto('/shared-equipment')
    await expect(page.getByText('A shipyard assignment is required')).toBeVisible()
    expect(sharedQueries).toBe(0)
})

test('workbook preview explains metadata clearing and requires a fresh preview after target changes', async ({ page }) => {
    await session(page, false, true)
    await standardApi(page)
    const previews: string[] = []
    const commits: string[] = []
    await page.route('**/api/assets/workbook/preview/', async route => {
        previews.push(route.request().postData() ?? '')
        await route.fulfill({ json: {
            summary: { types_created: 0, types_updated: 1, assets_created: 0, assets_updated: 0, skipped_rows_count: 0 },
            preview_token: `signed-preview-${previews.length}`, can_commit: true, action_required: [], errors: [], notices: [],
            rows: [{ sheet: 'Equipment types', row: 2, name: 'Forklift', catalog_code: equipmentType.catalog_code, kind: 'type',
                changes: { description: { before: 'Old description', after: '' }, exclusion_reason: { before: 'Old exclusion', after: '' } },
                errors: [], operation: 'update' }],
        } })
    })
    await page.route('**/api/assets/workbook/commit/', async route => {
        commits.push(route.request().postData() ?? '')
        await route.fulfill({ json: { summary: { types_created: 0, types_updated: 1, assets_created: 0, assets_updated: 0, skipped_rows_count: 0 } } })
    })
    await page.goto('/assets/types')
    await page.getByRole('button', { name: 'Import catalog', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: english.workbook.title })
    await dialog.getByLabel('Excel workbook', { exact: true }).setInputFiles({ name: 'catalog.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fictional mocked workbook') })
    await dialog.getByRole('button', { name: 'Review workbook', exact: true }).click()
    await expect(dialog.getByText('Current: Old description')).toBeVisible()
    await expect(dialog.getByText('Current: Old exclusion')).toBeVisible()
    await expect(dialog.getByText('After import: Will be cleared')).toHaveCount(2)
    await expect(dialog.getByRole('button', { name: 'Import reviewed records', exact: true })).toBeEnabled()
    await dialog.getByRole('combobox', { name: 'Inventory target shipyard', exact: true }).selectOption('1')
    await expect(dialog.getByRole('button', { name: 'Import reviewed records', exact: true })).not.toBeVisible()
    expect(commits).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Review workbook', exact: true }).click()
    await dialog.getByRole('button', { name: 'Import reviewed records', exact: true }).click()
    await expect(dialog.getByText('Import completed', { exact: true })).toBeVisible()
    expect(previews).toHaveLength(2)
    expect(commits).toHaveLength(1)
    expect(commits[0]).toContain('signed-preview-2')
    expect(commits[0]).toMatch(/name="tenant"\r\n\r\n1/)
})

test('equipment save blocks dismissal until the server responds', async ({ page }) => {
    await session(page)
    await standardApi(page)
    let releaseRequest!: () => void
    const pending = new Promise<void>(resolve => { releaseRequest = resolve })
    await page.route(url => url.pathname === '/api/assets/items/', async route => {
        if (route.request().method() !== 'POST') return route.fallback()
        await pending
        await route.fulfill({ status: 400, json: { detail: 'Equipment code already exists.' } })
    })
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Add equipment', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add equipment' })
    await dialog.getByRole('combobox', { name: /Equipment type/ }).selectOption(typeId)
    await dialog.getByRole('textbox', { name: /Equipment code/ }).fill('TEST-001')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
    await expect(dialog.getByRole('textbox', { name: /Equipment code/ })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    releaseRequest()
    await expect(dialog.getByRole('alert')).toHaveText('Equipment code already exists.')
    await expect(dialog.getByRole('textbox', { name: /Equipment code/ })).toHaveValue('TEST-001')
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeEnabled()
})

test('equipment fields keep zero defaults, accept decimals and submit unchecked flags as false', async ({ page }) => {
    await session(page)
    await standardApi(page, path => path === '/api/assets/types/' ? { json: [{ ...equipmentType, schema: [
        ...equipmentType.schema,
        { key: 'capacity', label: 'Capacity', type: 'number', required: true, default: 0 },
        { key: 'inspected', label: 'Inspected', type: 'checkbox', required: true },
    ] }] } : undefined)
    let payload: { custom_data: Record<string, unknown> } | undefined
    await page.route(url => url.pathname === '/api/assets/items/', async route => {
        if (route.request().method() !== 'POST') return route.fallback()
        payload = route.request().postDataJSON()
        await route.fulfill({ status: 201, json: { ...equipment, custom_data: payload?.custom_data } })
    })
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Add equipment', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add equipment' })
    await dialog.getByRole('combobox', { name: /Equipment type/ }).selectOption(typeId)
    await expect(dialog.getByRole('spinbutton', { name: /Capacity/ })).toHaveValue('0')
    await dialog.getByRole('spinbutton', { name: /Capacity/ }).fill('3.5')
    await dialog.getByRole('textbox', { name: /Equipment code/ }).fill('NEW-DECIMAL')
    await expect(dialog.getByRole('checkbox', { name: /Inspected/ })).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(payload?.custom_data).toEqual({ code: 'NEW-DECIMAL', capacity: '3.5', inspected: false })
})
