import { expect, test, type Page } from '@playwright/test'

const categories = [
    { code: 'J', name: 'Mechanical workshop equipment', count: 1 },
    { code: 'K', name: 'Electric and hand tools', count: 3 },
    { code: 'L', name: 'Occupational safety equipment', count: 5 },
    { code: 'M', name: 'Environmental equipment', count: 1 },
]

const equipmentTypes = categories.flatMap(category => Array.from({ length: category.count }, (_, index) => ({
    id: `layout-${category.code}-${index}`,
    name: index === 0 ? `${category.code} Portable equipment for shipyard maintenance and workshop operations` : `${category.code} Tool ${index + 1}`,
    catalog_code: `${category.code}-LAYOUT-${index + 1}`,
    category_code: category.code,
    sharing_class: 'B',
    sharing_excluded: index === 0,
    exclusion_reason: index === 0 ? 'Personal equipment excluded from sharing.' : '',
    description: index === 0 ? 'Equipment with a longer description covering technical capacity, workshop use and a maintenance assessment before sharing across shipyards.' : index === 1 ? '' : 'Workshop equipment.',
    schema: [{ key: 'code', label: 'Equipment code', type: 'text', required: true, is_unique_key: true }],
})))

async function mockCatalog(page: Page) {
    const writes: string[] = []
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('theme', 'light')
    })
    await page.route('**/_allauth/browser/v1/**', async route => {
        const config = new URL(route.request().url()).pathname.endsWith('/config')
        await route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: config ? {
            account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] },
        } : {
            user: { id: '1', username: 'layout', email: 'layout@example.test', role: 'platform_admin', tenant_slug: 'test-yard', tenant_name: 'Test Yard' },
            methods: [],
        } } })
    })
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (request.method() !== 'GET') writes.push(`${request.method()} ${path}`)
        if (path.endsWith('/stream/')) return route.abort()
        await route.fulfill({ json: path === '/api/assets/types/' ? equipmentTypes : path.endsWith('/unread_count/') ? { unread_count: 0 } : [] })
    })
    return writes
}

for (const width of [1440, 900, 390, 320]) {
    test(`catalog categories stay vertically ordered without gaps or overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        const writes = await mockCatalog(page)
        await page.goto('/assets/types')
        await expect(page.getByRole('region', { name: categories[0].name, exact: true })).toBeVisible()

        const sectionBoxes: { x: number; y: number; width: number; height: number }[] = []
        for (const category of categories) {
            const region = page.getByRole('region', { name: category.name, exact: true })
            const cards = region.getByRole('listitem')
            await expect(cards).toHaveCount(category.count)
            const regionBox = await region.boundingBox()
            expect(regionBox).not.toBeNull()
            sectionBoxes.push(regionBox!)
            const availableWidth = await region.evaluate(element => element.parentElement!.getBoundingClientRect().width)
            expect(Math.abs(regionBox!.width - availableWidth)).toBeLessThanOrEqual(1)

            const rows = new Map<number, number[]>()
            for (let index = 0; index < category.count; index += 1) {
                const card = cards.nth(index)
                const box = await card.boundingBox()
                const titleBox = await card.getByRole('button').first().boundingBox()
                const footerBox = await card.getByRole('button', { name: /^View equipment type:/ }).boundingBox()
                expect(box).not.toBeNull()
                expect(titleBox).not.toBeNull()
                expect(footerBox).not.toBeNull()
                expect(titleBox!.x).toBeGreaterThanOrEqual(box!.x)
                expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(box!.x + box!.width + 1)
                expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(box!.y + box!.height)
                if (index === 0) {
                    const badgeBox = await card.getByText('Excluded', { exact: true }).boundingBox()
                    expect(badgeBox).not.toBeNull()
                    expect(badgeBox!.x).toBeGreaterThanOrEqual(box!.x)
                    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(box!.x + box!.width + 1)
                }
                const rowTop = Math.round(box!.y)
                const footers = rows.get(rowTop) ?? []
                footers.push(footerBox!.y)
                rows.set(rowTop, footers)
            }
            if (category.code === 'K') {
                const expectedFirstRowCount = width >= 1280 ? 3 : width >= 640 ? 2 : 1
                expect([...rows.values()][0]).toHaveLength(expectedFirstRowCount)
                for (const footers of rows.values()) {
                    expect(Math.max(...footers) - Math.min(...footers)).toBeLessThanOrEqual(1)
                }
            }
        }

        for (let index = 1; index < sectionBoxes.length; index += 1) {
            const previous = sectionBoxes[index - 1]
            const current = sectionBoxes[index]
            expect(Math.abs(current.x - previous.x)).toBeLessThanOrEqual(1)
            expect(Math.abs(current.width - previous.width)).toBeLessThanOrEqual(1)
            const gap = current.y - previous.y - previous.height
            expect(gap).toBeGreaterThanOrEqual(16)
            expect(gap).toBeLessThanOrEqual(40)
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(1)

        if (width === 1440) {
            const type = equipmentTypes.find(item => item.category_code === 'K')!
            await page.getByRole('button', { name: `View equipment type: ${type.name}`, exact: true }).click()
            const dialog = page.getByRole('dialog', { name: type.name, exact: true })
            await expect(dialog).toBeVisible()
            await expect(dialog.getByText(type.catalog_code, { exact: true })).toBeVisible()
            await page.keyboard.press('Escape')
            await expect(dialog).not.toBeVisible()
            await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('K')
            await expect(page.getByRole('region', { name: categories[1].name, exact: true }).getByRole('listitem')).toHaveCount(3)
            await expect(page.getByRole('region', { name: categories[0].name, exact: true })).toHaveCount(0)
            await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
            await expect(page.getByRole('region', { name: categories[0].name, exact: true })).toBeVisible()
        }
        expect(writes).toEqual([])
    })
}
