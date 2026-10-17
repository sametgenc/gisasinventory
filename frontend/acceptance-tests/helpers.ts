import { expect, type Locator, type Page } from '@playwright/test'

export async function assertLocalDemo(page: Page, baseURL: string | undefined) {
    expect(baseURL).toBeTruthy()
    expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname)
    const health = await page.request.get('/demo/health/')
    expect(health.ok()).toBe(true)
    expect(await health.json()).toMatchObject({ demo: true, status: 'ready' })
}

export async function tabTo(page: Page, target: Locator) {
    await expect(target).toHaveCount(1)
    for (let index = 0; index < 100; index += 1) {
        if (await target.evaluate(element => element === document.activeElement)) return
        await page.keyboard.press('Tab')
    }
    throw new Error(`Could not reach ${await target.getAttribute('aria-label') || await target.textContent()} with Tab`)
}

export async function activate(page: Page, target: Locator, keyboard: boolean) {
    if (keyboard) { await tabTo(page, target); await page.keyboard.press('Enter') }
    else if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await target.tap()
    else await target.click()
}

export async function enter(page: Page, target: Locator, text: string, keyboard: boolean) {
    if (keyboard) {
        await tabTo(page, target)
        await page.keyboard.press('ControlOrMeta+A')
        await page.keyboard.insertText(text)
    } else await target.fill(text)
}

export async function select(page: Page, target: Locator, value: string, keyboard: boolean) {
    if (!keyboard) { await target.selectOption(value); return }
    await tabTo(page, target)
    const options = await target.locator('option').evaluateAll(options => options.map(option => ({ value: (option as HTMLOptionElement).value, label: option.textContent?.trim() ?? '' })))
    const option = options.find(option => option.value === value)
    expect(option).toBeTruthy()
    await expect(target).toBeFocused()
    // Native typeahead chooses the visible label without opening an OS-specific popup.
    await page.keyboard.type(option!.label)
    await expect(target).toHaveValue(value)
    await expect(target).toBeFocused()
}

export async function login(page: Page, email: string, keyboard = false, language = 'en') {
    await page.addInitScript(language => {
        localStorage.setItem('language', language)
        localStorage.setItem('vite-ui-theme', 'light')
    }, language)
    await page.goto('/login')
    await enter(page, page.locator('#login-email'), email, keyboard)
    await enter(page, page.locator('#login-password'), 'GisasDemo!2026', keyboard)
    await activate(page, page.locator('button[type=submit]'), keyboard)
    await expect(page).toHaveURL(/\/dashboard$/)
}

export async function csrf(page: Page) {
    const cookies = await page.context().cookies()
    return { 'X-CSRFToken': cookies.find(cookie => cookie.name === 'csrftoken')?.value ?? '' }
}

export async function expectFits(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

export async function mainLink(page: Page, name: string | RegExp, keyboard: boolean) {
    const menu = page.getByRole('button', { name: 'Toggle navigation menu', exact: true })
    if (await menu.isVisible()) {
        await activate(page, menu, keyboard)
        return page.locator('#mobile-navigation').getByRole('link', { name, exact: true })
    }
    return page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name, exact: true })
}

export async function managementLink(page: Page, name: string | RegExp, keyboard: boolean) {
    const mobile = page.getByRole('button', { name: 'Toggle navigation menu', exact: true })
    if (await mobile.isVisible()) {
        await activate(page, mobile, keyboard)
        return page.locator('#mobile-navigation').getByRole('link', { name, exact: true })
    }
    await activate(page, page.getByRole('button', { name: 'Management', exact: true }), keyboard)
    return page.locator('#management-navigation').getByRole('link', { name, exact: true })
}
