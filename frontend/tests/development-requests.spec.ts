import { expect, test, type Page, type Route } from '@playwright/test'
import type { DevelopmentRequest } from '../src/modules/platform-feedback'

const id = 'd335217a-f380-4ba9-9cc7-9455958543a4'
const example: DevelopmentRequest = {
    id, type: 'feature', subject: 'Explain unmatched Excel rows', description: 'I need to know which equipment rows need attention.', proposed_solution: 'Highlight unmatched rows.', expected_benefit: 'Less manual checking.',
    area: 'excel', status: 'open', priority: 'normal', page_url: '/assets', user_agent: '', submitted_by: 1, submitted_by_email: 'author@example.test', tenant: 1, tenant_name: 'Example yard', assigned_to: null, assigned_to_email: null, assigned_to_display: null,
    created_at: '2026-10-15T08:00:00Z', updated_at: '2026-10-15T08:00:00Z', attachments: [], history: [], allowed_actions: ['message'],
}
async function mock(page: Page, options: { language?: string; global?: boolean; tenantSuperuser?: boolean; unassigned?: boolean; count?: number; create?: (route: Route) => Promise<void>; action?: (route: Route) => Promise<void>; detailError?: boolean } = {}) {
    let record = { ...structuredClone(example), allowed_actions: options.global ? ['message', 'triage'] : ['message'] }
    const reads: URL[] = []
    const writes: { path: string; body: string }[] = []
    await page.addInitScript(language => { localStorage.setItem('language', language); localStorage.setItem('vite-ui-theme', 'light') }, options.language ?? 'en')
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } } : { user: {
        id: '1', email: 'author@example.test', username: 'example', is_superuser: !!options.global || !!options.tenantSuperuser,
        role: options.global || options.unassigned ? 'platform_admin' : 'tenant_user', tenant_id: options.global || options.unassigned ? null : 1, tenant_slug: options.global || options.unassigned ? null : 'example-yard', tenant_name: 'Example yard',
    }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (path.startsWith('/api/platform-feedback/')) {
            if (request.method() === 'POST') {
                writes.push({ path, body: request.postData() ?? '' })
                if (path === '/api/platform-feedback/') {
                    if (options.create) return options.create(route)
                    return route.fulfill({ status: 201, json: record })
                }
                if (options.action) return options.action(route)
                const body = request.postDataJSON()
                if (path.endsWith('/triage/')) record = { ...record, status: body.status, priority: body.priority, assigned_to: body.assigned_to, assigned_to_display: 'Development manager', assigned_to_email: options.global ? 'manager@example.test' : null,
                    history: [...record.history, { id: 'status-1', kind: 'status', body: body.note, before: { status: 'open' }, after: { status: body.status }, created_by: 2, created_by_email: null, created_by_display: 'Development manager', created_at: '2026-10-15T09:00:00Z' }] }
                else record = { ...record, history: [...record.history, { id: `reply-${record.history.length}`, kind: 'message', body: body.body, before: null, after: null, created_by: 1, created_by_email: null, created_by_display: 'Example author', created_at: '2026-10-15T09:00:00Z' }] }
                return route.fulfill({ json: record })
            }
            reads.push(url)
            if (path.endsWith('/management_options/')) return route.fulfill({ json: { assignees: [{ id: 2, email: 'manager@example.test', name: 'Development manager' }], statuses: [], priorities: [] } })
            if (path !== '/api/platform-feedback/') return options.detailError ? route.fulfill({ status: 404, json: { detail: 'Not found.' } }) : route.fulfill({ json: record })
            return route.fulfill({ json: { count: options.count ?? 1, results: [record], next: options.count ? '/next' : null, previous: null } })
        }
        if (path.endsWith('/unread_count/')) return route.fulfill({ json: { unread_count: 0 } })
        return route.fulfill({ json: [] })
    })
    return { reads, writes, setRecord: (next: DevelopmentRequest) => { record = next } }
}
async function openCreate(page: Page) {
    await page.goto('/development-requests')
    await page.getByRole('button', { name: 'New request', exact: true }).first().click()
    return page.getByRole('dialog', { name: 'New proposal or development request' })
}

