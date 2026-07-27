import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

export const test = base.extend<{
    electronApp: ElectronApplication;
    window: Page;
    dataDir: string;
}>({
    dataDir: async ({}, use) => {
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'llm-aggregator-e2e-'));
        const dataDir = path.join(tempRoot, 'data');
        mkdirSync(dataDir, { recursive: true });

        const appDataRoot = path.join(tempRoot, 'appdata');
        const settingsPayload = JSON.stringify({ dataDirectory: dataDir }, null, 2);
        for (const appName of ['LLM Aggregator', 'llm-aggregator', 'Electron']) {
            const userDataDir = path.join(appDataRoot, appName);
            mkdirSync(userDataDir, { recursive: true });
            writeFileSync(path.join(userDataDir, 'settings.json'), settingsPayload, 'utf-8');
        }

        await use(dataDir);

        rmSync(tempRoot, { recursive: true, force: true });
    },
    electronApp: async ({ dataDir }, use) => {
        const env: Record<string, string> = {
            ...(process.env as Record<string, string>),
            NODE_ENV: 'test',
            LLM_AGGREGATOR_DATA_DIR: dataDir,
            APPDATA: path.join(path.dirname(dataDir), 'appdata'),
            LOCALAPPDATA: path.join(path.dirname(dataDir), 'appdata'),
            TEMP: path.join(path.dirname(dataDir), 'appdata'),
            TMP: path.join(path.dirname(dataDir), 'appdata'),
        };
        // VS Code sets ELECTRON_RUN_AS_NODE=1 in terminals it spawns. Inherited, it
        // makes Electron start as plain Node: no window is ever created, and every
        // test fails with Playwright's opaque "Process failed to launch!".
        delete env.ELECTRON_RUN_AS_NODE;

        // Launch Electron application using the resolved executable path and absolute path to main.js
        const electronApp = await electron.launch({
            executablePath: require('electron'),
            args: ['--no-sandbox', path.join(__dirname, '../../dist-electron/main.js')],
            cwd: dataDir,
            env,
            // Increase timeout for Electron startup
            timeout: 45000
        });

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
