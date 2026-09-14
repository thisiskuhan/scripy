import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  testMatch: [
    '**/responsive.spec.ts',
    '**/favicon.spec.ts',
    '**/login.spec.ts',
    '**/home.spec.ts',
    '**/multi-instance.spec.ts',
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
    timeout: 60000,
    env: { VITE_GOOGLE_CLIENT_ID: 'scripy-e2e.apps.googleusercontent.com' },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
})
