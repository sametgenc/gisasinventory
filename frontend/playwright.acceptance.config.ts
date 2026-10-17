import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './acceptance-tests',
    fullyParallel: false,
    workers: 1,
    timeout: 90000,
    outputDir: '/private/tmp/learnwithai-p3-acceptance-results',
    use: {
        baseURL: process.env.ACCEPTANCE_BASE_URL || 'http://127.0.0.1:5191',
        browserName: 'chromium',
        actionTimeout: 10000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
})
