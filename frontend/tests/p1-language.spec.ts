import { test, expect, type Page } from '@playwright/test'

const allauth = '/_allauth/browser/v1'
const password = 'ShipyardFixture!42'

async function account(page: Page, options: { language?: 'tr' | 'en'; hasPassword?: boolean; anonymous?: boolean; pendingFlow?: string } = {}) {
    await page.addInitScript(language => localStorage.setItem('language', language), options.language ?? 'tr')
    await page.route('https://authjs.dev/**', route => route.abort('blockedbyclient'))
    await page.route(`**${allauth}/**`, route => {
        const path = new URL(route.request().url()).pathname
        return route.fulfill({ json: path.endsWith('/config') ? {
            status: 200, data: { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: ['totp', 'webauthn', 'recovery_codes'] } },
        } : path.endsWith('/account/email') ? { status: 200, data: [{ email: 'staff@shipyard.test', verified: true, primary: true }] }
            : path.endsWith('/account/authenticators') ? { status: 200, data: [] }
                : path.endsWith('/account/providers') ? { status: 200, data: [] }
                    : {
                        status: options.anonymous ? 401 : 200,
                        meta: { is_authenticated: !options.anonymous },
                        data: {
                            user: options.anonymous ? undefined : { id: 'staff', username: 'staff', email: 'staff@shipyard.test', role: 'tenant_user', tenant_slug: 'north', tenant_name: 'North', has_usable_password: options.hasPassword ?? true },
                            methods: [{ method: 'password', at: Date.now() / 1000 }],
                            flows: options.pendingFlow ? [{ id: options.pendingFlow, is_pending: true }] : [],
                        },
                    } })
    })
    await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({ json: { count: 0, results: [] } }) : route.continue())
    await page.route('**/api/auth/captcha/', route => route.fulfill({ json: { enabled: false, site_key: '' } }))
}

