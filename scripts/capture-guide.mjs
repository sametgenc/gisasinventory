/** Prepare local guide image candidates; review fictional data before publishing them. */
import { mkdir, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const requireFrontend = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = requireFrontend('@playwright/test')
const tr = requireFrontend('./src/i18n/locales/tr.json')
const baseUrl = 'http://127.0.0.1:5190'
const publicDir = fileURLToPath(new URL('../var/demo/screenshots/guide/public/', import.meta.url))
const docsDir = fileURLToPath(new URL('../var/demo/screenshots/guide/docs/', import.meta.url))
const health = await fetch(`${baseUrl}/demo/health/`)
if (!health.ok || !(await health.json()).demo) throw new Error('Only the isolated local demo can supply guide images.')
await mkdir(publicDir, { recursive: true })
await mkdir(docsDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
    async function account(email) {
        const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1280, height: 920 }, locale: 'tr-TR', reducedMotion: 'reduce' })
        await context.addInitScript(() => { localStorage.setItem('language', 'tr'); localStorage.setItem('vite-ui-theme', 'light') })
        const page = await context.newPage()
        await page.goto('/login')
        await page.locator('#login-email').fill(email)
        await page.locator('#login-password').fill(process.env.DEMO_PASSWORD || 'GisasDemo!2026')
        await page.locator('button[type=submit]').click()
        await page.waitForURL('**/dashboard')
        return { context, page }
    }
    async function capture(target, filename, docName) {
        const destination = path.join(publicDir, filename)
        await target.screenshot({ path: destination })
        await copyFile(destination, path.join(docsDir, docName))
        console.log(filename)
    }
    const manager = await account('yonetici@demo.gisas.test')
    const page = manager.page
    await page.goto('/assets', { waitUntil: 'networkidle' })
    await capture(page, 'inventory-types.png', 'inventory-types-desktop-light.png')
    await page.getByRole('button', { name: 'Forklift · Toyota 8FD ekipmanlarını aç', exact: true }).click()
    await page.getByRole('heading', { name: 'Forklift · Toyota 8FD', exact: true }).waitFor()
    await capture(page, 'inventory-equipment.png', 'inventory-equipment-desktop-light.png')
    await page.getByRole('button', { name: tr.assets.addNew, exact: true }).first().click()
    let dialog = page.getByRole('dialog', { name: tr.assets.createAsset })
    await dialog.getByRole('textbox', { name: /Ekipman kodu/ }).fill('MK-FL-031')
    await capture(dialog, 'asset-form.png', 'guide-asset-form.png')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^İşlemler: / }).first().click()
    const sharingButton = page.getByRole('button', { name: /^Paylaşımı yönet:/ })
    await sharingButton.click()
    dialog = page.getByRole('dialog', { name: tr.inventory.sharingTitle })
    await dialog.getByRole('checkbox').check()
    await dialog.getByRole('textbox', { name: tr.inventory.publicNote }).fill('3 ton forklift. Taşıma ve kullanım koşulları tersane ile görüşülür.')
    await capture(dialog, 'sharing-modal.png', 'guide-sharing-modal.png')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: tr.assets.importExcel, exact: true }).first().click()
    dialog = page.getByRole('dialog', { name: tr.assets.bulkImportTitle })
    const equipmentFile = await page.request.get('/demo/downloads/envanter-forklift.xlsx')
    await dialog.locator('input[type=file]').setInputFiles({ name: 'forklift.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await equipmentFile.body() })
    await capture(dialog, 'inventory-import-file.png', 'guide-inventory-import-file.png')
    await dialog.getByRole('button', { name: tr.assets.wizard.previewAction, exact: true }).click()
    await page.waitForLoadState('networkidle')
    await capture(dialog, 'inventory-import.png', 'guide-inventory-import.png')
    await page.keyboard.press('Escape')
    await page.goto('/shared-equipment', { waitUntil: 'networkidle' })
    await capture(page, 'shared-equipment.png', 'shared-equipment-desktop-light.png')
    await manager.context.close()

    const admin = await account('admin@demo.gisas.test')
    await admin.page.goto('/assets/types', { waitUntil: 'networkidle' })
    await capture(admin.page, 'catalog.png', 'guide-catalog.png')
    await admin.page.getByRole('button', { name: tr.catalog.importButton, exact: true }).click()
    dialog = admin.page.getByRole('dialog')
    const catalogFile = await admin.page.request.get('/demo/downloads/katalog-gecerli.xlsx')
    await dialog.locator('input[type=file]').setInputFiles({ name: 'katalog.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await catalogFile.body() })
    await dialog.getByRole('button', { name: tr.catalog.preview, exact: true }).click()
    await dialog.getByText('Pratik — Portatif vinç', { exact: true }).waitFor()
    await capture(dialog, 'catalog-preview.png', 'guide-catalog-preview.png')
    await admin.context.close()
} finally {
    await browser.close()
}
