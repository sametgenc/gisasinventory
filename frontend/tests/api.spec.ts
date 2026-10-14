import { test, expect } from '@playwright/test'

test('REST validation and permission errors reject; Allauth pending flows remain readable', async ({ page }) => {
    await page.route('**/api/assets/items/**', route => route.fulfill({ status: 400, json: { custom_data: ['Required'] } }))
    await page.route('**/_allauth/browser/v1/auth/session', route => route.fulfill({ status: 401, json: { status: 401, data: { flows: [] } } }))
    await page.goto('/tests/theme.html')
    const result = await page.evaluate(async () => {
        // Vite serves the real production API module to this test page.
        const modulePath = '/src/api/client.ts'
        const { default: api } = await import(modulePath)
        let rejectedStatus = 0
        try { await api.post('/api/assets/items/', {}) }
        catch (error) { rejectedStatus = (error as { response: { status: number } }).response.status }
        const auth = await api.get('/_allauth/browser/v1/auth/session')
        return { rejectedStatus, authStatus: auth.status, bodyStatus: auth.data.status }
    })
    expect(result).toEqual({ rejectedStatus: 400, authStatus: 401, bodyStatus: 401 })
})

test('multipart uploads retain a boundary and the CSRF header', async ({ page }) => {
    let contentType = ''
    let csrf = ''
    await page.route('**/api/assets/items/preview_import/', async route => {
        const headers = route.request().headers()
        contentType = headers['content-type']
        csrf = headers['x-csrftoken']
        await route.fulfill({ status: 200, json: {} })
    })
    await page.goto('/tests/theme.html')
    await page.evaluate(async () => {
        document.cookie = 'csrftoken=regression-token; path=/'
        const modulePath = '/src/api/client.ts'
        const { default: api } = await import(modulePath)
        const form = new FormData()
        form.append('file', new File(['example'], 'example.xlsx'))
        await api.post('/api/assets/items/preview_import/', form)
    })
    expect(contentType).toContain('multipart/form-data; boundary=')
    expect(csrf).toBe('regression-token')
})
