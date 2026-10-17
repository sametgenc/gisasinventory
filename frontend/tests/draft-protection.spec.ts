import { expect, test, type Page } from '@playwright/test'

const forms = ['batch', 'asset', 'type', 'tenant', 'user', 'sharing', 'usage', 'workbook', 'catalog', 'feedback'] as const

async function openForm(page: Page, form: string) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.goto(`/tests/draft-protection.html?form=${form}`)
    await expect(page.getByRole('dialog')).toHaveCount(1)
    return page.getByRole('dialog').first()
}

for (const form of forms) {
    test(`${form}: unchanged form closes without confirmation`, async ({ page }) => {
        await openForm(page, form)
        await page.keyboard.press('Escape')
        await expect(page.getByText('Form closed', { exact: true })).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)
    })

    test(`${form}: keep editing preserves draft; explicit discard closes it`, async ({ page }) => {
        const dialog = await openForm(page, form)
        const file = form === 'workbook' || form === 'catalog'
        const field = form === 'batch' ? dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })
            : file ? dialog.locator('input[type="file"]') : dialog.getByRole('textbox').first()
        if (file) await field.setInputFiles({ name: 'draft.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('draft fixture') })
        else await field.fill(form === 'batch' || form === 'usage' ? '2' : 'Keep my draft')
        await page.keyboard.press('Escape')
        const confirmation = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })
        await expect(confirmation).toBeVisible()
        await confirmation.getByRole('button', { name: 'Keep editing', exact: true }).click()
        await expect(confirmation).not.toBeVisible()
        if (file) expect(await field.evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe('draft.xlsx')
        else await expect(field).toHaveValue(form === 'batch' || form === 'usage' ? '2' : 'Keep my draft')
        await dialog.getByRole('button', { name: 'Close', exact: true }).first().click()
        await expect(confirmation).toBeVisible()
        await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click()
        await expect(page.getByText('Form closed', { exact: true })).toBeVisible()
    })
}

test('batch: cancel/backdrop protect draft and repeated Escape cancels only confirmation', async ({ page }) => {
    const dialog = await openForm(page, 'batch')
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('12')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })
    await expect(confirmation).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(confirmation).not.toBeVisible()
    await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('12')
    await page.mouse.click(2, 2)
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('12')
})

test('user: password remains in memory during confirmation and never enters storage', async ({ page }) => {
    const dialog = await openForm(page, 'user')
    const password = dialog.locator('input[type="password"]').first()
    await password.fill('Transient-secret-123!')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(password).toHaveValue('Transient-secret-123!')
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Transient-secret')
})

test('batch: browser departure is protected only while dirty', async ({ page }) => {
    const dialog = await openForm(page, 'batch')
    expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented })).toBe(false)
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('2')
    expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented })).toBe(true)
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('1')
    expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented })).toBe(false)
})

test('batch: in-flight write cannot be dismissed; success closes without discard prompt', async ({ page }) => {
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve })
    await page.route('**/api/assets/items/batch_create/', async route => { await gate; await route.fulfill({ status: 201, json: { created_count: 1, assets: [] } }) })
    const dialog = await openForm(page, 'batch')
    await dialog.getByRole('textbox', { name: 'Serial', exact: true }).fill('EX-SAVE')
    await dialog.getByRole('button', { name: 'Add to inventory', exact: true }).click()
    await expect(dialog).toHaveAttribute('aria-busy', 'true')
    await page.keyboard.press('Escape')
    await page.mouse.click(2, 2)
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    finish()
    await expect(page.getByText('Saved successfully', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const form of ['asset', 'type', 'tenant', 'user']) {
    test(`${form}: in-flight save blocks dismissal and success closes normally`, async ({ page }) => {
        let finish!: () => void
        const gate = new Promise<void>(resolve => { finish = resolve })
        await page.route('**/api/draft-save/', async route => { await gate; await route.fulfill({ status: 200, json: {} }) })
        const dialog = await openForm(page, form)
        await dialog.getByRole('textbox').first().fill(form === 'user' ? 'example-user' : 'Example value')
        if (form === 'asset') await dialog.getByRole('textbox', { name: 'Serial', exact: true }).fill('EX-SAVE')
        if (form === 'user') {
            await dialog.locator('input[type="email"]').fill('user@example.test')
            await dialog.locator('input[type="password"]').fill('Transient-secret-123!')
        }
        await dialog.getByRole('button', { name: form === 'user' ? 'Create User' : 'Create', exact: true }).click()
        await expect(dialog).toHaveAttribute('aria-busy', 'true')
        await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
        await page.keyboard.press('Escape')
        await page.mouse.click(2, 2)
        await expect(page.getByRole('dialog')).toHaveCount(1)
        finish()
        await expect(page.getByText('Saved successfully', { exact: true })).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)
    })
}

