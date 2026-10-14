import { expect, test, type Page } from '@playwright/test'

async function session(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('theme', 'light')
    })
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: {
        status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? {
            account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
        } : {
            user: { id: '1', username: 'pagination', email: 'pagination@example.test', role: 'platform_admin', tenant_slug: 'sample-yard', tenant_name: 'Sample Yard' }, methods: [],
        },
    } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        if (new URL(route.request().url()).pathname.endsWith('/stream/')) return route.abort()
        await route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/unread_count/') ? { unread_count: 0 } : [] })
    })
}

const catalog = Array.from({ length: 30 }, (_, index) => ({
    id: `sample-type-${index + 1}`, name: `Sample workshop model ${String(index + 1).padStart(2, '0')}`,
    catalog_code: `SAMPLE-${index + 1}`, category_code: 'J', description: '', schema: [], sharing_class: 'B', sharing_excluded: false,
}))

test('catalog keeps category totals across pages and resets after size or search changes', async ({ page }) => {
    await session(page)
    await page.route('**/api/assets/types/', route => route.fulfill({ json: catalog }))
    await page.goto('/assets/types')
    const category = page.getByRole('region', { name: 'Mechanical workshop equipment', exact: true })
    await expect(category.getByRole('listitem')).toHaveCount(24)
    await expect(category.getByText('30 equipment types', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(category.getByRole('listitem')).toHaveCount(6)
    await expect(category.getByText('30 equipment types', { exact: true })).toBeVisible()
    const size = page.getByRole('combobox', { name: 'Per page', exact: true })
    await size.selectOption('12')
    await expect(category.getByRole('listitem')).toHaveCount(12)
    await expect(category.getByRole('button', { name: 'Sample workshop model 01', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await size.selectOption('48')
    await expect(category.getByRole('listitem')).toHaveCount(30)
    await expect(size).toBeVisible()
    await size.selectOption('24')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('searchbox', { name: 'Search catalog', exact: true }).fill('model 09')
    await expect(category.getByRole('listitem')).toHaveCount(1)
    await expect(category.getByRole('button', { name: 'Sample workshop model 09', exact: true })).toBeVisible()
    await expect(category.getByText('1 equipment types', { exact: true })).toBeVisible()
})

function sampleNotifications(count: number) {
    return Array.from({ length: count }, (_, index) => ({
        id: index + 1, uuid: `sample-notification-${index + 1}`, message: 'Sample inventory update.', type: 'info',
        content: { title: `Sample notice ${index + 1}`, message: 'Sample inventory update.', type: 'info', url: '/assets' },
        created_at: '2026-01-01T12:00:00Z', read_at: null,
    }))
}

test('notification page size controls server limit and offset and stays usable while loading', async ({ page }) => {
    await session(page)
    const notices = sampleNotifications(61)
    const requests: { limit: number; offset: number }[] = []
    let release: (() => void) | undefined
    await page.route('**/api/notifications/?*', async route => {
        const url = new URL(route.request().url())
        const limit = Number(url.searchParams.get('limit'))
        const offset = Number(url.searchParams.get('offset'))
        requests.push({ limit, offset })
        if (offset === 25) await new Promise<void>(resolve => { release = resolve })
        await route.fulfill({ json: { count: notices.length, results: notices.slice(offset, offset + limit), next: null, previous: null } })
    })
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { name: 'Sample notice 1', exact: true })).toBeVisible()
    const size = page.getByRole('combobox', { name: 'Per page', exact: true })
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect.poll(() => requests).toContainEqual({ limit: 25, offset: 25 })
    await expect(size).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    release?.()
    await expect(page.getByRole('heading', { name: 'Sample notice 26', exact: true })).toBeVisible()
    await size.selectOption('50')
    await expect(page.getByRole('heading', { name: 'Sample notice 1', exact: true })).toBeVisible()
    await expect.poll(() => requests).toContainEqual({ limit: 50, offset: 0 })
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Sample notice 51', exact: true })).toBeVisible()
    await expect.poll(() => requests).toContainEqual({ limit: 50, offset: 50 })
    await size.selectOption('100')
    await expect(page.getByRole('heading', { name: 'Sample notice 1', exact: true })).toBeVisible()
    await expect(size).toBeVisible()
    await expect.poll(() => requests).toContainEqual({ limit: 100, offset: 0 })
})

test('notification refresh recovers to a valid page when the total shrinks', async ({ page }) => {
    await session(page)
    const notices = sampleNotifications(61)
    let count = notices.length
    await page.route('**/api/notifications/?*', async route => {
        const url = new URL(route.request().url())
        const limit = Number(url.searchParams.get('limit'))
        const offset = Number(url.searchParams.get('offset'))
        await route.fulfill({ json: { count, results: notices.slice(0, count).slice(offset, offset + limit), next: null, previous: null } })
    })
    await page.route('**/api/notifications/*/mark_as_read/', async route => {
        count = 15
        await route.fulfill({ json: { status: 'ok' } })
    })
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { name: 'Sample notice 1', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Last', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Sample notice 51', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Mark as read: Sample notice 51', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Sample notice 1', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'First', exact: true })).toBeDisabled()
})

test('shared equipment resets filters to first page and First recovers from removed pages', async ({ page }) => {
    await session(page)
    const requests: { page: string | null; category: string | null; search: string | null }[] = []
    let removedPage = false
    await page.route('**/api/assets/items/shared/**', async route => {
        const url = new URL(route.request().url())
        const currentPage = url.searchParams.get('page')
        const category = url.searchParams.get('category_code')
        const search = url.searchParams.get('search')
        requests.push({ page: currentPage, category, search })
        if (removedPage && currentPage === '2') return route.fulfill({ status: 404, json: { detail: 'Invalid page.' } })
        await route.fulfill({ json: { count: 49, results: [{
            id: `public-${currentPage}`, tenant: 2, tenant_name: 'Sample Other Yard', asset_type_name: `Shared workshop tool ${currentPage}`,
            category_code: 'J', catalog_code: 'SAMPLE-J-01', sharing_note: 'Fictional public equipment.', shared_at: null,
        }], next: '?page=2', previous: null } })
    })
    await page.goto('/shared-equipment')
    await expect(page.getByRole('heading', { name: 'Shared workshop tool 1', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Shared workshop tool 2', exact: true })).toBeVisible()
    await page.getByRole('combobox', { name: 'Equipment group', exact: true }).selectOption('J')
    await expect.poll(() => requests).toContainEqual({ page: '1', category: 'J', search: null })
    await expect(page.getByRole('heading', { name: 'Shared workshop tool 1', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Shared workshop tool 2', exact: true })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search equipment or shipyard', exact: true }).fill('workshop')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect.poll(() => requests).toContainEqual({ page: '1', category: 'J', search: 'workshop' })
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Shared workshop tool 1', exact: true })).toBeVisible()
    removedPage = true
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Shared list could not be loaded')
    await page.getByRole('button', { name: 'First', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Shared workshop tool 1', exact: true })).toBeVisible()
})
