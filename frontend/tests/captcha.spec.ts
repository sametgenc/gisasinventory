import { test, expect, type Page } from '@playwright/test'

const widgetScript = `
window.captchaTest = { renders: 0, removed: 0 };
window.turnstile = {
    ready(callback) { callback(); },
    render(container, options) {
        window.captchaTest.renders++;
        window.captchaTest.solve = options.callback;
        window.captchaTest.expire = options['expired-callback'];
        window.captchaTest.options = { action: options.action, sitekey: options.sitekey };
        return String(window.captchaTest.renders);
    },
    remove() { window.captchaTest.removed++; }
};`

type CaptchaTestWindow = Window & {
    captchaTest: {
        renders: number
        removed: number
        solve: (token: string) => void
        expire: () => void
        options: { action: string; sitekey: string }
    }
}

async function anonymous(page: Page) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json:
        route.request().url().endsWith('/config') ? {
            status: 200,
            data: {
                account: { login_by_code_enabled: true },
                socialaccount: { providers: [{ id: 'google', name: 'Google' }] },
                mfa: { supported_types: ['webauthn'] },
            },
        } : { status: 401, meta: { is_authenticated: false }, data: { flows: [] } },
    }))
    await page.route('**/api/auth/captcha/', route => route.fulfill({ json: { enabled: true, site_key: 'public-test-key' } }))
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route => route.fulfill({ contentType: 'application/javascript', body: widgetScript }))
}

async function solve(page: Page, token: string) {
    await page.waitForFunction(() => Boolean((window as CaptchaTestWindow).captchaTest?.solve))
    await page.evaluate(value => (window as CaptchaTestWindow).captchaTest.solve(value), token)
}

test('all login alternatives require challenge and expired token disables submit', async ({ page }) => {
    await anonymous(page)
    await page.goto('/login')
    const submit = page.getByRole('button', { name: 'Sign In', exact: true })
    await expect(submit).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Sign in with Passkey', exact: true })).toBeDisabled()
    await solve(page, 'first-token')
    await expect(submit).toBeEnabled()
    expect(await page.evaluate(() => (window as CaptchaTestWindow).captchaTest.options)).toEqual({ action: 'authenticate', sitekey: 'public-test-key' })
    await page.evaluate(() => (window as CaptchaTestWindow).captchaTest.expire())
    await expect(submit).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeDisabled()
})

test('each failed code request sends token once and requires fresh verification before retry', async ({ page }) => {
    await anonymous(page)
    const payloads: unknown[] = []
    await page.route('**/_allauth/browser/v1/auth/code/request', async route => {
        payloads.push(route.request().postDataJSON())
        await route.fulfill({ status: 403, json: { status: 403, errors: [{ code: 'captcha_failed', message: 'Security verification failed' }] } })
    })
    await page.goto('/login/code')
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('member@yard.test')
    const submit = page.getByRole('button', { name: 'Send sign-in code', exact: true })
    await expect(submit).toBeDisabled()
    await solve(page, 'first-token')
    await submit.click()
    await expect(submit).toBeDisabled()
    await page.waitForFunction(() => (window as CaptchaTestWindow).captchaTest.renders === 2)
    await submit.click({ force: true })
    expect(payloads).toEqual([{ email: 'member@yard.test', captcha_token: 'first-token' }])
    await solve(page, 'second-token')
    await submit.click()
    await expect(submit).toBeDisabled()
    expect(payloads).toEqual([
        { email: 'member@yard.test', captcha_token: 'first-token' },
        { email: 'member@yard.test', captcha_token: 'second-token' },
    ])
    expect(await page.evaluate(() => (window as CaptchaTestWindow).captchaTest.removed)).toBeGreaterThanOrEqual(1)
})

test('missing server configuration blocks auth instead of silently disabling CAPTCHA', async ({ page }) => {
    await anonymous(page)
    await page.route('**/api/auth/captcha/', route => route.fulfill({ status: 503, json: {} }))
    await page.goto('/login')
    await expect(page.getByRole('alert')).toContainText('Security verification is unavailable.')
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeDisabled()
})

test('blocked widget script cannot enable auth', async ({ page }) => {
    await anonymous(page)
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route => route.abort('failed'))
    await page.goto('/login/code')
    await expect(page.getByRole('alert')).toContainText('Security verification is unavailable.')
    await expect(page.getByRole('button', { name: 'Send sign-in code', exact: true })).toBeDisabled()
})