test('route navigation waits for discard and keep editing preserves the same form', async ({ page }) => {
    const dialog = await openForm(page, 'batch')
    await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('12')
    // Exercise application navigation directly: the background button is intentionally
    // unreachable by a real pointer while the modal's focus trap is active.
    await page.getByTestId('navigate-away').dispatchEvent('click')
    const confirmation = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('12')
    await expect(page).toHaveURL(/draft-protection/)
    await page.getByTestId('navigate-away').dispatchEvent('click')
    await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(page.getByText('Destination screen', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('feedback: my requests link asks before navigating with an unsaved draft', async ({ page }) => {
    const dialog = await openForm(page, 'feedback')
    await dialog.getByRole('textbox').first().fill('Keep my proposal')
    await dialog.getByRole('link', { name: 'My requests', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })
    await confirmation.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByRole('textbox').first()).toHaveValue('Keep my proposal')
    await dialog.getByRole('link', { name: 'My requests', exact: true }).click()
    await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(page.getByText('Request list', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('workbook: switching import method asks before discarding the selected file', async ({ page }) => {
    const dialog = await openForm(page, 'workbook')
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'draft.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('draft fixture') })
    const switchButton = dialog.getByRole('button', { name: 'Upload inventory for one type', exact: true })
    await switchButton.click()
    const confirmation = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })
    await confirmation.getByRole('button', { name: 'Keep editing', exact: true }).click()
    expect(await dialog.locator('input[type="file"]').evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe('draft.xlsx')
    await switchButton.click()
    await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(page.getByText('Saved successfully', { exact: true })).toBeVisible()
})

test('discarding a local method switch cannot authorize a later dirty navigation', async ({ page }) => {
    const dialog = await openForm(page, 'local-switch')
    await dialog.getByRole('textbox', { name: 'Draft value' }).fill('First draft')
    await dialog.getByRole('button', { name: 'Change method', exact: true }).click()
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: 'Draft value' })).toHaveValue('')
    await dialog.getByRole('textbox', { name: 'Draft value' }).fill('Second draft')
    await page.getByTestId('navigate-away').dispatchEvent('click')
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: 'Draft value' })).toHaveValue('Second draft')
})

for (const form of ['tenant-edit', 'user-edit']) {
    test(`${form}: background data refresh preserves edits and their initial baseline`, async ({ page }) => {
        const dialog = await openForm(page, form)
        const field = form === 'tenant-edit' ? dialog.getByRole('textbox', { name: 'Shipyard Name', exact: true }) : dialog.locator('input[type="email"]')
        await field.fill(form === 'tenant-edit' ? 'My unsaved yard' : 'mine@example.test')
        await page.getByTestId('refresh-props').dispatchEvent('click')
        await expect(field).toHaveValue(form === 'tenant-edit' ? 'My unsaved yard' : 'mine@example.test')
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
        await field.fill(form === 'tenant-edit' ? 'Initial yard' : 'initial@example.test')
        await page.keyboard.press('Escape')
        await expect(page.getByText('Form closed', { exact: true })).toBeVisible()
    })
}

test('user edit offers administrator only for assigned users or an existing legacy role', async ({ page }) => {
    let dialog = await openForm(page, 'user-edit')
    await expect(dialog.getByRole('button', { name: /^Shipyard Admin/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    dialog = await openForm(page, 'user-assigned')
    await expect(dialog.getByRole('button', { name: /^Shipyard Admin/ })).toBeVisible()
    await page.keyboard.press('Escape')
    dialog = await openForm(page, 'user-legacy')
    await expect(dialog.getByRole('button', { name: /^Shipyard Admin/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Form closed', { exact: true })).toBeVisible()
})
