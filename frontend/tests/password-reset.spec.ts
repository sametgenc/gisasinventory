import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/captcha/', route => route.fulfill({ json: { enabled: false, site_key: '' } }))
})
const endpoint = '/_allauth/browser/v1/auth/password/reset'
const pending = { status: 401, meta: { is_authenticated: false }, data: { flows: [{ id: 'password_reset_by_code', is_pending: true }] } }
const completed = { status: 401, meta: { is_authenticated: false }, data: { flows: [{ id: 'login' }, { id: 'password_reset_by_code', is_pending: false }] } }
const password = 'ShipyardFixture!42'
async function anonymous(page: Page, language: 'tr' | 'en' = 'tr') {
    await page.addInitScript(lang => localStorage.setItem('language', lang), language)
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/config') ? { status: 200, data: { account: { login_by_code_enabled: true, password_reset_by_code_enabled: true }, socialaccount: { providers: [] }, mfa: { supported_types: [] } } } : pending }))
}
async function pasteCode(page: Page, text: string, language: 'tr' | 'en' = 'tr') {
    await page.getByRole('textbox', { name: language === 'tr' ? '1. karakter' : 'Character 1', exact: true }).evaluate((input, value) => {
        const data = new DataTransfer()
        data.setData('text/plain', value)
        input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, text)
}
for (const language of ['tr', 'en'] as const) {
    test(`reset accepts all eight alphanumeric characters in ${language} and sends exact payload`, async ({ page }) => {
        await anonymous(page, language)
        let requests = 0
        await page.route(`**${endpoint}`, async route => {
            requests += 1
            expect(route.request().postDataJSON()).toEqual({ key: 'AB7C2D9E', password })
            await route.fulfill({ status: 401, json: completed })
        })
        await page.goto('/auth/password/reset')
        await expect(page.getByText(language === 'tr' ? /8 karakterli kodu/ : /8-character code/)).toBeVisible()
        await pasteCode(page, 'ab7c2d9e', language)
        for (let index = 1; index <= 8; index += 1) {
            const input = page.getByRole('textbox', { name: language === 'tr' ? `${index}. karakter` : `Character ${index}`, exact: true })
            await expect(input).toHaveValue('AB7C2D9E'[index - 1])
            await expect(input).toHaveAttribute('inputmode', 'text')
        }
        expect(requests).toBe(0)
        await page.getByLabel(language === 'tr' ? 'Yeni şifre' : 'New password').fill(password)
        await page.getByRole('button', { name: language === 'tr' ? 'Şifreyi sıfırla' : 'Reset password', exact: true }).click()
        await expect(page).toHaveURL(/\/login(?:\?|$)/)
        expect(requests).toBe(1)
    })
}
test('incorrect, still-pending and unrelated 401 responses remain retryable on reset form', async ({ page }) => {
    await anonymous(page)
    const responses = [
        { status: 400, json: { status: 400, errors: [{ code: 'invalid_code', message: 'internal server detail', param: 'key' }] } },
        { status: 401, json: pending },
        { status: 401, json: { status: 401, meta: { is_authenticated: false }, data: { flows: [{ id: 'login' }] } } },
    ]
    let requests = 0
    await page.route(`**${endpoint}`, async route => { await route.fulfill(responses[requests]); requests += 1 })
    await page.goto('/auth/password/reset')
    await pasteCode(page, 'AB7C2D9E')
    await page.getByLabel('Yeni şifre').fill(password)
    for (let index = 0; index < responses.length; index += 1) {
        await page.getByRole('button', { name: 'Şifreyi sıfırla', exact: true }).click()
        await expect(page.getByRole('alert')).toContainText('Kod veya şifre doğrulanamadı.')
        await expect(page).toHaveURL(/\/auth\/password\/reset$/)
        await expect(page.getByRole('button', { name: 'Şifreyi sıfırla', exact: true })).toBeEnabled()
    }
    expect(requests).toBe(3)
})
test('reset blocks duplicate requests and keeps network failure retryable', async ({ page }) => {
    await anonymous(page)
    let requests = 0
    let release = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route(`**${endpoint}`, async route => { requests += 1; await gate; await route.abort('failed') })
    await page.goto('/auth/password/reset')
    await pasteCode(page, 'AB7C2D9E')
    await page.getByLabel('Yeni şifre').fill(password)
    await page.getByRole('button', { name: 'Şifreyi sıfırla', exact: true }).click()
    const loading = page.getByRole('button', { name: 'Şifre güncelleniyor…', exact: true })
    await expect(loading).toBeDisabled()
    await expect(page.getByRole('textbox', { name: '8. karakter', exact: true })).toBeDisabled()
    await loading.click({ force: true })
    expect(requests).toBe(1)
    release()
    await expect(page.getByRole('alert')).toContainText('Bağlantı kurulamadı.')
    await expect(page.getByRole('button', { name: 'Şifreyi sıfırla', exact: true })).toBeEnabled()
})
test('reset fits 320px dark viewport without truncating pasted code', async ({ page }) => {
    await anonymous(page)
    await page.setViewportSize({ width: 320, height: 740 })
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
    await page.goto('/auth/password/reset')
    await pasteCode(page, 'AB7C2D9E')
    await expect(page.getByRole('textbox', { name: '8. karakter', exact: true })).toHaveValue('E')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const toggle = page.getByRole('button', { name: 'Şifreyi göster', exact: true })
    await toggle.focus()
    await expect(toggle).toBeFocused()
    await toggle.press('Enter')
    await expect(page.getByRole('textbox', { name: 'Yeni şifre', exact: true })).toHaveAttribute('type', 'text')
})
