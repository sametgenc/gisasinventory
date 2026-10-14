import { expect, test, type Page } from '@playwright/test'
import { notificationPath, notificationTime } from '../src/modules/notification/presentation'
import type { NotificationData } from '../src/modules/notification/types'

const notification: NotificationData = { id: 1, uuid: 'notification-1', message: '37 kayıt aktarıldı.', type: 'success', content: { title: 'Aktarım tamamlandı', message: '37 kayıt aktarıldı.', type: 'success', url: '/assets' }, created_at: new Date().toISOString(), read_at: null, email_status: 'preview' }

async function mock(page: Page, markFails = false, preferenceFails = false) {
    let read = false
    let emailEnabled = true
    const actions: string[] = []
    await page.addInitScript(() => {
        localStorage.setItem('language', 'tr')
        localStorage.setItem('vite-ui-theme', 'light')
    })
    await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } } : { user: { id: '1', username: 'test', email: 'test@example.test', role: 'tenant_admin', tenant_slug: 'test-yard', tenant_name: 'Test Yard' }, methods: [] } } }))
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith('/stream/')) return route.abort()
        if (request.method() !== 'GET') actions.push(`${request.method()} ${path}`)
        if (path === '/api/notifications/1/mark_as_read/') {
            if (markFails) return route.fulfill({ status: 500, json: { detail: 'Try again.' } })
            read = true
        }
        let data: unknown = []
        if (path === '/api/notifications/preferences/') {
            if (request.method() === 'PATCH' && preferenceFails) return route.fulfill({ status: 500, json: { detail: 'Try again.' } })
            if (request.method() === 'PATCH') emailEnabled = request.postDataJSON().email_notifications_enabled
            data = { email_notifications_enabled: emailEnabled, preferred_language: 'tr' }
        }
        if (path === '/api/notifications/unread_count/') data = { unread_count: read ? 0 : 1 }
        if (path === '/api/notifications/') data = { count: 1, results: [{ ...notification, read_at: read ? new Date().toISOString() : null }], next: null, previous: null }
        await route.fulfill({ json: data })
    })
    return actions
}

test('notification paths reject external or ambiguous addresses and dates use Turkish', () => {
    for (const url of ['https://evil.test', '//evil.test', '/\\evil.test', '/assets\nInjected']) expect(notificationPath({ ...notification, content: { url } })).toBe('/notifications')
    expect(notificationPath(notification)).toBe('/assets')
    expect(notificationTime('not-a-date', 'tr', 'Şimdi')).toBe('Şimdi')
    expect(notificationTime(new Date(Date.now() - 120000).toISOString(), 'tr', 'Şimdi')).toMatch(/dakika/)
})

for (const width of [1440, 390, 320]) {
    test(`bell opens within viewport and marks selected notification read at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        const actions = await mock(page)
        await page.goto('/notifications')
        const trigger = page.getByRole('button', { name: 'Bildirimler', exact: true })
        await trigger.click()
        await expect(trigger).toHaveAttribute('aria-expanded', 'true')
        const region = page.getByRole('region', { name: 'Bildirimler', exact: true })
        const box = await region.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        await page.keyboard.press('Escape')
        await expect(region).not.toBeVisible()
        await expect(trigger).toBeFocused()
        await trigger.click()
        await region.getByRole('button', { name: /Aktarım tamamlandı/ }).click()
        await expect(page).toHaveURL(/\/assets$/)
        expect(actions).toContain('POST /api/notifications/1/mark_as_read/')
    })
}

test('read failures remain actionable and email preference persists without hiding security messages', async ({ page }) => {
    const actions = await mock(page, true)
    await page.goto('/notifications')
    await expect(page.getByRole('button', { name: 'Okundu işaretle: Aktarım tamamlandı' })).toBeVisible()
    const preference = page.getByRole('checkbox', { name: /Bildirimleri e-posta ile de al/ })
    await expect(preference).toBeChecked()
    await preference.uncheck()
    await expect(preference).not.toBeChecked()
    expect(actions).toContain('PATCH /api/notifications/preferences/')
    await expect(page.getByText(/Hesap güvenliği e-postaları/)).toBeVisible()
    await page.getByRole('button', { name: 'Bildirimler', exact: true }).click()
    const region = page.getByRole('region', { name: 'Bildirimler', exact: true })
    await region.getByRole('button', { name: /Aktarım tamamlandı/ }).click()
    await expect(region.getByRole('alert')).toHaveText('İşlem tamamlanamadı. Tekrar deneyin.')
    await expect(page).toHaveURL(/\/notifications$/)
})


test('failed preference save restores the saved selection and exposes a retryable error', async ({ page }) => {
    await mock(page, false, true)
    await page.goto('/notifications')
    const preference = page.getByRole('checkbox', { name: /Bildirimleri e-posta ile de al/ })
    await expect(preference).toBeChecked()
    await preference.click()
    await expect(page.getByRole('alert')).toHaveText('İşlem tamamlanamadı. Tekrar deneyin.')
    await expect(preference).toBeChecked()
    await expect(preference).toBeEnabled()
})
