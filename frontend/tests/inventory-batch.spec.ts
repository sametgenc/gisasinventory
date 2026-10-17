import { expect, test, type Locator, type Page } from '@playwright/test'

interface BatchRow {
    asset_type: string
    quantity: number
    custom_data: Record<string, unknown>
    tenant?: number
}

interface BatchRequest {
    operation_id: string
    rows: BatchRow[]
}

async function openBatch(page: Page, query = '') {
    await page.addInitScript(() => {
        localStorage.setItem('language', 'en')
        localStorage.setItem('vite-ui-theme', 'light')
    })
    await page.goto(`/tests/inventory-batch.html${query}`)
    const dialog = page.getByRole('dialog', { name: 'Add equipment', exact: true })
    await expect(dialog).toBeVisible()
    return dialog
}

async function chooseType(row: Locator, name: string) {
    await row.getByRole('combobox', { name: 'Equipment type', exact: true }).fill(name)
    await row.getByRole('option').filter({ hasText: name }).click()
}

async function captureBatch(page: Page, status = 201, detail?: string) {
    const requests: BatchRequest[] = []
    await page.route('**/api/assets/items/batch_create/', async route => {
        expect(route.request().method()).toBe('POST')
        requests.push(route.request().postDataJSON() as BatchRequest)
        await route.fulfill({ status, json: detail ? { detail } : { created_count: 80, assets: [] } })
    })
    return requests
}

test('50 cranes and 30 generators save together while untouched optional fields remain omitted', async ({ page }) => {
    const requests = await captureBatch(page)
    const dialog = await openBatch(page)
    const first = dialog.getByRole('region', { name: 'Line 1', exact: true })
    await chooseType(first, 'Example crane')
    await first.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('50')
    await expect(first.locator('details')).not.toHaveAttribute('open', '')
    await expect(first.getByRole('spinbutton', { name: 'Capacity in tonnes' })).not.toBeVisible()
    await dialog.getByRole('button', { name: 'Add another equipment type', exact: true }).click()
    const second = dialog.getByRole('region', { name: 'Line 2', exact: true })
    await chooseType(second, 'Example generator')
    await second.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('30')
    await expect(dialog).toContainText('80 individual equipment')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Inventory saved' })).toBeVisible()
    expect(requests).toHaveLength(1)
    expect(requests[0].operation_id).toMatch(/^[\da-f-]{36}$/i)
    expect(requests[0].rows).toEqual([
        { asset_type: 'example-crane', quantity: 50, custom_data: {} },
        { asset_type: 'example-generator', quantity: 30, custom_data: {} },
    ])
})

test('required catalog properties stay visible and block writes until valid', async ({ page }) => {
    const requests = await captureBatch(page)
    const dialog = await openBatch(page, '?type=required-equipment')
    const voltage = dialog.getByRole('spinbutton', { name: 'Operating voltage', exact: true })
    await expect(voltage).toBeVisible()
    await expect(voltage).toHaveAttribute('required', '')
    await expect(dialog.getByRole('textbox', { name: 'Maintenance note', exact: true })).not.toBeVisible()
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    expect(await voltage.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true)
    expect(requests).toHaveLength(0)
    await voltage.fill('380')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(page.getByText('Inventory saved', { exact: true })).toBeVisible()
    expect(requests[0].rows).toEqual([{ asset_type: 'required-equipment', quantity: 1, custom_data: { voltage: '380' } }])
})

test('per-unit identifiers reject repeated values and accept distinct identifiers without copying one serial', async ({ page }) => {
    const requests = await captureBatch(page)
    const dialog = await openBatch(page, '?type=unique-equipment')
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('2')
    const serials = dialog.getByRole('textbox', { name: 'Unique serial', exact: true })
    await expect(serials).toHaveJSProperty('tagName', 'TEXTAREA')
    await serials.fill('EX-SERIAL-1\nEX-SERIAL-1')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Per-unit values must be distinct and their count must match the quantity.')
    expect(requests).toHaveLength(0)
    await serials.fill('EX-SERIAL-1\nEX-SERIAL-2')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(page.getByText('Inventory saved', { exact: true })).toBeVisible()
    expect(requests).toHaveLength(1)
    expect(requests[0].rows).toEqual([
        { asset_type: 'unique-equipment', quantity: 1, custom_data: { serial: 'EX-SERIAL-1' } },
        { asset_type: 'unique-equipment', quantity: 1, custom_data: { serial: 'EX-SERIAL-2' } },
    ])
})