test('ordinary author sends solution proposal optional details and attachment without management fields', async ({ page }) => {
    const { writes } = await mock(page)
    const dialog = await openCreate(page)
    await dialog.getByLabel('Request type').selectOption('suggestion')
    await dialog.getByLabel('Related section').selectOption('excel')
    await dialog.getByRole('textbox', { name: 'Subject', exact: true }).fill('Highlight unmatched rows')
    await dialog.getByLabel('Need or issue encountered').fill('Rows need clearer explanations')
    await dialog.getByText('Add solution and benefit (optional)', { exact: true }).click()
    await dialog.getByLabel('Your proposed solution').fill('Show a review list')
    await dialog.getByLabel('Expected benefit').fill('Fewer mistakes')
    await dialog.getByLabel('Attachments', { exact: true }).setInputFiles({ name: 'sample.txt', mimeType: 'text/plain', buffer: Buffer.from('Fictional example') })
    await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Request saved' })).toContainText('My requests')
    expect(writes).toHaveLength(1)
    for (const value of ['suggestion', 'Show a review list', 'Fewer mistakes', 'sample.txt', '/development-requests']) expect(writes[0].body).toContain(value)
    for (const field of ['status', 'submitted_by', 'assigned_to', 'priority', 'user_agent']) expect(writes[0].body).not.toContain(`name="${field}"`)
    await page.getByRole('link', { name: 'Track request', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Request details' })).toContainText('Less manual checking.')
    await expect(page.getByRole('dialog').getByText('Review', { exact: true })).toHaveCount(0)
})

test('required fields and unsafe attachments fail before writing', async ({ page }) => {
    const { writes } = await mock(page)
    const dialog = await openCreate(page)
    await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Enter a subject')
    await dialog.getByLabel('Attachments', { exact: true }).setInputFiles({ name: 'script.html', mimeType: 'text/html', buffer: Buffer.from('<script/>') })
    await expect(dialog.getByRole('alert')).toContainText('not supported')
    await dialog.getByLabel('Attachments', { exact: true }).setInputFiles({ name: 'large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })
    await expect(dialog.getByRole('alert')).toContainText('5 MB or smaller')
    expect(writes).toHaveLength(0)
})

test('upload count and aggregate limits reject additional files preserving existing valid choices', async ({ page }) => {
    await mock(page)
    const dialog = await openCreate(page)
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `example${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from('sample') }))
    await dialog.getByLabel('Attachments', { exact: true }).setInputFiles(six)
    await expect(dialog.getByRole('alert')).toContainText('up to 5 files')
    const four = Array.from({ length: 4 }, (_, i) => ({ name: `example${i}.txt`, mimeType: 'text/plain', buffer: Buffer.alloc(4 * 1024 * 1024) }))
    await dialog.getByLabel('Attachments', { exact: true }).setInputFiles(four)
    await expect(dialog.getByRole('alert')).toContainText('15 MB or less')
    await dialog.getByLabel('Attachments', { exact: true }).setInputFiles(six.slice(0, 2))
    await expect(dialog.getByRole('button', { name: 'Remove example0.txt', exact: true })).toBeVisible()
    await dialog.getByLabel('Attachments', { exact: true }).setInputFiles(six)
    await expect(dialog.getByRole('button', { name: 'Remove example0.txt', exact: true })).toBeVisible()
})

test('failed create keeps draft and file so retry is possible', async ({ page }) => {
    await mock(page, { create: route => route.fulfill({ status: 400, json: { description: ['Explain the need more clearly.'] } }) })
    const dialog = await openCreate(page)
    await dialog.getByRole('textbox', { name: 'Subject', exact: true }).fill('Preserved subject')
    await dialog.getByLabel('Need or issue encountered').fill('Preserved description')
    await dialog.getByLabel('Attachments', { exact: true }).setInputFiles({ name: 'example.txt', mimeType: 'text/plain', buffer: Buffer.from('Fictional') })
    await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Explain the need more clearly.')
    await expect(dialog.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue('Preserved subject')
    await expect(dialog.getByRole('button', { name: 'Remove example.txt', exact: true })).toBeVisible()
})

test('launcher captures harmless path without query fragment or browser identity', async ({ page }) => {
    const { writes } = await mock(page)
    await page.goto('/notifications?secret=sample-private-token#another-private-token')
    await page.getByRole('button', { name: 'Proposal or development request', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'New proposal or development request' })
    await dialog.getByRole('textbox', { name: 'Subject', exact: true }).fill('Subject')
    await dialog.getByLabel('Need or issue encountered').fill('Need')
    await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Request saved' })).toBeVisible()
    expect(writes[0].body).toContain('/notifications')
    expect(writes[0].body).not.toContain('private-token')
    expect(writes[0].body).not.toContain('user_agent')
})

test('rate limit explains next step in Turkish and preserves request draft', async ({ page }) => {
    await mock(page, { language: 'tr', create: route => route.fulfill({ status: 429, headers: { 'Retry-After': '60' }, json: { detail: 'Request was throttled.' } }) })
    await page.goto('/development-requests')
    await page.getByRole('button', { name: 'Yeni talep', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Yeni öneri veya geliştirme talebi' })
    await dialog.getByRole('textbox', { name: 'Konu', exact: true }).fill('Korunan örnek konu')
    await dialog.getByLabel('İhtiyaç veya yaşanan sorun').fill('Kurmaca ihtiyaç açıklaması')
    await dialog.getByRole('button', { name: 'Talebi gönder', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Bir süre bekleyip yeniden deneyin')
    await expect(dialog.getByRole('textbox', { name: 'Konu', exact: true })).toHaveValue('Korunan örnek konu')
    await expect(dialog.getByLabel('İhtiyaç veya yaşanan sorun')).toHaveValue('Kurmaca ihtiyaç açıklaması')
    await expect(dialog.getByRole('button', { name: 'Talebi gönder', exact: true })).toBeEnabled()
})

test('filters search and pagination use page one when filters change', async ({ page }) => {
    const { reads } = await mock(page, { count: 49 })
    await page.goto('/development-requests')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect.poll(() => reads.at(-1)?.searchParams.get('page')).toBe('2')
    await page.getByLabel('Request type').selectOption('suggestion')
    await expect.poll(() => reads.at(-1)?.searchParams.get('page')).toBe('1')
    await page.getByLabel('Status', { exact: true }).selectOption('planned')
    await page.getByLabel('Search requests').fill('excel')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect.poll(() => reads.at(-1)?.searchParams.get('search')).toBe('excel')
    expect(reads.at(-1)?.searchParams.get('status')).toBe('planned')
    expect(reads.at(-1)?.searchParams.get('type')).toBe('suggestion')
})

test('global admin manages status priority owner note then private conversation', async ({ page }) => {
    const { writes } = await mock(page, { global: true })
    await page.goto(`/development-requests?request=${id}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await dialog.getByLabel('Status', { exact: true }).selectOption('planned')
    await dialog.getByLabel('Priority', { exact: true }).selectOption('high')
    await dialog.getByLabel('Responsible person', { exact: true }).selectOption('2')
    await dialog.getByLabel('Review explanation').fill('Planned after import review')
    await dialog.getByRole('button', { name: 'Save review', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Review saved.')
    await expect(dialog).toContainText('Status updated: Planned')
    expect(JSON.parse(writes[0].body)).toEqual({ status: 'planned', priority: 'high', assigned_to: 2, note: 'Planned after import review' })
    await dialog.getByLabel('Your reply').fill('Please attach a fictional example')
    await dialog.getByRole('button', { name: 'Send reply', exact: true }).click()
    await expect(dialog).toContainText('Please attach a fictional example')
    expect(JSON.parse(writes[1].body)).toEqual({ body: 'Please attach a fictional example' })
})

test('author reply supports safe display names and cannot triage', async ({ page }) => {
    const control = await mock(page)
    control.setRecord({ ...example, assigned_to: 2, assigned_to_display: 'Development team', assigned_to_email: null, history: [{ id: 'example-reply', kind: 'message', body: 'We are reviewing your need.', before: null, after: null, created_by: 2, created_by_email: null, created_by_display: 'Development team', created_at: '2026-10-15T09:00:00Z' }] })
    await page.goto(`/development-requests?request=${id}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await expect(dialog).toContainText('Development team')
    await expect(dialog.getByRole('button', { name: 'Save review', exact: true })).toHaveCount(0)
    expect(control.reads.some(url => url.pathname.endsWith('/management_options/'))).toBe(false)
    await dialog.getByLabel('Your reply').fill('Thanks, the example is ready')
    await dialog.getByRole('button', { name: 'Send reply', exact: true }).click()
    await expect(dialog).toContainText('Thanks, the example is ready')
    await expect(dialog.getByLabel('Your reply')).toHaveValue('')
    await expect(dialog).not.toContainText('manager@example.test')
})

test('unassigned role-only account has no launcher or request network access', async ({ page }) => {
    const { reads } = await mock(page, { unassigned: true })
    await page.goto('/development-requests')
    await expect(page.getByText('Shipyard account required', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New request', exact: true })).toHaveCount(0)
    await page.goto('/notifications')
    await expect(page.getByRole('button', { name: 'Proposal or development request', exact: true })).toHaveCount(0)
    expect(reads).toHaveLength(0)
})

test('tenant superuser has author view and inaccessible linked detail reveals no content', async ({ page }) => {
    const { reads } = await mock(page, { tenantSuperuser: true, detailError: true })
    await page.goto(`/development-requests?request=${id}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await expect(dialog).toContainText('not found or you do not have access')
    await expect(dialog).not.toContainText('Highlight unmatched rows.')
    expect(reads.some(url => url.pathname.endsWith('/management_options/'))).toBe(false)
    await expect(page.getByText('Only your own records are visible.', { exact: false })).toBeVisible()
})

test('reply network failure preserves draft', async ({ page }) => {
    await mock(page, { action: route => route.fulfill({ status: 503, json: { detail: 'Service busy. Try again.' } }) })
    await page.goto(`/development-requests?request=${id}`)
    const dialog = page.getByRole('dialog', { name: 'Request details' })
    await dialog.getByLabel('Your reply').fill('Keep my reply')
    await dialog.getByRole('button', { name: 'Send reply', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Service busy')
    await expect(dialog.getByLabel('Your reply')).toHaveValue('Keep my reply')
})

test('320px page and dialog keep controls within viewport with keyboard close', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await mock(page)
    const dialog = await openCreate(page)
    await expect(dialog).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})


test('pending write blocks dismissal and preserves a single submission', async ({ page }) => {
    let finish: () => void = () => {}
    const gate = new Promise<void>(resolve => { finish = resolve })
    const { writes } = await mock(page, { create: async route => { await gate; await route.fulfill({ status: 201, json: example }) } })
    const dialog = await openCreate(page)
    await dialog.getByRole('textbox', { name: 'Subject', exact: true }).fill('Subject')
    await dialog.getByRole('textbox', { name: 'Need or issue encountered', exact: true }).fill('Need')
    await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
    try {
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
        await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
        await page.keyboard.press('Escape')
        await expect(dialog).toBeVisible()
        await dialog.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
        expect(writes).toHaveLength(1)
    } finally { finish() }
    await expect(page.getByRole('dialog', { name: 'Request saved' })).toBeVisible()
    expect(writes).toHaveLength(1)
})

test('Turkish labels describe proposals and optional solution without technical jargon', async ({ page }) => {
    await mock(page, { language: 'tr' })
    await page.goto('/development-requests')
    await expect(page.getByRole('heading', { name: 'Çözüm önerileri ve geliştirme talepleri', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Yeni talep', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Yeni öneri veya geliştirme talebi' })
    await expect(dialog.getByRole('textbox', { name: 'İhtiyaç veya yaşanan sorun', exact: true })).toBeVisible()
    await expect(dialog).toContainText('Çözüm ve fayda ekle (isteğe bağlı)')
    await expect(dialog).toContainText('dosya başına 5 MB')
})
