import { test, expect } from '../e2e/electron.fixture';

test.describe('Visual Regression - Theme', () => {
    test('theme toggle matches baseline', async ({ window }) => {
        await expect(window.getByTestId('thread-list')).toBeVisible();

        // Toggle theme button
        // We can target the button by title 'Light mode' or 'Dark mode'
        // Usually, the app starts in one mode. We click whichever mode toggle is there.
        const modeToggle = window.locator('.toolbar-buttons button').filter({ has: window.locator('i.pi-sun, i.pi-moon') }).first();
        await modeToggle.click();

        // Wait for CSS transition
        await window.waitForTimeout(500);

        await expect(window).toHaveScreenshot('toggled-theme.png', {
            maxDiffPixelRatio: 0.05
        });
    });
});
