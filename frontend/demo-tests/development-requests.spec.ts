import path from 'node:path'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// Existing demo requests can contain private data. Capture only this test's
// fictional request dialog, and delete only the exact record created here.
test.use({ screenshot: 'off', trace: 'off', video: 'off', actionTimeout: 10000, navigationTimeout: 15000 })

const baseURL = 'http://127.0.0.1:5190'
const endpoint = '/api/platform-feedback/'

interface RequestRecord {
    id: string
    type: string
    status: string
    priority: string
    assigned_to: number | string | null
    assigned_to_email: string | null
    subject: string
    description: string
    proposed_solution: string
    expected_benefit: string
    page_url: string
    attachments: { id: string; original_name: string; url: string }[]
    history: { kind: string; body: string; created_by_email: string | null }[]
    allowed_actions: string[]
}

interface NotificationRecord {
    content: { feedback_id?: string; url?: string; [key: string]: unknown }
}

async function login(page: Page, email: string) {
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('vite-ui-theme', 'light')
    })
    await page.goto('/login')
    await page.locator('#login-email').fill(email)
    await page.locator('#login-password').fill('GisasDemo!2026')
    await page.locator('button[type=submit]').click()
    await expect(page).toHaveURL(/\/dashboard$/)
}

async function csrf(page: Page) {
    const cookies = await page.context().cookies()
    return { 'X-CSRFToken': cookies.find(cookie => cookie.name === 'csrftoken')?.value ?? '', Referer: `${baseURL}/` }
}

function localPath(url: string) {
    const parsed = new URL(url, baseURL)
    return `${parsed.pathname}${parsed.search}`
}

async function recordIDs(page: Page) {
    const ids: string[] = []
    let next: string | null = endpoint
    while (next) {
        const response = await page.request.get(localPath(next))
        expect(response.status()).toBe(200)
        const data: { results: { id: string }[]; next: string | null } = await response.json()
        ids.push(...data.results.map(record => record.id))
        next = data.next
    }
    return ids.sort()
}

class RequestsPage {
    readonly page: Page

    constructor(page: Page) { this.page = page }

    async open(id: string) {
        await this.page.goto(`/development-requests?request=${id}`)
        return this.page.getByRole('dialog', { name: 'Request details', exact: true })
    }

    async createProposal(subject: string, description: string, solution: string, benefit: string, attachment: Buffer, onCreated: (record: RequestRecord) => void) {
        await this.page.goto('/development-requests?context=fictional-sensitive-context#fictional-private-note')
        await this.page.getByRole('button', { name: 'New request', exact: true }).first().click()
        const dialog = this.page.getByRole('dialog', { name: 'New proposal or development request', exact: true })
        await dialog.getByLabel('Request type', { exact: true }).selectOption('suggestion')
        await dialog.getByLabel('Related section', { exact: true }).selectOption('excel')
        await dialog.getByRole('textbox', { name: 'Subject', exact: true }).fill(subject)
        await dialog.getByRole('textbox', { name: 'Need or issue encountered', exact: true }).fill(description)
        await dialog.getByText('Add solution and benefit (optional)', { exact: true }).click()
        await dialog.getByLabel('Your proposed solution', { exact: true }).fill(solution)
        await dialog.getByLabel('Expected benefit', { exact: true }).fill(benefit)
        await dialog.getByLabel('Attachments', { exact: true }).setInputFiles({
            name: 'fictional-proposal.txt', mimeType: 'text/plain', buffer: attachment,
        })
        const created = this.page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === 'POST')
        await dialog.getByRole('button', { name: 'Send request', exact: true }).click()
        const response = await created
        expect(response.status()).toBe(201)
        const record: RequestRecord = await response.json()
        onCreated(record)
        await expect(this.page.getByRole('dialog', { name: 'Request saved', exact: true })).toContainText(subject)
        return record
    }
}

test.beforeAll(async ({ request }) => {
    const response = await request.get('/demo/health/')
    expect(response.ok(), 'Start the isolated local demo before running this acceptance test').toBeTruthy()
    expect(await response.json()).toMatchObject({ demo: true, status: 'ready' })
})

