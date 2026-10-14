import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './demo-tests',
    fullyParallel: false,
    workers: 1,
    outputDir: './demo-test-results',
    timeout: 45000,
    use: {
        baseURL: 'http://127.0.0.1:5190',
        browserName: 'chromium',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
})
