import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(frontendDir, '..')
const backendPort = 4010
const frontendPort = 4174
const backendBaseUrl = `http://127.0.0.1:${backendPort}`
const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`
const e2eFrontendOutDir = '.e2e-dist'

process.env.E2E_API_BASE_URL = `${backendBaseUrl}/api`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: 'list',
  use: {
    baseURL: frontendBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run build && npm start',
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(backendPort),
      },
      url: `${backendBaseUrl}/api/system/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npm run build -- --outDir ${e2eFrontendOutDir} && npm run preview -- --host 127.0.0.1 --port ${frontendPort} --outDir ${e2eFrontendOutDir}`,
      cwd: frontendDir,
      env: {
        ...process.env,
        VITE_API_BASE_URL: process.env.E2E_API_BASE_URL,
        VITE_APP_ENV: 'development',
      },
      url: `${frontendBaseUrl}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})