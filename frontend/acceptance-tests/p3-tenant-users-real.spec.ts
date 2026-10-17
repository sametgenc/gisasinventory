import { expect, test } from '@playwright/test'
import type { Tenant, TenantUser } from '../src/modules/tenants/types'
import { activate, assertLocalDemo, csrf, enter, expectFits, login, mainLink } from './helpers'

const modes = [
    { name: 'desktop', width: 1440, height: 1000, keyboard: false },
    { name: 'mobile', width: 390, height: 844, keyboard: false },
    { name: 'keyboard', width: 1440, height: 900, keyboard: true },
] as const
const fixtures = new Map<string, { own: TenantUser; foreign: TenantUser }>()
const nonce = Date.now().toString()

test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL })
    try {
        const page = await context.newPage()
        await assertLocalDemo(page, baseURL)
        await login(page, 'admin@demo.gisas.test')
        const usersResponse = await page.request.get('/api/tenants/all-users/')
        expect(usersResponse.status()).toBe(200)
        const users: TenantUser[] = await usersResponse.json()
        const manager = users.find(user => user.email === 'yonetici@demo.gisas.test')
        expect(manager).toMatchObject({ role: 'tenant_admin', is_superuser: false, is_active: true })
        expect(manager?.tenant_slug).toBeTruthy()
        const tenantsResponse = await page.request.get('/api/tenants/')
        expect(tenantsResponse.status()).toBe(200)
        const tenants: Tenant[] = await tenantsResponse.json()
        const foreignTenant = tenants.find(tenant => tenant.is_active && tenant.slug !== manager!.tenant_slug)
        expect(foreignTenant).toBeDefined()
        const headers = await csrf(page)
        for (const mode of modes) {
            const created: TenantUser[] = []
            for (const [scope, slug] of [['own', manager!.tenant_slug!], ['foreign', foreignTenant!.slug]]) {
                const username = `p3_users_${mode.name}_${scope}_${nonce}`
                const response = await page.request.post(`/api/tenants/${slug}/create-user/`, { headers, data: {
                    username, email: `${username}@example.test`, password: 'Fictional-user!2026', role: 'tenant_user',
                } })
                expect(response.status(), await response.text()).toBe(201)
                const user: TenantUser = await response.json()
                expect(user).toMatchObject({ username, role: 'tenant_user', tenant_slug: slug, is_superuser: false })
                created.push(user)
            }
            fixtures.set(mode.name, { own: created[0], foreign: created[1] })
        }
    } finally { await context.close() }
})

for (const mode of modes) test.describe(mode.name, () => {
    test.use({ viewport: { width: mode.width, height: mode.height }, hasTouch: mode.name === 'mobile', isMobile: mode.name === 'mobile' })
    test(`shipyard administrator lists edits and saves own user with ${mode.name}`, async ({ page }, testInfo) => {
        const { own, foreign } = fixtures.get(mode.name)!
        await login(page, 'yonetici@demo.gisas.test', mode.keyboard)
        await activate(page, await mainLink(page, 'My Users', mode.keyboard), mode.keyboard)
        await expect(page.getByRole('heading', { name: 'My Shipyard Users', exact: true })).toBeVisible()
        await expect(page.getByText('New user accounts are created by a platform administrator.', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: /Create New User|Create user|Assign user/i })).toHaveCount(0)
        const listedResponse = await page.request.get('/api/tenants/my-users/')
        expect(listedResponse.status()).toBe(200)
        const listed: TenantUser[] = await listedResponse.json()
        expect(listed.some(user => user.id === own.id)).toBe(true)
        expect(listed.some(user => user.id === foreign.id)).toBe(false)
        expect(listed.every(user => user.tenant_slug === own.tenant_slug)).toBe(true)

        await enter(page, page.getByPlaceholder('Search users...', { exact: true }), own.username, mode.keyboard)
        const row = page.getByRole('row').filter({ hasText: own.email })
        await expect(row).toHaveCount(1)
        await activate(page, row.getByRole('button', { name: 'Edit', exact: true }), mode.keyboard)
        const edit = page.getByRole('dialog', { name: 'Edit user', exact: true })
        await expect(edit.getByRole('textbox', { name: 'Username', exact: true })).toBeDisabled()
        await expect(edit.getByRole('button', { name: /^Platform Admin/ })).toHaveCount(0)
        await expect(edit.getByRole('combobox', { name: 'Shipyard', exact: true })).toHaveCount(0)
        const firstName = `P3 ${mode.name}`, lastName = 'Edited', email = `${own.username}.edited@example.test`
        await enter(page, edit.getByRole('textbox', { name: 'First Name', exact: true }), firstName, mode.keyboard)
        await enter(page, edit.getByRole('textbox', { name: 'Last Name', exact: true }), lastName, mode.keyboard)
        await enter(page, edit.getByRole('textbox', { name: 'Email', exact: true }), email, mode.keyboard)
        await activate(page, edit.getByRole('button', { name: 'Save', exact: true }), mode.keyboard)
        await expect(edit).not.toBeVisible()
        await expect(page.getByRole('row').filter({ hasText: email })).toContainText(`${firstName} ${lastName}`)
        const savedResponse = await page.request.get('/api/tenants/my-users/')
        expect(savedResponse.status()).toBe(200)
        const saved: TenantUser[] = await savedResponse.json()
        expect(saved.find(user => user.id === own.id)).toMatchObject({ first_name: firstName, last_name: lastName, email,
            role: 'tenant_user', tenant_slug: own.tenant_slug, is_active: true, is_superuser: false })

        const headers = await csrf(page)
        const foreignUsers = await page.request.get(`/api/tenants/${foreign.tenant_slug}/users/`)
        expect([403, 404]).toContain(foreignUsers.status())
        const foreignUpdate = await page.request.patch(`/api/tenants/update-user/${foreign.id}/`, { headers, data: { first_name: 'Denied P3 edit' } })
        expect([403, 404]).toContain(foreignUpdate.status())
        expect((await page.request.get('/api/tenants/all-users/')).status()).toBe(403)
        await expectFits(page)
        await page.screenshot({ path: testInfo.outputPath(`shipyard-users-${mode.name}.png`), animations: 'disabled' })
    })
})
