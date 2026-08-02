import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { isSameUserDataDir } from './isolation';

/**
 * Per-test isolation for the Electron app.
 *
 * Two directories must be isolated, and they are isolated by different means:
 *
 *  - **The data directory** (archive/, threads.json) — via `LLM_AGGREGATOR_DATA_DIR`,
 *    which `settingsService.getDataDirectory()` honours ahead of settings.json.
 *
 *  - **`userData`** — via Chromium's `--user-data-dir` switch. This is where
 *    `settings.json`, `secrets.enc.json`, `embeddings.json`, and the model
 *    catalog cache all live.
 *
 * `--user-data-dir` is not interchangeable with environment variables here.
 * Overriding `APPDATA`/`LOCALAPPDATA` does **nothing** on Windows: Electron
 * resolves `appData` through the OS known-folder API (`SHGetKnownFolderPath`),
 * which never consults the environment. Tests therefore used to read — and
 * could have encrypted over — the developer's real `secrets.enc.json`, making
 * every secrets-dependent assertion pass or fail based on whose machine ran it.
 * See issue #4. `assertIsolated` below fails fast if that ever regresses.
 */

/** Sits directly under the temp root so the existing rmSync cleanup covers it. */
function userDataDirFor(dataDir: string): string {
    return path.join(path.dirname(dataDir), 'userdata');
}

export const test = base.extend<{
    electronApp: ElectronApplication;
    window: Page;
    dataDir: string;
}>({
    dataDir: async ({}, use) => {
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'llm-aggregator-e2e-'));
        const dataDir = path.join(tempRoot, 'data');
        mkdirSync(dataDir, { recursive: true });

        // With userData pinned by --user-data-dir, settings.json has exactly one
        // possible location — no need to guess at app-name folders any more.
        const userDataDir = userDataDirFor(dataDir);
        mkdirSync(userDataDir, { recursive: true });
        writeFileSync(
            path.join(userDataDir, 'settings.json'),
            JSON.stringify({ dataDirectory: dataDir }, null, 2),
            'utf-8',
        );

        await use(dataDir);

        rmSync(tempRoot, { recursive: true, force: true });
    },
    electronApp: async ({ dataDir }, use) => {
        const userDataDir = userDataDirFor(dataDir);
        const env: Record<string, string> = {
            ...(process.env as Record<string, string>),
            NODE_ENV: 'test',
            LLM_AGGREGATOR_DATA_DIR: dataDir,
        };
        // VS Code sets ELECTRON_RUN_AS_NODE=1 in terminals it spawns. Inherited, it
        // makes Electron start as plain Node: no window is ever created, and every
        // test fails with Playwright's opaque "Process failed to launch!".
        delete env.ELECTRON_RUN_AS_NODE;

        // Launch Electron application using the resolved executable path and absolute path to main.js
        const electronApp = await electron.launch({
            executablePath: require('electron'),
            args: [
                '--no-sandbox',
                `--user-data-dir=${userDataDir}`,
                path.join(__dirname, '../../dist-electron/main.js'),
            ],
            cwd: dataDir,
            env,
            // Increase timeout for Electron startup
            timeout: 45000
        });

        // Fail loudly rather than silently testing against the real profile.
        // Canonical exact-path equality, not startsWith (issue #15): the fixture
        // creates one exact directory, and a string prefix check would accept a
        // sibling such as `<root>/userdata-old`. Canonicalization only reconciles
        // OS aliases such as macOS `/var` → `/private/var`; equality stays exact.
        const resolvedUserData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
        const expectedUserData = path.resolve(userDataDir);
        if (!isSameUserDataDir(resolvedUserData, expectedUserData)) {
            await electronApp.close();
            throw new Error(
                `e2e isolation broken: Electron resolved userData to "${resolvedUserData}", ` +
                `expected exactly "${expectedUserData}". Tests would read the real secrets.enc.json ` +
                `and settings.json. Do not weaken this check — see issues #4 and #15.`,
            );
        }

        await use(electronApp);

        await electronApp.close();
    },
    window: async ({ electronApp }, use) => {
        // Get the first window
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');
        await use(window);
    },
});

export { expect } from '@playwright/test';
