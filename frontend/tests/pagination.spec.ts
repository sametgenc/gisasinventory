import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.goto('/tests/pagination.html')
})

test('numbered pages expose current page and keep first and last boundaries disabled', async ({ page }) => {
    const navigation = page.getByRole('navigation', { name: 'Pagination' })
    await expect(navigation.getByRole('button', { name: 'Go to page 1', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(navigation.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled()
    await navigation.getByRole('button', { name: 'Go to page 12', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'Beta 051', exact: true })).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Go to page 12', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(navigation.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    await navigation.getByRole('button', { name: 'First', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'Alpha 001', exact: true })).toBeVisible()
})

test('different search results with identical counts reset tables to first page', async ({ page }) => {
    const search = page.getByRole('textbox', { name: 'Search fixture' })
    await search.fill('Alpha')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'Alpha 011', exact: true })).toBeVisible()
    await search.fill('Beta')
    await expect(page.getByRole('cell', { name: 'Beta 001', exact: true })).toBeVisible()
    await expect(page.getByText('1–10 of 60', { exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Beta 011', exact: true })).not.toBeVisible()
})

test('page controls support keyboard activation without losing focus', async ({ page }) => {
    const next = page.getByRole('button', { name: 'Next', exact: true })
    await next.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('11–20 of 120', { exact: true })).toBeVisible()
    await expect(next).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page.getByText('21–30 of 120', { exact: true })).toBeVisible()
})

test('changing page size resets range and sorting starts at first page', async ({ page }) => {
    await page.getByRole('button', { name: 'Last', exact: true }).click()
    await page.getByRole('combobox', { name: 'Per page', exact: true }).selectOption('25')
    await expect(page.getByText('1–25 of 120', { exact: true })).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(26)
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('button', { name: 'Name', exact: true }).click()
    await expect(page.getByText('1–25 of 120', { exact: true })).toBeVisible()
})

test('data shrink leaves a valid nonempty page', async ({ page }) => {
    await page.getByRole('button', { name: 'Last', exact: true }).click()
    await page.getByRole('button', { name: 'Remove ten records', exact: true }).click()
    await expect(page.getByRole('row')).toHaveCount(11)
    await expect(page.getByText('1–10 of 110', { exact: true })).toBeVisible()
})

for (const width of [320, 390]) {
    test(`pagination stays usable without horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        const navigation = page.getByRole('navigation', { name: 'Pagination' })
        await expect(navigation).toBeVisible()
        await navigation.getByRole('button', { name: 'Next', exact: true }).click()
        await expect(page.getByRole('cell', { name: 'Alpha 011', exact: true })).toBeVisible()
        await expect(page.getByText('11–20 of 120', { exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    })
}