test('an unchecked required boolean submits false rather than a missing required value', async ({ page }) => {
    const requests = await captureBatch(page)
    const dialog = await openBatch(page, '?type=required-flag')
    const outdoor = dialog.getByRole('checkbox', { name: 'Outdoor equipment', exact: true })
    await expect(outdoor).toBeVisible()
    await expect(outdoor).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(page.getByText('Inventory saved', { exact: true })).toBeVisible()
    expect(requests[0].rows[0].custom_data).toEqual({ outdoor: false })
})

test('numeric identifiers preserve digits beyond the JavaScript safe integer range', async ({ page }) => {
    const requests = await captureBatch(page)
    const dialog = await openBatch(page, '?type=numeric-identifier')
    await dialog.getByRole('spinbutton', { name: 'Numeric serial', exact: true }).fill('9007199254740993')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(page.getByText('Inventory saved', { exact: true })).toBeVisible()
    expect(requests[0].rows[0].custom_data.serial).toBe('9007199254740993')
})

test('reducing quantity preserves visible pasted serials until the user reconciles them', async ({ page }) => {
    const requests = await captureBatch(page)
    const dialog = await openBatch(page, '?type=unique-equipment')
    const quantity = dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })
    await quantity.fill('2')
    await dialog.getByRole('textbox', { name: 'Unique serial', exact: true }).fill('ID-A\nID-B')
    await quantity.fill('1')
    const serial = dialog.getByRole('textbox', { name: 'Unique serial', exact: true })
    await expect(serial).toHaveValue('ID-A\nID-B')
    await expect(serial).toHaveJSProperty('tagName', 'TEXTAREA')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('their count must match the quantity')
    expect(requests).toHaveLength(0)
    await serial.fill('ID-A')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(page.getByText('Inventory saved', { exact: true })).toBeVisible()
    expect(requests[0].rows[0].custom_data.serial).toBe('ID-A')
})

test('expanded identifier errors point to the visible line and field label', async ({ page }) => {
    await page.route('**/api/assets/items/batch_create/', route => route.fulfill({ status: 400, json: {
        detail: 'Review the voltage.', rows: [{ row: 3, errors: { custom_data: { voltage: ['Voltage not supported.'] } } }],
    } }))
    const dialog = await openBatch(page, '?type=unique-equipment')
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('2')
    await dialog.getByRole('textbox', { name: 'Unique serial', exact: true }).fill('ID-A\nID-B')
    await dialog.getByRole('button', { name: 'Add another equipment type', exact: true }).click()
    const second = dialog.getByRole('region', { name: 'Line 2', exact: true })
    await chooseType(second, 'Equipment with required field')
    await second.getByRole('spinbutton', { name: 'Operating voltage', exact: true }).fill('380')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Line 2: Operating voltage: Voltage not supported.')
    await expect(dialog.getByRole('alert')).not.toContainText('Line 3')
})

test('more than fifty per-unit identifiers use the same five-hundred record allowance', async ({ page }) => {
    const requests = await captureBatch(page)
    const dialog = await openBatch(page, '?type=unique-equipment')
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('80')
    await dialog.getByRole('textbox', { name: 'Unique serial', exact: true }).fill(Array.from({ length: 80 }, (_, index) => `ID-${index + 1}`).join('\n'))
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(page.getByText('Inventory saved', { exact: true })).toBeVisible()
    expect(requests[0].rows).toHaveLength(80)
    expect(new Set(requests[0].rows.map(row => row.custom_data.serial)).size).toBe(80)
})

