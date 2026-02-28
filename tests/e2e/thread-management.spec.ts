import { test, expect } from './electron.fixture';

test.describe('Thread Management', () => {
    test('creates, renames, and deletes a thread', async ({ window }) => {
        const timestamp = Date.now();
        const threadName = `Thread ${timestamp}`;
        const renamedName = `Renamed ${timestamp}`;

        // Check initial state
        await expect(window.getByTestId('thread-list')).toBeVisible();

        // Create a new thread
        await window.getByTestId('add-thread-button').click();
        const newThreadInput = window.locator('.new-thread-input input');
        await newThreadInput.fill(threadName);
        await newThreadInput.press('Enter');

        // Verify thread is created
        const threadList = window.getByTestId('thread-list');
        const newThread = threadList.getByText(threadName);
        await expect(newThread).toBeVisible();

        // Rename thread
        const threadItem = threadList.locator('.thread-item', { hasText: threadName });
        // Force hover and click as hover-based actions can be flay in some Linux environments
        await threadItem.hover();
        const renameBtn = threadItem.getByTitle('Rename');
        await expect(renameBtn).toBeVisible();
        await renameBtn.click({ force: true });

        // Type new name
        const renameInput = threadItem.locator('.rename-input');
        await expect(renameInput).toBeVisible();
        await renameInput.fill(renamedName);
        await renameInput.press('Enter');

        // Verify rename
        await expect(threadList.getByText(renamedName)).toBeVisible();

        // Delete thread
        const renamedItem = threadList.locator('.thread-item', { hasText: renamedName });
        await renamedItem.hover();
        await renamedItem.getByTitle('Delete').click();

        // Handle PrimeVue confirm dialog
        const dialog = window.getByRole('alertdialog');
        await dialog.getByRole('button', { name: 'Delete' }).click();

        // Verify deletion
        await expect(threadList.getByText(renamedName)).toBeHidden();
    });
});
