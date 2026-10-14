import { test, expect } from '@playwright/test'

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    test(`reveal begins at button center in both directions, including keyboard and scroll (${viewport.width}px)`, async ({ page }) => {
        await page.setViewportSize(viewport)
        await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
        await page.addInitScript(() => {
            const state = window as Window & { themeAnimationClips: string[] }
            state.themeAnimationClips = []
            const animate = Element.prototype.animate
            // Observe real browser effects at creation so a slow test runner
            // cannot miss an animation that already finished between RPC calls.
            Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
                const animation = animate.apply(this, args)
                const effect = animation.effect
                if (effect instanceof KeyframeEffect && effect.pseudoElement === '::view-transition-new(root)') {
                    state.themeAnimationClips.push(String(effect.getKeyframes()[0].clipPath))
                }
                return animation
            }
        })
        await page.goto('/tests/theme.html')
        const toggle = page.getByRole('button', { name: 'Toggle theme' })
        for (const activation of ['pointer', 'keyboard']) {
            if (activation === 'keyboard') await page.evaluate(() => window.scrollTo(0, 400))
            const rect = await toggle.boundingBox()
            if (!rect) throw new Error('Theme toggle is missing')
            const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
            if (activation === 'pointer') await toggle.click({ position: { x: 2, y: 2 } })
            else { await toggle.focus(); await page.keyboard.press('Enter') }
            await expect(page.locator('html')).toHaveClass(activation === 'pointer' ? /dark/ : /light/)
            await expect.poll(() => page.evaluate(() =>
                (window as Window & { themeAnimationClips: string[] }).themeAnimationClips[0],
            )).toBe(`circle(0px at ${center.x}px ${center.y}px)`)
            await page.evaluate(() => (window as Window & { themeAnimationClips: string[] }).themeAnimationClips.shift())
            await expect(page.locator('html')).not.toHaveClass(/theme-transitioning/)
        }
    })
}

test('system preference follows OS changes and first toggle inverts the visible theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.goto('/tests/theme.html')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await expect(page.locator('html')).toHaveClass(/light/)
    await page.getByRole('button', { name: 'Toggle theme' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.locator('html')).not.toHaveClass(/theme-transitioning/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
})

test('skipped transitions do not lock the toggle', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
    await page.goto('/tests/theme.html')
    await page.evaluate(() => {
        const start = document.startViewTransition.bind(document)
        document.startViewTransition = ((callback: () => void) => {
            const transition = start(callback)
            transition.skipTransition()
            return transition
        }) as typeof document.startViewTransition
    })
    await page.getByRole('button', { name: 'Toggle theme' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.locator('html')).not.toHaveClass(/theme-transitioning/)
    await page.getByRole('button', { name: 'Toggle theme' }).click()
    await expect(page.locator('html')).toHaveClass(/light/)
})

test('browsers without View Transitions still change theme', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(document, 'startViewTransition', { value: undefined }))
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/tests/theme.html')
    await page.getByRole('button', { name: 'Toggle theme' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
})