test('platform administration requires an explicit owner yard for every batch row', async ({ page }) => {
    const requests = await captureBatch(page)
    const dialog = await openBatch(page, '?global=true&type=example-generator')
    const save = dialog.getByRole('button', { name: 'Add to inventory', exact: true })
    await expect(save).toBeDisabled()
    await dialog.getByRole('combobox', { name: 'Shipyard that owns these records', exact: true }).selectOption('2')
    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.getByText('Inventory saved', { exact: true })).toBeVisible()
    expect(requests[0].rows[0].tenant).toBe(2)
})

test('empty type and nonpositive, fractional or missing quantities cannot be submitted', async ({ page }) => {
    const requests = await captureBatch(page)
    const dialog = await openBatch(page)
    const save = dialog.getByRole('button', { name: 'Add to inventory', exact: true })
    await expect(save).toBeDisabled()
    const row = dialog.getByRole('region', { name: 'Line 1', exact: true })
    await chooseType(row, 'Example generator')
    for (const invalid of ['', '0', '-1', '1.5']) {
        await row.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill(invalid)
        await expect(save).toBeDisabled()
    }
    expect(requests).toHaveLength(0)
})

test('server errors retain every row and permit a corrected retry with the same operation identity', async ({ page }) => {
    const requests: BatchRequest[] = []
    await page.route('**/api/assets/items/batch_create/', async route => {
        requests.push(route.request().postDataJSON() as BatchRequest)
        await route.fulfill(requests.length === 1
            ? { status: 400, json: { detail: 'Example inventory validation failed.', rows: [{ row: 2, errors: { custom_data: ['Review this equipment.'] } }] } }
            : { status: 201, json: { created_count: 80, assets: [] } })
    })
    const dialog = await openBatch(page, '?type=example-generator')
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('50')
    await dialog.getByRole('button', { name: 'Add another equipment type', exact: true }).click()
    const second = dialog.getByRole('region', { name: 'Line 2', exact: true })
    await chooseType(second, 'Example crane')
    await second.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('30')
    const save = dialog.getByRole('button', { name: 'Add to inventory', exact: true })
    await save.click()
    await expect(dialog.getByRole('alert')).toContainText('Example inventory validation failed.')
    await expect(dialog.getByRole('alert')).toContainText('Line 2')
    await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).nth(0)).toHaveValue('50')
    await expect(second.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('30')
    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.getByText('Inventory saved', { exact: true })).toBeVisible()
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
})

test('a conflicting batch stops resubmission and retains entered quantities for inspection', async ({ page }) => {
    const requests = await captureBatch(page, 409, 'Operation exists.')
    const dialog = await openBatch(page, '?type=example-generator')
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('12')
    const save = dialog.getByRole('button', { name: 'Add to inventory', exact: true })
    await save.click()
    await expect(dialog.getByRole('alert')).toContainText('Close this window and refresh inventory')
    await expect(save).toBeDisabled()
    await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('12')
    expect(requests).toHaveLength(1)
})

test('stock quantities remain one batch line instead of becoming individual equipment records', async ({ page }) => {
    const requests = await captureBatch(page)
    const dialog = await openBatch(page, '?type=stock-material')
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('12000')
    await expect(dialog).toContainText('one stock record')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(page.getByText('Inventory saved', { exact: true })).toBeVisible()
    expect(requests[0].rows).toEqual([{ asset_type: 'stock-material', quantity: 12000, custom_data: {} }])
})

for (const width of [320, 390]) {
    test(`batch entry with optional properties stays usable without overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await captureBatch(page)
        const dialog = await openBatch(page, '?type=example-crane')
        await dialog.locator('summary').filter({ hasText: 'Optional properties' }).click()
        await dialog.getByRole('spinbutton', { name: 'Capacity in tonnes', exact: true }).fill('20')
        await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('50')
        await expect(dialog.getByRole('spinbutton', { name: 'Capacity in tonnes', exact: true })).toHaveValue('20')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const bounds = await dialog.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
        await expect(page.getByText('Inventory saved', { exact: true })).toBeVisible()
    })
}