test('Turkish password form labels and mismatch validation preserve inputs without submitting', async ({ page }) => {
    await account(page)
    let posts = 0
    await page.route(`**${allauth}/account/password/change`, route => { posts += 1; return route.fulfill({ json: { status: 200 } }) })
    await page.goto('/account/password')
    await expect(page.getByRole('heading', { name: 'Şifre değiştir', exact: true })).toBeVisible()
    await page.getByLabel('Mevcut şifre', { exact: true }).fill(password)
    await page.getByLabel('Yeni şifre', { exact: true }).fill(password)
    await page.getByLabel('Yeni şifreyi tekrar girin', { exact: true }).fill('Mismatch!42')
    await page.getByRole('button', { name: 'Şifreyi güncelle', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Şifreler eşleşmiyor.')
    await expect(page.getByLabel('Yeni şifre', { exact: true })).toHaveValue(password)
    expect(posts).toBe(0)
})

test('password errors localize by server code, success clears secrets and keeps exact API payload', async ({ page }) => {
    await account(page)
    let posts = 0
    await page.route(`**${allauth}/account/password/change`, async route => {
        expect(route.request().postDataJSON()).toEqual({ current_password: password, new_password: password })
        posts += 1
        await route.fulfill({ json: posts === 1 ? { status: 400, errors: [{ code: 'password_too_common', param: 'new_password', message: 'This password is too common.' }] } : { status: 200 } })
    })
    await page.goto('/account/password')
    await page.locator('input[type=password]').nth(0).fill(password)
    await page.locator('input[type=password]').nth(1).fill(password)
    await page.locator('input[type=password]').nth(2).fill(password)
    await page.getByRole('button', { name: /Update Password|Şifreyi güncelle/ }).click()
    await expect(page.getByRole('alert')).toContainText('Bu şifre çok yaygın. Farklı bir şifre seçin.')
    await expect(page.getByRole('alert')).not.toContainText('This password')
    await page.getByRole('button', { name: 'Şifreyi güncelle', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Şifreniz güncellendi.')
    for (const input of await page.locator('input[type=password]').all()) await expect(input).toHaveValue('')
    expect(posts).toBe(2)
})

test('passwordless account has Turkish set-password flow and omits current password', async ({ page }) => {
    await account(page, { hasPassword: false })
    await page.route(`**${allauth}/account/password/change`, async route => {
        expect(route.request().postDataJSON()).toEqual({ new_password: password })
        await route.fulfill({ json: { status: 200 } })
    })
    await page.goto('/account/password')
    await expect(page.getByRole('heading', { name: 'Şifre belirle', exact: true })).toBeVisible()
    await expect(page.getByLabel('Mevcut şifre', { exact: true })).toHaveCount(0)
    await page.getByLabel('Yeni şifre', { exact: true }).fill(password)
    await page.getByLabel('Yeni şifreyi tekrar girin', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Şifre belirle', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Şifreniz belirlendi.')
})

test('account email rejects duplicate address with Turkish guidance instead of raw server English', async ({ page }) => {
    await account(page)
    await page.route(`**${allauth}/account/email`, route => route.fulfill({ json: route.request().method() === 'GET'
        ? { status: 200, data: [{ email: 'staff@shipyard.test', verified: true, primary: true }] }
        : { status: 400, errors: [{ code: 'email_taken', param: 'email', message: 'A user is already registered with this email address.' }] } }))
    await page.goto('/account/email')
    await page.getByPlaceholder('Yeni bir e-posta adresi girin...').fill('duplicate@shipyard.test')
    await page.getByRole('button', { name: 'E-posta Ekle', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Bu e-posta adresi zaten kullanılıyor.')
    await expect(page.getByRole('alert')).not.toContainText('A user is already')
    await expect(page.getByPlaceholder('Yeni bir e-posta adresi girin...')).toHaveValue('duplicate@shipyard.test')
})

test('connected accounts translates headings, confirmation and disconnect failure without changing request', async ({ page }) => {
    await account(page)
    let deletions = 0
    await page.route(`**${allauth}/account/providers`, async route => {
        if (route.request().method() === 'DELETE') {
            deletions += 1
            expect(route.request().postDataJSON()).toEqual({ provider: 'google', account: 'google-fixture' })
            return route.fulfill({ json: { status: 400, errors: [{ code: 'socialaccount_disconnect', message: 'Cannot disconnect the last account.' }] } })
        }
        await route.fulfill({ json: { status: 200, data: [{ uid: 'google-fixture', display: 'staff@shipyard.test', provider: { id: 'google', name: 'Google' } }] } })
    })
    await page.goto('/account/providers')
    await expect(page.getByRole('heading', { name: 'Bağlı hesaplar', exact: true })).toBeVisible()
    page.once('dialog', async dialog => { expect(dialog.message()).toBe('Google hesabının bağlantısını kaldırmak istiyor musunuz?'); await dialog.accept() })
    await page.getByRole('button', { name: 'Bağlantıyı kaldır', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Bu hesabın bağlantısı kaldırılamadı.')
    await expect(page.getByRole('heading', { name: 'Yeni hesap bağla', exact: true })).toBeVisible()
    expect(deletions).toBe(1)
})

test('invalid password link is explained in Turkish and offers replacement', async ({ page }) => {
    await account(page, { anonymous: true })
    await page.route(`**${allauth}/auth/password/reset`, route => route.fulfill({ json: { status: 400, errors: [{ code: 'invalid_key', message: 'Invalid or expired link' }] } }))
    await page.goto('/auth/password/confirm/expired-fixture')
    await expect(page.getByRole('heading', { name: 'Geçersiz bağlantı', exact: true })).toBeVisible()
    await expect(page.getByText('Bu şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Yeni bir bağlantı isteyin.', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Yeni bağlantı iste', exact: true })).toHaveAttribute('href', '/auth/password/request')
})

test('valid password link retains Turkish retry error and unchanged reset credentials', async ({ page }) => {
    await account(page, { anonymous: true })
    await page.route(`**${allauth}/auth/password/reset`, async route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { status: 200 } })
        expect(route.request().postDataJSON()).toEqual({ key: 'valid-fixture', password })
        await route.fulfill({ json: { status: 400, errors: [{ code: 'password_too_short', param: 'password', message: 'This password is too short.' }] } })
    })
    await page.goto('/auth/password/confirm/valid-fixture')
    await expect(page.getByRole('heading', { name: 'Şifreyi sıfırla', exact: true })).toBeVisible()
    await page.getByLabel('Yeni şifre', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Yeni şifreyi belirle', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Şifre en az 8 karakter olmalı.')
    await expect(page.getByLabel('Yeni şifre', { exact: true })).toHaveValue(password)
})

test('email confirmation link localizes identity, action and unknown API failure', async ({ page }) => {
    await account(page, { anonymous: true })
    await page.route(`**${allauth}/auth/email/verify`, route => route.fulfill({ json: route.request().method() === 'GET'
        ? { status: 200, data: { email: 'staff@shipyard.test', user: { username: 'staff' } } }
        : { status: 400, errors: [{ code: 'unexpected_fixture', message: 'Internal verification failure' }] } }))
    await page.goto('/auth/email/confirm/email-fixture')
    await expect(page.getByRole('heading', { name: 'E-posta adresini doğrula', exact: true })).toBeVisible()
    await expect(page.getByText('staff kullanıcısına ait staff@shipyard.test e-posta adresini doğrulayın.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('E-posta doğrulanamadı. Tekrar deneyin.')
})

test('provider signup and callback errors have Turkish recovery text', async ({ page }) => {
    await account(page, { anonymous: true, pendingFlow: 'provider_signup' })
    await page.goto('/account/provider/signup')
    await expect(page.getByRole('heading', { name: 'Kaydı tamamla', exact: true })).toBeVisible()
    await page.goto('/account/provider/callback?error=access_denied')
    await expect(page.getByRole('heading', { name: 'Giriş başarısız', exact: true })).toBeVisible()
    await expect(page.getByText('Hesap sağlayıcısı erişime izin vermedi.', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Girişe dön', exact: true })).toBeVisible()
})

test('passkey signup instructions are Turkish without changing supported methods', async ({ page }) => {
    await account(page, { anonymous: true })
    await page.goto('/register/passkey')
    await expect(page.getByRole('heading', { name: 'Geçiş anahtarıyla kayıt ol', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Devam et', exact: true })).toBeVisible()
    await expect(page.getByText('Devam ettiğinizde cihazınızın biyometrik doğrulaması veya güvenlik anahtarıyla bir geçiş anahtarı oluşturmanız istenir.', { exact: true })).toBeVisible()
})

test('passkey creation has Turkish name and action within existing pending flow', async ({ page }) => {
    await account(page, { anonymous: true, pendingFlow: 'mfa_signup_webauthn' })
    await page.goto('/register/passkey/create')
    await expect(page.getByRole('heading', { name: 'Son adım', exact: true })).toBeVisible()
    await expect(page.getByLabel('Geçiş anahtarı adı', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Geçiş anahtarı oluştur', exact: true })).toBeVisible()
})

test('English password account keeps translated labels and unknown server errors stay readable', async ({ page }) => {
    await account(page, { language: 'en' })
    await page.route(`**${allauth}/account/password/change`, route => route.fulfill({ json: { status: 400, errors: [{ code: 'fixture', message: 'Raw server detail' }] } }))
    await page.goto('/account/password')
    await page.getByLabel('Current password', { exact: true }).fill(password)
    await page.getByLabel('New password', { exact: true }).fill(password)
    await page.getByLabel('Confirm new password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Update password', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Password could not be updated. Try again.')
})

test('password reset request translates server rate limit instead of English details', async ({ page }) => {
    await account(page, { anonymous: true })
    await page.route(`**${allauth}/auth/password/request`, route => route.fulfill({ json: { status: 429, errors: [{ code: 'rate_limit', message: 'Too many requests.' }] } }))
    await page.goto('/auth/password/request')
    await page.getByPlaceholder('ornek@email.com').fill('staff@shipyard.test')
    await page.getByRole('button', { name: 'Sıfırlama bağlantısı gönder', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.')
})

test('email code requires explicit submit, sends once while pending and retains Turkish retry feedback', async ({ page }) => {
    await account(page, { anonymous: true, pendingFlow: 'verify_email' })
    let requests = 0
    let release = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route(`**${allauth}/auth/email/verify`, async route => {
        requests += 1
        expect(route.request().postDataJSON()).toEqual({ key: '123456' })
        await gate
        await route.fulfill({ json: { status: 400, errors: [{ code: 'invalid_code', message: 'Invalid code.' }] } })
    })
    await page.goto('/auth/email/verify')
    const first = page.getByRole('textbox', { name: '1. hane', exact: true })
    await first.evaluate(input => {
        const data = new DataTransfer()
        data.setData('text/plain', '123456')
        input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    const submit = page.getByRole('button', { name: 'Kodu doğrula', exact: true })
    await expect(page.getByRole('textbox', { name: '6. hane', exact: true })).toHaveValue('6')
    await expect(submit).toBeEnabled()
    expect(requests).toBe(0)
    await submit.click()
    await expect.poll(() => requests).toBe(1)
    await expect(first).toBeDisabled()
    await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(requests).toBe(1)
    release()
    await expect(page.getByRole('alert')).toContainText('Kod geçersiz veya süresi dolmuş.')
    await expect(submit).toBeEnabled()
    await expect(first).toHaveValue('1')
    expect(requests).toBe(1)
    await submit.click()
    await expect.poll(() => requests).toBe(2)
    await expect(page.getByRole('alert')).toContainText('Kod geçersiz veya süresi dolmuş.')
    await expect(submit).toBeEnabled()
    expect(requests).toBe(2)
})

test('password login unknown error stays Turkish without raw server message', async ({ page }) => {
    await account(page, { anonymous: true })
    await page.route(`**${allauth}/auth/login`, route => route.fulfill({ json: { status: 400, errors: [{ code: 'invalid_credentials', message: 'The login credentials provided are invalid.' }] } }))
    await page.goto('/login')
    await page.getByPlaceholder('ornek@email.com').fill('staff@shipyard.test')
    await page.getByPlaceholder('Şifrenizi girin').fill(password)
    await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Giriş başarısız')
    await expect(page.getByRole('alert')).not.toContainText('The login credentials')
})

test('registration translates rejected password without changing submitted credentials', async ({ page }) => {
    await account(page, { anonymous: true })
    await page.route(`**${allauth}/auth/signup`, async route => {
        expect(route.request().postDataJSON()).toEqual({ username: 'staff', email: 'staff@shipyard.test', password })
        await route.fulfill({ json: { status: 400, errors: [{ code: 'password_too_similar', message: 'Password is too similar to username.' }] } })
    })
    await page.goto('/register')
    await page.getByPlaceholder('Kullanıcı adı seçin').fill('staff')
    await page.getByPlaceholder('ornek@email.com').fill('staff@shipyard.test')
    await page.getByPlaceholder('Güçlü bir şifre oluşturun').fill(password)
    await page.getByRole('button', { name: 'Hesap Oluştur', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Şifre, hesap bilgilerinize çok benziyor.')
})
