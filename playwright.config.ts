// playwright.config.ts
//
// E2E test suite for the built static output (NOT astro dev — deploy parity).
// webServer spawns `astro preview` which serves dist/ at port 4321 at the SAME
// base path GitHub Pages uses (/real-world-cryptography/), so a test that
// breaks against GH Pages also breaks against this preview run.
//
// baseURL includes the base path so tests can use page.goto('/') and land
// on the cohort homepage rather than the bare preview root.
//
// Chromium-only in v1 (CONTEXT lock). Add 'firefox' / 'webkit' projects only
// if a cross-browser bug surfaces.

import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const BASE = '/real-world-cryptography';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI === 'true' ? 1 : 0,
  workers: process.env.CI === 'true' ? 2 : 1,
  reporter: process.env.CI === 'true' ? [['github'], ['list']] : 'list',

  use: {
    baseURL: `http://localhost:${PORT}${BASE}/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm exec astro preview --port 4321',
    url: `http://localhost:${PORT}${BASE}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
