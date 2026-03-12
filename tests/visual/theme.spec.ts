import { test, expect } from '../e2e/electron.fixture';

test.describe('Visual Regression - Theme', () => {
    test('theme toggle matches baseline', async ({ window }) => {
        await expect(window.getByTestId('thread-list')).toBeVisible();

        // Toggle theme button using the stable title exposed by the current shell.
        const modeToggle = window.getByTitle(/Dark mode|Light mode/);
        await modeToggle.click();

        // Wait for CSS transition
        await window.waitForTimeout(500);

        await expect(window).toHaveScreenshot('toggled-theme.png', {
            maxDiffPixelRatio: 0.05
        });
    });
});
