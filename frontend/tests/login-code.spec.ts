import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/captcha/', route => route.fulfill({ json: { enabled: false, site_key: '' } }))
})

const requestPath = '/_allauth/browser/v1/auth/code/request'
const confirmPath = '/_allauth/browser/v1/auth/code/confirm'
const email = 'member@shipyard.test'
const pendingCode = {
    status: 401,
    meta: { is_authenticated: false },
    data: { flows: [{ id: 'login_by_code', is_pending: true }] },
}

async function anonymousSession(page: Page, language: 'tr' | 'en' = 'tr') {
    await page.addInitScript(lang => localStorage.setItem('language', lang), language)
    await page.route('**/_allauth/browser/v1/**', async route => {
        const config = new URL(route.request().url()).pathname.endsWith('/config')
        await route.fulfill({ json: config ? {
            status: 200,
            data: { account: { login_by_code_enabled: true }, socialaccount: { providers: [] }, mfa: { supported_types: [] } },
        } : { status: 401, meta: { is_authenticated: false }, data: { flows: [] } } })
    })
}

const copy = {
    tr: {
        title: 'Giriş kodu gönder', emailLabel: 'E-posta',
        hint: 'Hesabınızda kayıtlı adresi kullanın.', back: 'Şifre ile giriş yap',
        sending: 'Kod gönderiliyor…',
        requestError: 'Kod gönderilemedi. E-posta adresinizi kontrol edip tekrar deneyin.',
        connectionError: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
    },
    en: {
        title: 'Send sign-in code', emailLabel: 'Email',
        hint: 'Use the address registered to your account.', back: 'Sign in with password',
        sending: 'Sending code…',
        requestError: 'The code could not be sent. Check your email address and try again.',
        connectionError: 'Unable to connect. Check your internet connection and try again.',
    },
}

for (const language of ['tr', 'en'] as const) {
    test(`request screen uses ${language} labels and rejects invalid email without sending`, async ({ page }) => {
        await anonymousSession(page, language)
        let requests = 0
        await page.route(`**${requestPath}`, async route => {
            requests += 1
            await route.fulfill({ status: 401, json: pendingCode })
        })
        await page.goto('/login/code')
        await expect(page.getByRole('heading', { name: copy[language].title, exact: true })).toBeVisible()
        const field = page.getByRole('textbox', { name: copy[language].emailLabel, exact: true })
        await expect(field).toBeVisible()
        await expect(field).toHaveAccessibleDescription(copy[language].hint)
        await expect(page.getByRole('link', { name: copy[language].back, exact: true })).toBeVisible()
        await field.fill('invalid-address')
        await page.getByRole('button', { name: copy[language].title, exact: true }).click()
        expect(await field.evaluate(element => (element as HTMLInputElement).validity.valid)).toBe(false)
        expect(requests).toBe(0)
        await expect(page).toHaveURL(/\/login\/code\/?$/)
    })

    test(`request errors stay on form and use ${language} text, including network failure`, async ({ page }) => {
        await anonymousSession(page, language)
        let requestCount = 0
        await page.route(`**${requestPath}`, async route => {
            requestCount += 1
            if (requestCount === 2) return route.abort('failed')
            await route.fulfill({ status: 400, json: {
                status: 400, errors: [{ code: 'invalid', message: 'Internal English server detail' }],
            } })
        })
        await page.goto('/login/code')
        await page.getByRole('textbox', { name: copy[language].emailLabel, exact: true }).fill(email)
        const submit = page.getByRole('button', { name: copy[language].title, exact: true })
        await submit.click()
        await expect(page.getByRole('alert')).toHaveText(copy[language].requestError)
        await expect(page).toHaveURL(/\/login\/code\/?$/)
        await expect(submit).toBeEnabled()
        await submit.click()
        await expect(page.getByRole('alert')).toHaveText(copy[language].connectionError)
        await expect(submit).toBeEnabled()
        expect(requestCount).toBe(2)
    })
}