test('real solution proposal remains private, receives review and replies, and notifies its author', async ({ page, browser }) => {
    test.setTimeout(90000)
    await login(page, 'admin@demo.gisas.test')
    const before = await recordIDs(page)
    const contexts: BrowserContext[] = []
    let fixture: RequestRecord | undefined
    const nonce = `DEMO-ACCEPT-PROPOSAL-${Date.now()}`
    const subject = `Fictional Excel preview proposal ${nonce}`
    const description = 'Fictional staff need to review equipment counts before importing their workbook.'
    const solution = 'Show a clear preview separating new records, updates and skipped totals.'
    const benefit = 'Reduce manual counting and help staff correct their workbook before saving.'
    const attachment = Buffer.from(`Fictional acceptance attachment only. ${nonce}\n`)
    const reply = `Fictional response: workbook review improvement is planned. ${nonce}`
    const followUp = `Fictional author reply: the proposed preview meets our need. ${nonce}`

    async function actor(email: string) {
        const context = await browser.newContext({ baseURL })
        contexts.push(context)
        const actorPage = await context.newPage()
        await login(actorPage, email)
        return actorPage
    }

    try {
        const author = await actor('personel@demo.gisas.test')
        fixture = await new RequestsPage(author).createProposal(subject, description, solution, benefit, attachment, record => { fixture = record })
        expect(fixture).toMatchObject({ type: 'suggestion', status: 'open', priority: 'normal', subject,
            description, proposed_solution: solution, expected_benefit: benefit, page_url: '/development-requests',
            allowed_actions: ['message'], assigned_to: null })
        expect(fixture.attachments).toHaveLength(1)
        expect(fixture.attachments[0].original_name).toBe('fictional-proposal.txt')
        expect(fixture.history.map(event => event.kind)).toEqual(['created'])
        expect(fixture.page_url).not.toMatch(/[?#]/)
        const attachmentURL = localPath(fixture.attachments[0].url)
        const authorFile = await author.request.get(attachmentURL)
        expect(authorFile.status()).toBe(200)
        expect(await authorFile.body()).toEqual(attachment)
        expect(authorFile.headers()['content-disposition']).toContain('attachment')
        expect(authorFile.headers()['cache-control']).toContain('no-store')
        expect((await author.request.patch(`${endpoint}${fixture.id}/`, { headers: await csrf(author), data: { status: 'done' } })).status()).toBe(403)
        expect((await author.request.get(`${endpoint}management_options/`)).status()).toBe(403)

        // A manager in the same shipyard still cannot read another person's request.
        const sameYard = await actor('yonetici@demo.gisas.test')
        const otherYard = await actor('diger@demo.gisas.test')
        for (const unrelated of [sameYard, otherYard]) {
            expect((await unrelated.request.get(`${endpoint}${fixture.id}/`)).status()).toBe(404)
            expect((await unrelated.request.get(attachmentURL)).status()).toBe(404)
            const list = await unrelated.request.get(`${endpoint}?search=${encodeURIComponent(nonce)}`)
            expect(list.status()).toBe(200)
            expect(await list.json()).toMatchObject({ count: 0, results: [] })
        }

        const optionsResponse = await page.request.get(`${endpoint}management_options/`)
        expect(optionsResponse.status()).toBe(200)
        const options: { assignees: { id: number | string; email: string }[] } = await optionsResponse.json()
        const administrator = options.assignees.find(user => user.email === 'admin@demo.gisas.test')
        expect(administrator).toBeDefined()
        const managed = await new RequestsPage(page).open(fixture.id)
        await expect(managed).toContainText(subject)
        await expect(managed).toContainText(solution)
        const review = managed.getByRole('region', { name: 'Review', exact: true })
        await review.getByLabel('Status', { exact: true }).selectOption('planned')
        await review.getByLabel('Responsible person', { exact: true }).selectOption(String(administrator!.id))
        await review.getByLabel('Priority', { exact: true }).selectOption('high')
        await review.getByLabel('Review explanation', { exact: true }).fill('Fictional review: improvement accepted for planning.')
        const reviewed = page.waitForResponse(response => new URL(response.url()).pathname === `${endpoint}${fixture!.id}/triage/` && response.request().method() === 'POST')
        await review.getByRole('button', { name: 'Save review', exact: true }).click()
        const reviewedResponse = await reviewed
        expect(reviewedResponse.status()).toBe(200)
        expect(await reviewedResponse.json()).toMatchObject({ status: 'planned', priority: 'high', assigned_to: administrator!.id })
        await managed.getByLabel('Your reply', { exact: true }).fill(reply)
        const answered = page.waitForResponse(response => new URL(response.url()).pathname === `${endpoint}${fixture!.id}/messages/` && response.request().method() === 'POST')
        await managed.getByRole('button', { name: 'Send reply', exact: true }).click()
        expect((await answered).status()).toBe(200)
        await expect(managed.getByRole('region', { name: 'Responses and progress', exact: true }).getByText(reply, { exact: true })).toBeVisible()

        const authorDetails = await new RequestsPage(author).open(fixture.id)
        await expect(authorDetails.getByText('Planned', { exact: true })).toBeVisible()
        await expect(authorDetails.getByRole('region', { name: 'Responses and progress', exact: true }).getByText(reply, { exact: true })).toBeVisible()
        await expect(authorDetails.getByRole('region', { name: 'Review', exact: true })).toHaveCount(0)
        await expect(authorDetails).not.toContainText('admin@demo.gisas.test')
        const authorResponse = await author.request.get(`${endpoint}${fixture.id}/`)
        expect(authorResponse.status()).toBe(200)
        const visible: RequestRecord = await authorResponse.json()
        expect(visible).toMatchObject({ status: 'planned', priority: 'high', assigned_to_email: null, allowed_actions: ['message'] })
        expect(JSON.stringify(visible)).not.toContain('admin@demo.gisas.test')
        expect(visible.history.some(event => event.kind === 'status')).toBe(true)
        expect(visible.history.some(event => event.kind === 'assignment')).toBe(true)
        expect(visible.history.some(event => event.kind === 'message' && event.body === reply)).toBe(true)
        await authorDetails.getByLabel('Your reply', { exact: true }).fill(followUp)
        const authorReply = author.waitForResponse(response => new URL(response.url()).pathname === `${endpoint}${fixture!.id}/messages/` && response.request().method() === 'POST')
        await authorDetails.getByRole('button', { name: 'Send reply', exact: true }).click()
        expect((await authorReply).status()).toBe(200)
        await expect(authorDetails.getByRole('region', { name: 'Responses and progress', exact: true }).getByText(followUp, { exact: true })).toBeVisible()

        const notifications = await author.request.get('/api/notifications/?limit=100')
        expect(notifications.status()).toBe(200)
        const data: { results: NotificationRecord[] } = await notifications.json()
        const ours = data.results.filter(item => item.content.feedback_id === fixture!.id)
        expect(ours.length).toBeGreaterThan(0)
        for (const notification of ours) {
            expect(notification.content.url).toBe(`/development-requests?request=${fixture.id}`)
            expect(JSON.stringify(notification.content)).not.toContain(subject)
            expect(JSON.stringify(notification.content)).not.toContain(reply)
            expect(JSON.stringify(notification.content)).not.toContain('fictional-proposal.txt')
        }
        await author.setViewportSize({ width: 1280, height: 1100 })
        await authorDetails.getByRole('heading', { name: subject, exact: true }).scrollIntoViewIfNeeded()
        await authorDetails.screenshot({ path: path.resolve('..', 'var', 'demo', 'screenshots', 'development-request-detail.png') })
    } finally {
        try {
            if (fixture) {
                const current = await page.request.get(`${endpoint}${fixture.id}/`)
                expect(current.status()).toBe(200)
                expect((await current.json()).subject).toBe(subject)
                const deleted = await page.request.delete(`${endpoint}${fixture.id}/`, { headers: await csrf(page) })
                expect(deleted.status()).toBe(204)
                expect((await page.request.get(`${endpoint}${fixture.id}/`)).status()).toBe(404)
            }
        } finally {
            await Promise.allSettled(contexts.map(context => context.close()))
        }
        expect(await recordIDs(page)).toEqual(before)
    }
})
