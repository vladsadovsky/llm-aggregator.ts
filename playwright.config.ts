import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    // Playwright specs are *.spec.ts; tests/unit/*.test.ts are Vitest suites.
    // Without this, Playwright's default pattern collects the unit tests too and
    // fails on `import { ... } from 'vitest'` before any e2e test runs.
    testMatch: '**/*.spec.ts',
    timeout: 30000,
    expect: {
        timeout: 5000
    },
    fullyParallel: false,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'electron',
            use: {},
        },
    ],
});
