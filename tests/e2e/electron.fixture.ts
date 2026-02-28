import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';

export const test = base.extend<{
    electronApp: ElectronApplication;
    window: Page;
}>({
    electronApp: async ({ }, use) => {
        // Launch Electron application using the resolved executable path and absolute path to main.js
        const electronApp = await electron.launch({
            executablePath: require('electron'),
            args: ['--no-sandbox', path.join(__dirname, '../../dist-electron/main.js')],
            env: {
                ...process.env,
                NODE_ENV: 'test',
            },
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
