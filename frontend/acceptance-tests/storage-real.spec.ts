import { expect, test } from '@playwright/test'
import { activate, assertLocalDemo, expectFits, login, managementLink } from './helpers'

for (const mode of [
    { name: 'desktop', width: 1440, height: 1000, keyboard: false },
    { name: 'mobile', width: 390, height: 844, keyboard: false },
    { name: 'keyboard', width: 1440, height: 900, keyboard: true },
]) {
    test.describe(mode.name, () => {
        test.use({ viewport: { width: mode.width, height: mode.height }, hasTouch: mode.name === 'mobile', isMobile: mode.name === 'mobile' })
        test('administrator reads real storage measurements and refreshes', async ({ page, baseURL }, testInfo) => {
            await assertLocalDemo(page, baseURL)
            await login(page, 'admin@demo.gisas.test', mode.keyboard)
            const measured = page.waitForResponse(response => response.url().endsWith('/api/settings/storage/') && response.request().method() === 'GET')
            await activate(page, await managementLink(page, 'App Settings', mode.keyboard), mode.keyboard)
            const response = await measured
            expect(response.status()).toBe(200)
            expect(response.headers()['cache-control']).toContain('no-store')
            const snapshot = await response.json()
            expect(snapshot.application_disk.status).not.toBe('unavailable')
            expect(snapshot.application_disk.total_bytes).toBeGreaterThan(0)
            expect(snapshot.database).toMatchObject({ status: 'ok', engine: 'sqlite', capacity_bytes: null, used_percent: null })
            expect(snapshot.database.size_bytes).toBeGreaterThan(0)
            expect(JSON.stringify(snapshot)).not.toContain('/private/')
            const storage = page.getByRole('region', { name: 'Storage usage', exact: true })
            await expect(storage.getByRole('progressbar', { name: 'Application disk usage', exact: true })).toBeVisible()
            await expect(storage).toContainText('Capacity unknown')
            const refreshed = page.waitForResponse(response => response.url().endsWith('/api/settings/storage/') && response.request().method() === 'GET')
            await activate(page, storage.getByRole('button', { name: 'Refresh storage usage', exact: true }), mode.keyboard)
            expect((await refreshed).status()).toBe(200)
            await expect(storage.getByRole('button', { name: 'Refresh storage usage', exact: true })).toBeEnabled()
            await expectFits(page)
            await storage.screenshot({ path: testInfo.outputPath(`storage-real-${mode.name}.png`) })
        })
    })
}

for (const role of ['personel', 'yonetici']) {
    test(`${role} cannot read real operational storage measurements`, async ({ page, baseURL }) => {
        await assertLocalDemo(page, baseURL)
        await login(page, `${role}@demo.gisas.test`)
        const response = await page.request.get('/api/settings/storage/')
        expect(response.status()).toBe(403)
        await page.goto('/platform/settings')
        await expect(page).toHaveURL(/\/dashboard$/)
        await expect(page.getByRole('region', { name: 'Storage usage', exact: true })).toHaveCount(0)
    })
}
