import { test, expect } from './electron.fixture';

test.describe('Merged Fork Features', () => {
    test('supports collapse controls and reopening threads panel', async ({ window }) => {
        await expect(window.getByTestId('thread-list')).toBeVisible();
        await window.getByTestId('threads-panel-toggle').click();
        await expect(window.getByTestId('show-threads-button')).toBeVisible();
        await window.getByTestId('show-threads-button').click();
        await expect(window.getByTestId('thread-list')).toBeVisible();

        await window.getByTestId('list-panel-toggle').click();
        await expect(window.getByTestId('list-panel-toggle')).toBeVisible();
        await window.getByTestId('list-panel-toggle').click();
        await expect(window.getByTestId('qa-list')).toBeVisible();
    });

    test('supports unthreaded mode, add-to-thread, and zoom', async ({ window }) => {
        const timestamp = Date.now();
        const threadName = `Thread ${timestamp}`;
        const question = `Merged feature question ${timestamp}`;
        const answer = `Merged feature answer ${timestamp}`;

        await window.getByTestId('add-thread-button').click();
        await expect(window.getByTestId('new-thread-tags-input')).toBeVisible();
        await window.getByTestId('new-thread-name-input').fill(threadName);
        await window.getByTestId('new-thread-name-input').press('Enter');

        await expect(window.getByTestId('thread-list')).toContainText(threadName);

        await window.getByTestId('show-unthreaded-button').click();
        await expect(window.locator('.qa-list-panel .panel-title')).toContainText('Unthreaded');
        await expect(window.getByTestId('qa-list')).toContainText('All QAs are in threads');

        await window.getByTestId('add-qa-button').click();
        await window.getByTestId('target-thread-select').click();
        await window.getByRole('option', { name: 'None (unassigned)' }).click();
        await window.locator('textarea[placeholder="Enter question..."]').fill(question);
        await window.locator('textarea[placeholder="Enter answer..."]').fill(answer);
        await window.getByRole('button', { name: 'Create QA' }).click();

        await expect(window.getByTestId('qa-list')).toContainText('Merged feature question');
        await window.locator('.qa-item', { hasText: 'Merged feature question' }).click();
        await expect(window.locator('.thread-bar-none')).toContainText('not in any thread');

        await window.getByTestId('add-to-thread-select').click();
        await window.getByRole('option', { name: threadName }).click();

        await expect(window.locator('.thread-chip')).toContainText(threadName);

        await expect(window.getByTestId('zoom-label')).toHaveText('100%');
        await window.getByTitle('Zoom in').click();
        await expect(window.getByTestId('zoom-label')).not.toHaveText('100%');
    });
});