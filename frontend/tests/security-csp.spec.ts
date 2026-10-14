import { readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { expect, test, type Page } from '@playwright/test'
import ts from 'typescript'

const origin = 'https://shipyard.test'
const providerEndpoint = '/_allauth/browser/v1/auth/provider/redirect'
const googleAuthorization = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client'
const nginxConfig = readFileSync(new URL('../compose/production/nginx.conf', import.meta.url), 'utf8')
const productionCsp = nginxConfig.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1] ?? ''

if (!productionCsp) throw new Error('Production Content-Security-Policy header is missing')

// Exercise the actual form helper without a dev-server script weakening production CSP.
const allauthSource = readFileSync(new URL('../src/modules/allauth/data.ts', import.meta.url), 'utf8')
const allauthModule = ts.transpileModule(
    allauthSource.replace("from '@/api/client'", "from '/api-client.js'"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText

async function mockOAuth(page: Page, destination: string) {
    const providerPosts: URLSearchParams[] = []
    const destinationRequests: string[] = []
    const unexpectedRequests: string[] = []
    const cdp = await page.context().newCDPSession(page)
    const fulfill = (requestId: string, contentType: string, body: string, headers: Record<string, string> = {}, status = 200) =>
        cdp.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: status,
            responseHeaders: Object.entries({ 'Content-Type': contentType, ...headers }).map(([name, value]) => ({ name, value })),
            body: Buffer.from(body).toString('base64'),
        })

    // Playwright routing skips redirected requests; CDP also intercepts the Google hop.
    cdp.on('Fetch.requestPaused', async ({ requestId, request }: {
        requestId: string
        request: { url: string; method: string; postData?: string }
    }) => {
        const url = new URL(request.url)
        if (request.url === destination) {
            destinationRequests.push(request.method)
            await fulfill(requestId, 'text/html', '<h1>Mock provider authorization</h1>')
        } else if (url.origin === origin && url.pathname === '/login') {
            await fulfill(requestId, 'text/html',
                '<!doctype html><title>OAuth CSP regression</title><button type="button">Google</button><script type="module" src="/oauth-login.js"></script>',
                { 'Content-Security-Policy': productionCsp },
            )
        } else if (url.origin === origin && url.pathname === '/oauth-login.js') {
            await fulfill(requestId, 'application/javascript', `import { ALLAUTH_API } from '/allauth-data.js';
                    document.querySelector('button').addEventListener('click', () =>
                        ALLAUTH_API.redirectToProvider('google', '/dashboard', 'login', 'verified-token'));
                    document.querySelector('button').dataset.ready = 'true';`)
        } else if (url.origin === origin && url.pathname === '/allauth-data.js') {
            await fulfill(requestId, 'application/javascript', allauthModule)
        } else if (url.origin === origin && url.pathname === '/api-client.js') {
            await fulfill(requestId, 'application/javascript', 'export default { defaults: { baseURL: "" } };')
        } else if (url.origin === origin && url.pathname === providerEndpoint) {
            expect(request.method).toBe('POST')
            providerPosts.push(new URLSearchParams(request.postData ?? ''))
            await fulfill(requestId, 'text/html', '', { Location: destination }, 302)
        } else {
            unexpectedRequests.push(request.url)
            await cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
        }
    })
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })

    await page.goto(`${origin}/login`)
    await expect(page.getByRole('button', { name: 'Google', exact: true })).toHaveAttribute('data-ready', 'true')
    return { providerPosts, destinationRequests, unexpectedRequests }
}

test('production CSP allows the Google OAuth POST redirect and retains CAPTCHA form data', async ({ page }) => {
    const requests = await mockOAuth(page, googleAuthorization)
    await page.getByRole('button', { name: 'Google', exact: true }).click()

    await expect(page).toHaveURL(googleAuthorization)
    await expect(page.getByRole('heading', { name: 'Mock provider authorization' })).toBeVisible()
    expect(requests.destinationRequests).toEqual(['GET'])
    expect(requests.unexpectedRequests).toEqual([])
    expect(requests.providerPosts).toHaveLength(1)
    expect(Object.fromEntries(requests.providerPosts[0])).toEqual({
        provider: 'google',
        callback_url: `${origin}/dashboard`,
        process: 'login',
        'cf-turnstile-response': 'verified-token',
    })
})

test('production CSP still blocks OAuth POST redirects to unapproved origins', async ({ page }) => {
    const requests = await mockOAuth(page, 'https://unapproved.test/authorize')
    const violation = page.waitForEvent('console', message =>
        message.type() === 'error' && message.text().includes('form-action'),
    )
    await page.getByRole('button', { name: 'Google', exact: true }).click()

    await violation
    await expect(page).toHaveURL(`${origin}/login`)
    expect(requests.providerPosts).toHaveLength(1)
    expect(requests.destinationRequests).toEqual([])
    expect(requests.unexpectedRequests).toEqual([])
})
