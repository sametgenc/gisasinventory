import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const english = JSON.parse(readFileSync(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8')) as { workbook: { title: string } }

test('asset form stays open with entered values when the API rejects a save', async ({ page }) => {
    const typeId = 'a0000000-0000-4000-8000-000000000001'
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('**/_allauth/browser/v1/**', async route => {
        const config = route.request().url().endsWith('/config')
        await route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: config ? {
            account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
        } : {
            user: { id: '1', username: 'member', email: 'member@example.test', role: 'tenant_user', tenant_id: 1, tenant_slug: 'yard', tenant_name: 'Yard' },
            methods: [],
        } } })
    })
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.pathname.endsWith('/stream/')) return route.abort()
        if (url.pathname === '/api/assets/items/' && request.method() === 'POST') {
            return route.fulfill({ status: 400, json: { detail: 'This equipment needs a valid serial number.' } })
        }
        let data: unknown = []
        if (url.pathname === '/api/assets/types/') data = [{ id: typeId, name: 'Forklift', schema: [
            { key: 'serial', label: 'Serial', type: 'text', required: true },
        ] }]
        if (url.pathname === '/api/tenants/') data = [{ id: 1, name: 'Yard', slug: 'yard' }]
        if (url.pathname.endsWith('/unread_count/')) data = { unread_count: 0 }
        if (url.pathname.endsWith('/smtp/status/')) data = { is_configured: true }
        await route.fulfill({ json: data })
    })
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Add equipment', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox').selectOption(typeId)
    await dialog.getByRole('textbox', { name: 'Serial', exact: true }).fill('MY-SERIAL')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog.getByText('This equipment needs a valid serial number.')).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Serial', exact: true })).toHaveValue('MY-SERIAL')
    await expect(dialog).toBeVisible()
})

test('platform admin previews and confirms a catalog Excel import', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('**/_allauth/browser/v1/**', async route => {
        const config = route.request().url().endsWith('/config')
        await route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: config ? {
            account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
        } : {
            user: { id: '1', username: 'admin', email: 'admin@example.test', role: 'platform_admin', is_superuser: true, tenant_id: null },
            methods: [],
        } } })
    })

    let imported = false
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (path === '/api/assets/workbook/preview/' && request.method() === 'POST') {
            return route.fulfill({ json: {
                summary: { types_created: 1, types_updated: 0, assets_created: 0, assets_updated: 0, skipped_rows_count: 0 },
                preview_token: 'signed-preview', can_commit: true, notices: [], action_required: [], errors: [],
                rows: [{ sheet: 'Ekipman türleri', row: 2,
                    catalog_code: 'B-001', name: 'Portal crane', category_code: 'B',
                    sharing_class: 'B', exclusion_reason: '', description: 'Test type',
                errors: [], operation: 'create', sharing_excluded: false }],
            } })
        }
        if (path === '/api/assets/workbook/commit/' && request.method() === 'POST') {
            imported = true
            return route.fulfill({ json: { summary: { types_created: 1, types_updated: 0, assets_created: 0, assets_updated: 0, skipped_rows_count: 0 } } })
        }
        let data: unknown = []
        if (path === '/api/assets/types/') data = []
        if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
        if (path.endsWith('/smtp/status/')) data = { is_configured: true }
        await route.fulfill({ json: data })
    })

    await page.goto('/assets/types')
    await page.getByRole('button', { name: 'Import catalog' }).click()
    const dialog = page.getByRole('dialog', { name: english.workbook.title })
    await expect(dialog.getByText('Catalog and inventory are separate steps')).not.toBeVisible()
    await dialog.locator('input[type=file]').setInputFiles({
        name: 'catalog.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('mock workbook'),
    })
    await dialog.getByRole('button', { name: 'Review workbook' }).click()
    await expect(dialog.getByText('Portal crane')).toBeVisible()
    await expect(dialog.getByText('New equipment types', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Import reviewed records' }).click()
    await expect(dialog.getByText('Import completed')).toBeVisible()
    expect(imported).toBe(true)
})
