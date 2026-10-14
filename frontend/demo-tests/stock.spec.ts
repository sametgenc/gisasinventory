import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { Asset, AssetType } from '../src/modules/assets/types'

for (const { width, theme } of [{ width: 1440, theme: 'light' }, { width: 390, theme: 'light' }, { width: 320, theme: 'dark' }]) {
    test(`optional stock sample matches API quantities at ${width}px ${theme}`, async ({ page }) => {
        await page.addInitScript(themeName => {
            localStorage.setItem('language', 'tr')
            localStorage.setItem('vite-ui-theme', themeName)
        }, theme)
        await page.setViewportSize({ width, height: 1000 })
        await page.goto('/login')
        await page.locator('#login-email').fill('admin@demo.gisas.test')
        await page.locator('#login-password').fill('GisasDemo!2026')
        await page.locator('button[type=submit]').click()
        await expect(page).toHaveURL(/\/dashboard$/)
        const typesResponse = await page.request.get('/api/assets/types/')
        expect(typesResponse.ok()).toBe(true)
        const types: AssetType[] = await typesResponse.json()
        const stockType = types.find(type => type.catalog_code === 'DEMO-STOCK-A-01')
        test.skip(!stockType, 'Optional sample requires a seeded stock sample type.')
        expect(stockType?.tracking_mode).toBe('stock')
        const assetsResponse = await page.request.get('/api/assets/items/')
        expect(assetsResponse.ok()).toBe(true)
        const assets: Asset[] = await assetsResponse.json()
        const records = assets.filter(asset => asset.asset_type === stockType?.id)
        expect(records.length).toBeGreaterThan(0)
        expect(records.every(asset => Number.isSafeInteger(asset.custom_data.quantity) && Number(asset.custom_data.quantity) >= 0)).toBe(true)
        const material = records.find(asset => Number(asset.custom_data.quantity) > 0)
        expect(material, 'Seeded stock includes a material with positive quantity.').toBeDefined()
        if (!material) return
        const tenantId = material.tenant
        const stockTypeIds = new Set(types.filter(type => type.tracking_mode === 'stock').map(type => type.id))
        const yardRecords = assets.filter(asset => asset.tenant === tenantId && stockTypeIds.has(asset.asset_type))
        const totalQuantity = yardRecords.reduce((total, asset) => total + Number(asset.custom_data.quantity), 0)
        expect(Number.isSafeInteger(totalQuantity)).toBe(true)
        const numberFormat = new Intl.NumberFormat('tr-TR')
        const quantityText = `${numberFormat.format(Number(material.custom_data.quantity))} adet`
        const materialName = String(material.custom_data.material_name).trim().replace(/\s+/g, ' ')
        const materialCode = String(material.custom_data.material_code).trim().replace(/\s+/g, ' ')
        const writes: string[] = []
        page.on('request', request => {
            if (request.url().includes('/api/assets/') && request.method() !== 'GET') writes.push(request.method())
        })
        await page.goto('/assets')
        await page.getByRole('combobox', { name: 'Tersane', exact: true }).selectOption(String(tenantId))
        await expect(page.getByText(`${numberFormat.format(yardRecords.length)} stok kalemi · ${numberFormat.format(totalQuantity)} parça`).first()).toBeVisible()
        const materialDescription = [materialCode, stockType?.name || material.asset_type_name, material.tenant_name].filter(Boolean).join(' · ')
        const platform = page.getByRole('button', { name: `${materialName} · ${material.tenant_name} malzeme ayrıntısını aç`, exact: true })
            .filter({ has: page.getByText(materialDescription, { exact: true }) })
        await expect(platform).toContainText(quantityText)
        await expect(platform).toContainText(materialCode)
        const zero = yardRecords.find(asset => Number(asset.custom_data.quantity) === 0)
        if (zero) {
            const zeroName = String(zero.custom_data.material_name).trim().replace(/\s+/g, ' ')
            const zeroCode = String(zero.custom_data.material_code).trim().replace(/\s+/g, ' ')
            const zeroTypeName = types.find(type => type.id === zero.asset_type)?.name || zero.asset_type_name
            const zeroDescription = [zeroCode, zeroTypeName, zero.tenant_name].filter(Boolean).join(' · ')
            const zeroButton = page.getByRole('button', { name: `${zeroName} · ${zero.tenant_name} malzeme ayrıntısını aç`, exact: true })
                .filter({ has: page.getByText(zeroDescription, { exact: true }) })
            await expect(zeroButton).toContainText('0 adet')
        }
        await expect(page.getByText('Model belirtilmemiş', { exact: true })).not.toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: path.resolve('..', 'var', 'demo', 'screenshots', `stock-${width}-${theme}.png`), fullPage: true })
        await page.screenshot({ path: path.resolve('..', 'var', 'demo', 'screenshots', `stock-viewport-${width}-${theme}.png`) })
        await platform.click()
        await expect(page.getByRole('dialog')).toContainText(quantityText)
        await expect(page.getByRole('dialog')).toContainText(materialCode)
        await page.keyboard.press('Escape')
        await expect(platform).toBeFocused()
        expect(writes).toEqual([])
    })
}
