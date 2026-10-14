import { test, expect, type Page } from '@playwright/test'

type CaptchaWindow = Window & {
    connectChallenge?: {
        solve: (token: string) => void
        expire: () => void
    }
}

async function connectedAccount(page: Page) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'))
    await page.route('https://authjs.dev/**', route => route.abort('blockedbyclient'))
    await page.route('**/_allauth/browser/v1/**', route => {
        const path = new URL(route.request().url()).pathname
        return route.fulfill({ json: path.endsWith('/config') ? {
            status: 200,
            data: { account: {}, socialaccount: { providers: [{ id: 'google', name: 'Google' }] }, mfa: { supported_types: [] } },
        } : path.endsWith('/account/providers') ? { status: 200, data: [] } : {
            status: 200,
            meta: { is_authenticated: true },
            data: { user: { id: 'member', username: 'member', email: 'member@shipyard.test', role: 'member' }, methods: [] },
        } })
    })
    await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/')
        ? route.fulfill({ json: { count: 0, results: [] } })
        : route.continue())
    await page.route('**/api/auth/captcha/', route => route.fulfill({ json: { enabled: true, site_key: 'public-test-key' } }))
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route => route.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile = {
            ready(callback) { callback(); },
            render(container, options) {
                window.connectChallenge = { solve: options.callback, expire: options['expired-callback'] };
                return 'connected-account-widget';
            },
            remove() {}
        };`,
    }))
}

test('connecting a Google account requires a fresh CAPTCHA and sends its token in the provider form', async ({ page }) => {
    await connectedAccount(page)
    const posts: URLSearchParams[] = []
    await page.route('**/_allauth/browser/v1/auth/provider/redirect', async route => {
        expect(route.request().method()).toBe('POST')
        posts.push(new URLSearchParams(route.request().postData() ?? ''))
        await route.fulfill({ contentType: 'text/html', body: '<h1>Provider connection started</h1>' })
    })
    await page.goto('/account/providers')
    const connect = page.getByRole('button', { name: 'Google', exact: true })
    await expect(connect).toBeDisabled()
    await page.waitForFunction(() => Boolean((window as CaptchaWindow).connectChallenge))
    await page.evaluate(() => (window as CaptchaWindow).connectChallenge?.solve('expired-token'))
    await expect(connect).toBeEnabled()
    await page.evaluate(() => (window as CaptchaWindow).connectChallenge?.expire())
    await expect(connect).toBeDisabled()
    expect(posts).toEqual([])

    await page.evaluate(() => (window as CaptchaWindow).connectChallenge?.solve('fresh-connect-token'))
    const callbackUrl = new URL('/account/providers', page.url()).href
    await connect.click()
    await expect(page.getByRole('heading', { name: 'Provider connection started' })).toBeVisible()
    expect(posts).toHaveLength(1)
    expect(Object.fromEntries(posts[0])).toEqual({
        provider: 'google',
        callback_url: callbackUrl,
        process: 'connect',
        'cf-turnstile-response': 'fresh-connect-token',
    })
})

test('provider connection stays blocked when CAPTCHA configuration is unavailable', async ({ page }) => {
    await connectedAccount(page)
    await page.route('**/api/auth/captcha/', route => route.fulfill({ status: 503, json: {} }))
    await page.goto('/account/providers')

    await expect(page.getByRole('alert')).toContainText('Security verification is unavailable.')
    await expect(page.getByRole('button', { name: 'Google', exact: true })).toBeDisabled()
})