test('request trims email, exposes loading, blocks duplicate sends and advances only for a pending code flow', async ({ page }) => {
    await anonymousSession(page)
    let requestCount = 0
    const bodies: unknown[] = []
    let release: () => void = () => {}
    const responseGate = new Promise<void>(resolve => { release = resolve })
    await page.route(`**${requestPath}`, async route => {
        requestCount += 1
        bodies.push(route.request().postDataJSON())
        if (requestCount === 1) await responseGate
        await route.fulfill({ status: 401, json: requestCount === 1 ? {
            status: 401, meta: { is_authenticated: false }, data: { flows: [{ id: 'login', is_pending: false }] },
        } : pendingCode })
    })
    await page.goto('/login/code')
    const field = page.getByRole('textbox', { name: 'E-posta', exact: true })
    await field.fill(`  ${email}  `)
    await page.getByRole('button', { name: 'Giriş kodu gönder', exact: true }).click()
    const loading = page.getByRole('button', { name: copy.tr.sending, exact: true })
    await expect(loading).toBeVisible()
    await expect(loading).toBeDisabled()
    await expect(field).toBeDisabled()
    await loading.click({ force: true })
    expect(requestCount).toBe(1)
    expect(bodies[0]).toEqual({ email })
    release()
    await expect(page.getByRole('alert')).toHaveText(copy.tr.requestError)
    await expect(page).toHaveURL(/\/login\/code\/?$/)
    await page.getByRole('button', { name: 'Giriş kodu gönder', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/login/code/confirm\\?email=${encodeURIComponent(email)}`))
    await expect(page.getByRole('heading', { name: 'Giriş kodunu girin', exact: true })).toBeVisible()
    await expect(page.getByText(email, { exact: true })).toBeVisible()
    expect(requestCount).toBe(2)
})

test('confirm requires six digits and explicit submit, keeps server errors retryable and localizes network failure', async ({ page }) => {
    await anonymousSession(page)
    let requestCount = 0
    const codes: unknown[] = []
    await page.route(`**${confirmPath}`, async route => {
        requestCount += 1
        codes.push(route.request().postDataJSON())
        if (requestCount === 2) return route.abort('failed')
        await route.fulfill({ status: 400, json: {
            status: 400, errors: [{ code: 'invalid_code', message: 'Internal English server detail' }],
        } })
    })
    await page.goto(`/login/code/confirm?email=${encodeURIComponent(email)}`)
    const submit = page.getByRole('button', { name: 'Doğrula ve giriş yap', exact: true })
    await expect(submit).toBeDisabled()
    for (let index = 1; index <= 5; index += 1) {
        await page.getByRole('textbox', { name: `${index}. hane`, exact: true }).fill(String(index))
    }
    await expect(submit).toBeDisabled()
    await page.getByRole('textbox', { name: '6. hane', exact: true }).fill('6')
    await expect(submit).toBeEnabled()
    expect(requestCount).toBe(0)
    await submit.click()
    await expect(page.getByRole('alert')).toHaveText('Kod doğrulanamadı. Kodu kontrol edip tekrar deneyin.')
    await expect(submit).toBeEnabled()
    expect(codes[0]).toEqual({ code: '123456' })
    await page.getByRole('textbox', { name: '6. hane', exact: true }).fill('7')
    expect(requestCount).toBe(1)
    await submit.click()
    await expect(page.getByRole('alert')).toHaveText(copy.tr.connectionError)
    await expect(submit).toBeEnabled()
    expect(codes[1]).toEqual({ code: '123457' })
    await expect(page.getByRole('link', { name: 'E-posta adresini değiştir', exact: true })).toBeVisible()
})

test('invalid query email safely uses fallback and both code screens fit a 390px viewport', async ({ page }) => {
    await anonymousSession(page)
    await page.setViewportSize({ width: 390, height: 844 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/login/code')
    await expect(page.getByRole('heading', { name: 'Giriş kodu gönder', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.goto('/login/code/confirm?email=%7Bnot-an-email%7D')
    await expect(page.getByRole('heading', { name: 'Giriş kodunu girin', exact: true })).toBeVisible()
    await expect(page.getByText('Giriş isteğiniz için e-postanıza gelen kodu kullanın.', { exact: true })).toBeVisible()
    await expect(page.getByText('{not-an-email}', { exact: true })).not.toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(errors).toEqual([])
})

test('a pending email-code request still allows changing email and choosing password sign-in', async ({ page }) => {
    await anonymousSession(page)
    let requests = 0
    await page.route(`**${requestPath}`, async route => {
        requests += 1
        await route.fulfill({ status: 401, json: pendingCode })
    })
    await page.goto('/login/code')
    await page.getByRole('textbox', { name: 'E-posta', exact: true }).fill(email)
    await page.getByRole('button', { name: 'Giriş kodu gönder', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Giriş kodunu girin', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'E-posta adresini değiştir', exact: true }).click()
    await expect(page).toHaveURL(/\/login\/code\/?$/)
    await expect(page.getByRole('textbox', { name: 'E-posta', exact: true })).toHaveValue('')
    await page.getByRole('link', { name: 'Şifre ile giriş yap', exact: true }).click()
    await expect(page).toHaveURL(/\/login\/?$/)
    await expect(page.locator('input[type="password"]')).toBeVisible()
    expect(requests).toBe(1)
})

test('an invalid code with the same pending flow stays on confirmation without repeated requests', async ({ page }) => {
    await anonymousSession(page)
    let requests = 0
    await page.route(`**${confirmPath}`, async route => {
        requests += 1
        await route.fulfill({ status: 401, json: { ...pendingCode, errors: [{ code: 'invalid_code', message: 'Invalid code' }] } })
    })
    await page.goto(`/login/code/confirm?email=${encodeURIComponent(email)}`)
    for (let index = 1; index <= 6; index += 1) {
        await page.getByRole('textbox', { name: `${index}. hane`, exact: true }).fill(String(index))
    }
    const submit = page.getByRole('button', { name: 'Doğrula ve giriş yap', exact: true })
    await expect(submit).toBeEnabled()
    expect(requests).toBe(0)
    await submit.click()
    await expect(page.getByRole('alert')).toHaveText('Kod doğrulanamadı. Kodu kontrol edip tekrar deneyin.')
    await expect(page).toHaveURL(new RegExp(`/login/code/confirm\\?email=${encodeURIComponent(email)}`))
    await expect(submit).toBeEnabled()
    await expect(page.getByRole('textbox', { name: '6. hane', exact: true })).toHaveValue('6')
    expect(requests).toBe(1)
    await submit.click()
    await expect(page.getByRole('alert')).toHaveText('Kod doğrulanamadı. Kodu kontrol edip tekrar deneyin.')
    await expect(submit).toBeEnabled()
    expect(requests).toBe(2)
})

test('code confirmation continues to a required MFA flow instead of reporting an invalid code', async ({ page }) => {
    await anonymousSession(page)
    let confirmRequests = 0
    let mfaRequests = 0
    await page.route(`**${confirmPath}`, async route => {
        confirmRequests += 1
        await route.fulfill({ status: 401, json: {
            status: 401, meta: { is_authenticated: false },
            data: { flows: [{ id: 'mfa_authenticate', is_pending: true, types: ['totp'] }] },
        } })
    })
    await page.route('**/_allauth/browser/v1/auth/2fa/authenticate', async route => {
        mfaRequests += 1
        await route.fulfill({ status: 400, json: { status: 400 } })
    })
    await page.goto(`/login/code/confirm?email=${encodeURIComponent(email)}`)
    for (let index = 1; index <= 6; index += 1) {
        await page.getByRole('textbox', { name: `${index}. hane`, exact: true }).fill(String(index))
    }
    await page.getByRole('button', { name: 'Doğrula ve giriş yap', exact: true }).click()
    await expect(page).toHaveURL(/\/auth\/mfa\/authenticate\/?(?:\?redirect=%2Fdashboard)?$/)
    await expect(page.getByRole('heading', { name: 'İki adımlı doğrulamayı tamamlayın', exact: true })).toBeVisible()
    await expect(page.getByText('Kod doğrulanamadı. Kodu kontrol edip tekrar deneyin.', { exact: true })).not.toBeVisible()
    expect(confirmRequests).toBe(1)
    expect(mfaRequests).toBe(0)
})

test('request rate limit shows actionable feedback without advancing to confirmation', async ({ page }) => {
    await anonymousSession(page)
    let requests = 0
    await page.route(`**${requestPath}`, async route => {
        requests += 1
        await route.fulfill({ status: 400, json: {
            status: 400,
            errors: [{ code: 'too_many_login_attempts', message: 'Too many failed login attempts. Try again later.' }],
        } })
    })
    await page.goto('/login/code')
    await page.getByRole('textbox', { name: 'E-posta', exact: true }).fill(email)
    await page.getByRole('button', { name: 'Giriş kodu gönder', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Çok fazla kod istendi. Bir süre bekleyip tekrar deneyin.')
    await expect(page).toHaveURL(/\/login\/code\/?$/)
    await expect(page.getByRole('heading', { name: 'Giriş kodunu girin', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Giriş kodu gönder', exact: true })).toBeEnabled()
    expect(requests).toBe(1)
})

test('inactive confirmation disables retries and offers a working new-code action', async ({ page }) => {
    await anonymousSession(page)
    let requests = 0
    await page.route(`**${confirmPath}`, async route => {
        requests += 1
        await route.fulfill({ status: 409, json: { status: 409 } })
    })
    await page.goto(`/login/code/confirm?email=${encodeURIComponent(email)}`)
    for (let index = 1; index <= 6; index += 1) {
        await page.getByRole('textbox', { name: `${index}. hane`, exact: true }).fill(String(index))
    }
    const submit = page.getByRole('button', { name: 'Doğrula ve giriş yap', exact: true })
    await submit.click()
    await expect(page.getByRole('alert')).toContainText('Giriş isteği artık geçerli değil. Yeni bir kod isteyin.')
    await expect(submit).toBeDisabled()
    for (let index = 1; index <= 6; index += 1) {
        await expect(page.getByRole('textbox', { name: `${index}. hane`, exact: true })).toBeDisabled()
    }
    await submit.click({ force: true })
    expect(requests).toBe(1)
    await page.getByRole('link', { name: 'Yeni giriş kodu iste', exact: true }).click()
    await expect(page).toHaveURL(/\/login\/code\/?$/)
    await expect(page.getByRole('heading', { name: 'Giriş kodu gönder', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'E-posta', exact: true })).toBeEnabled()
    expect(requests).toBe(1)
})
