import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
const production = process.env.E2E_PRODUCTION === 'true';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 150000,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    baseURL:
      process.env.E2E_BASE_URL || (production ? 'http://127.0.0.1:2570' : 'http://127.0.0.1:5173'),
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : production
      ? [
          {
            command: 'npm run start -w @kitchen/server',
            url: 'http://127.0.0.1:2570/health',
            env: {
              PORT: '2570',
              HOST: '127.0.0.1',
              CLIENT_DIST: resolve('apps/client/dist'),
              DATABASE_URL: process.env.E2E_ACCOUNT_DATABASE_URL ?? '',
              GUEST_ONLY: process.env.E2E_ACCOUNT_DATABASE_URL ? 'false' : 'true',
            },
            timeout: 30000,
          },
        ]
      : [
          {
            command: 'npm run dev -w @kitchen/server',
            url: 'http://127.0.0.1:2567/health',
            reuseExistingServer: !process.env.CI,
            timeout: 30000,
          },
          {
            command: 'npm run dev -w @kitchen/client',
            url: 'http://127.0.0.1:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 30000,
          },
        ],
});
