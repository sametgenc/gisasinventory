import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    use: {
        baseURL: 'http://127.0.0.1:5187',
        browserName: 'chromium',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5187',
        url: 'http://127.0.0.1:5187/tests/theme.html',
        reuseExistingServer: false,
    },
})
