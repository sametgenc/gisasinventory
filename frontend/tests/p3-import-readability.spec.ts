import { expect, test } from '@playwright/test'

for (const [language, yes, no] of [['tr', 'Evet', 'Hayır'], ['en', 'Yes', 'No']]) {
    test(`checkbox values in Excel preview are readable without translating literal text (${language})`, async ({ page }) => {
        await page.addInitScript(language => localStorage.setItem('language', language), language)
        await page.route('**/_allauth/browser/v1/**', route => route.fulfill({ json: { status: 200, meta: { is_authenticated: true }, data: route.request().url().endsWith('/config') ? { account: {}, socialaccount: { providers: [] }, mfa: { supported_types: [] } } : { user: { id: '1', username: 'sample', email: 'sample@example.test', role: 'tenant_user', tenant_id: 1, tenant_slug: 'yard' }, methods: [] } } }))
        await page.route(url => url.pathname.startsWith('/api/'), route => {
            const path = new URL(route.request().url()).pathname
            if (path.endsWith('/stream/')) return route.abort()
            let data: unknown = []
            if (path === '/api/assets/types/') data = [{ id: 'example', name: 'Example tool', schema: [{ key: 'ready', label: 'Ready', type: 'checkbox' }, { key: 'notes', label: 'Notes', type: 'text' }] }]
            if (path.endsWith('/preview_import/')) data = { headers: ['Ready', 'Notes'], preview_rows: [['True', 'True'], ['False', 'False']], total_rows: 2, detected_template: { asset_type_id: 'example', asset_type_name: 'Example tool' } }
            if (path.endsWith('/unread_count/')) data = { unread_count: 0 }
            return route.fulfill({ json: data })
        })
        await page.goto('/assets')
        await page.getByRole('button', { name: language === 'tr' ? 'Excel’den aktar' : 'Import from Excel', exact: true }).first().click()
        const dialog = page.getByRole('dialog')
        await dialog.locator('input[type=file]').setInputFiles({ name: 'example.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('mock workbook') })
        await dialog.getByRole('button', { name: language === 'tr' ? 'Önizle ve Devam Et' : 'Preview & continue', exact: true }).click()
        await expect(dialog.getByRole('cell', { name: yes, exact: true })).toHaveCount(1)
        await expect(dialog.getByRole('cell', { name: no, exact: true })).toHaveCount(1)
        await expect(dialog.getByRole('cell', { name: 'True', exact: true })).toHaveCount(1)
        await expect(dialog.getByRole('cell', { name: 'False', exact: true })).toHaveCount(1)
    })
}
