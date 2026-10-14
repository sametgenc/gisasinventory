import { test, expect, type Page } from '@playwright/test'
const base = '/_allauth/browser/v1/account/authenticators'
const totp = { type: 'totp', id: 'phone', created_at: '1760000000', last_used_at: null }
async function mock(page: Page, password = true, types?: string[]) {
    await page.addInitScript(() => localStorage.setItem('language', 'tr'))
    await page.route('**/_allauth/browser/v1/**', async route => {
        const path = new URL(route.request().url()).pathname
        await route.fulfill({ json: path.endsWith('/config') ? { status: 200, data: { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: ['totp', 'webauthn', 'recovery_codes'] } } } : path === base ? { status: 200, data: [totp] } : { status: types ? 401 : 200, meta: { is_authenticated: !types }, data: { user: types ? undefined : { id: 'admin', username: 'admin', email: 'admin@shipyard.test', role: 'platform_admin', has_usable_password: password }, methods: [{ method: 'password', at: Date.now() / 1000 }], flows: types ? [{ id: 'mfa_authenticate', is_pending: true, types }] : [] } } })
    })
    await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({ json: { count: 0, results: [] } }) : route.continue())
}
test('passwordless TOTP uses reauthentication endpoint and rejects external next', async ({ page }) => {
    await mock(page, false)
    let posts = 0
    await page.route('**/_allauth/browser/v1/auth/2fa/reauthenticate', async route => { posts += 1; expect(route.request().postDataJSON()).toEqual({ code: '123456' }); await route.fulfill({ json: { status: 200 } }) })
    await page.goto('/auth/reauthenticate?next=https%3A%2F%2Fevil.test')
    await expect(page.getByRole('button', { name: 'Güvenlik anahtarı', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Şifre', exact: true })).toHaveCount(0)
    await page.getByRole('textbox', { name: '6 haneli doğrulama kodu' }).fill('123456')
    await page.getByRole('button', { name: 'Doğrula ve devam et' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    expect(posts).toBe(1)
})
test('factor-only SMTP reauthentication excludes password and invalid code remains retryable', async ({ page }) => {
    await mock(page)
    await page.route('**/_allauth/browser/v1/auth/2fa/reauthenticate', route => route.fulfill({ json: { status: 400 } }))
    await page.goto('/auth/reauthenticate?next=%2Fplatform%2Fsettings&mfa=true')
    await expect(page.getByRole('button', { name: 'Şifre', exact: true })).toHaveCount(0)
    await page.getByRole('textbox', { name: '6 haneli doğrulama kodu' }).fill('123456')
    await page.getByRole('button', { name: 'Doğrula ve devam et' }).click()
    await expect(page.getByRole('alert')).toContainText('Kod doğrulanamadı.')
    await expect(page.getByRole('button', { name: 'Doğrula ve devam et' })).toBeEnabled()
})
test('MFA only offers server-provided recovery method', async ({ page }) => {
    await mock(page, true, ['recovery_codes'])
    await page.goto('/auth/mfa/authenticate')
    await expect(page.getByRole('textbox', { name: 'Kurtarma kodu', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '6 haneli doğrulama kodu' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Güvenlik anahtarı', exact: true })).toHaveCount(0)
})
test('MFA missing methods gives restart instead of invented fallback', async ({ page }) => {
    await mock(page, true, [])
    await page.goto('/auth/mfa/authenticate')
    await expect(page.getByRole('alert')).toContainText('Bu doğrulama oturumu kullanılamıyor.')
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Giriş ekranına dön' })).toBeVisible()
})
test('TOTP activation retains completion and save recovery codes step', async ({ page }) => {
    await mock(page)
    let enabled = false
    await page.route(`**${base}`, route => route.fulfill({ json: { status: 200, data: enabled ? [totp] : [] } }))
    await page.route(`**${base}/totp`, async route => {
        if (route.request().method() === 'POST') { enabled = true; return route.fulfill({ json: { status: 200 } }) }
        await route.fulfill({ json: { status: 404, meta: { secret: 'LOCAL-KEY', totp_url: 'otpauth://totp/Test?secret=LOCALKEY' } } })
    })
    await page.goto('/account/totp-setup')
    await page.getByRole('textbox', { name: '6 haneli doğrulama kodu' }).fill('123456')
    await page.getByRole('button', { name: 'İki adımlı doğrulamayı aç', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'İki adımlı doğrulama açıldı' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Kurtarma kodlarını görüntüle ve kaydet' })).toBeVisible()
})
test('TOTP loader failure has retry and no endless skeleton', async ({ page }) => {
    await mock(page)
    await page.route(`**${base}`, route => route.abort('failed'))
    await page.goto('/account/totp-setup')
    await expect(page.getByRole('alert')).toContainText('Güvenlik bilgileri yüklenemedi.')
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
})
test('recovery codes never regenerate on load, expose download and confirm replacement', async ({ page }) => {
    await mock(page)
    let posts = 0
    await page.route(`**${base}/recovery-codes`, async route => {
        if (route.request().method() === 'POST') posts += 1
        await route.fulfill({ json: { status: 200, data: { unused_codes: posts ? ['fresh-001', 'fresh-002'] : ['old-001', 'old-002'] } } })
    })
    await page.goto('/auth/mfa/recovery-codes')
    await expect(page.getByText('old-001', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kodları indir' })).toBeVisible()
    expect(posts).toBe(0)
    await page.getByRole('button', { name: /Yeniden oluştur/i }).click()
    await expect(page.getByRole('dialog')).toContainText('eski kurtarma kodlarının tamamı geçersiz')
    expect(posts).toBe(0)
    await page.getByRole('dialog').getByRole('button', { name: 'Onayla', exact: true }).click()
    await expect(page.getByText('fresh-001', { exact: true })).toBeVisible()
    expect(posts).toBe(1)
})
test('return-path validator blocks protocol-relative, encoded slash, backslash and script URLs', async ({ page }) => {
    await mock(page)
    await page.goto('/auth/reauthenticate')
    const results = await page.evaluate(async () => {
        const { safeReturnPath } = await import('/src/modules/allauth/mfa/security.ts')
        return ['//evil.test', '/%2f%2fevil.test', '/\\evil.test', 'javascript:alert(1)', '/%00evil', '/platform/settings?tab=mail'].map(value => safeReturnPath(value))
    })
    expect(results).toEqual(['/dashboard', '/dashboard', '/dashboard', '/dashboard', '/dashboard', '/platform/settings?tab=mail'])
})
test('MFA prevents duplicate submissions and retains retry after server failure', async ({ page }) => {
    await mock(page, true, ['totp'])
    let requests = 0
    let release = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route('**/_allauth/browser/v1/auth/2fa/authenticate', async route => { requests += 1; await gate; await route.fulfill({ json: { status: 400 } }) })
    await page.goto('/auth/mfa/authenticate')
    const code = page.getByRole('textbox', { name: '6 haneli doğrulama kodu' })
    await code.fill('123456')
    const submit = page.getByRole('button', { name: 'Doğrula ve devam et' })
    await submit.click()
    await expect(submit).toBeDisabled()
    await expect(code).toBeDisabled()
    await submit.click({ force: true })
    expect(requests).toBe(1)
    release()
    await expect(page.getByRole('alert')).toContainText('Kod doğrulanamadı.')
    await expect(submit).toBeEnabled()
})
test('server-expired verification redirects TOTP removal to verification without retrying or removing the method', async ({ page }) => {
    await mock(page)
    let deletions = 0
    await page.route(`**${base}/totp`, async route => {
        if (route.request().method() === 'DELETE') {
            deletions += 1
            await route.fulfill({ status: 401, json: { status: 401, meta: { is_authenticated: true }, data: { flows: [{ id: 'reauthenticate', is_pending: true }] } } })
        } else await route.fulfill({ json: { status: 200, data: { secret: 'LOCAL-KEY', totp_url: 'otpauth://totp/Test?secret=LOCALKEY' } } })
    })
    await page.goto('/account/totp-setup')
    await page.getByRole('button', { name: 'Doğrulama uygulamasını kaldır', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Doğrulama uygulamasını kaldır', exact: true }).click()
    await expect(page).toHaveURL(/\/auth\/reauthenticate\?next=%2Faccount%2Ftotp-setup/)
    await expect(page.getByRole('heading', { name: 'Kimliğinizi doğrulayın' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '6 haneli doğrulama kodu' })).toBeVisible()
    expect(deletions).toBe(1)
})
