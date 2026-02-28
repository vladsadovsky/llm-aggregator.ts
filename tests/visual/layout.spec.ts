import { test, expect } from '../e2e/electron.fixture';

test.describe('Visual Regression - Layout', () => {
    test('main layout matches baseline', async ({ window }) => {
        // Wait for the main components to be visible so we don't snapshot a loading state
        await expect(window.getByTestId('thread-list')).toBeVisible();
        await expect(window.getByTestId('qa-list')).toBeVisible();

        // Set a consistent size just for snapshots if needed,
        // though Playwright does this globally quite well.
        // Taking a screenshot of the whole page:
        await expect(window).toHaveScreenshot('main-layout.png', {
            maxDiffPixelRatio: 0.05
        });
    });
});
