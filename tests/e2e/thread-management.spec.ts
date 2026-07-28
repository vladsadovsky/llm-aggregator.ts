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
        const newThreadInput = window.getByTestId('new-thread-name-input');
        await newThreadInput.fill(threadName);
        await newThreadInput.press('Enter');

        // Verify thread is created
        const threadList = window.getByTestId('thread-list');
        const newThread = threadList.locator('.thread-item', { hasText: threadName });
        await expect(newThread).toBeVisible();

        // Rename thread
        const threadItem = newThread;
        // Force hover and click as hover-based actions can be flay in some Linux environments
        await threadItem.hover();
        const renameBtn = threadItem.getByTitle('Rename');
        await expect(renameBtn).toBeVisible();
        await renameBtn.click({ force: true });

        // Type new name
        const renameInput = threadList.getByPlaceholder('Thread name');
        await expect(renameInput).toBeVisible();
        await renameInput.click();
        await renameInput.press('ControlOrMeta+A');
        await renameInput.fill(renamedName);
        // Commit via the explicit Save action. This previously relied on Tab
        // triggering a blur-commit, which also made the tags field unreachable.
        await window.getByTestId('rename-thread-save').click();

        // Verify rename
        const renamedItem = threadList.locator('.thread-item', { hasText: renamedName });
        await expect(renamedItem).toBeVisible();

        // Delete thread
        await renamedItem.hover();
        await renamedItem.getByTitle('Delete').click();

        // Handle PrimeVue confirm dialog
        const dialog = window.getByRole('alertdialog');
        await dialog.getByRole('button', { name: 'Delete' }).click();

        // Verify deletion
        await expect(threadList.locator('.thread-item', { hasText: renamedName })).toHaveCount(0);
    });
});

/**
 * Mouse-only paths. Every action below is reachable without touching Enter or
 * Escape — the original inline editors could only be committed from the keyboard,
 * which left mouse users with no visible way to finish.
 */
test.describe('Thread editors — mouse-only affordances', () => {
    test('creates a thread with the Create button, without pressing Enter', async ({ window }) => {
        const threadName = `Mouse Create ${Date.now()}`;

        await window.getByTestId('add-thread-button').click();
        await window.getByTestId('new-thread-name-input').fill(threadName);
        await window.getByTestId('new-thread-create').click();

        await expect(
            window.getByTestId('thread-list').locator('.thread-item', { hasText: threadName }),
        ).toBeVisible();
    });

    test('keeps Create disabled until a name is entered', async ({ window }) => {
        await window.getByTestId('add-thread-button').click();

        const createButton = window.getByTestId('new-thread-create');
        await expect(createButton).toBeDisabled();

        // Tags alone must not enable creation — name is the required field.
        await window.getByTestId('new-thread-tags-input').fill('tag-only');
        await expect(createButton).toBeDisabled();

        await window.getByTestId('new-thread-name-input').fill('Now valid');
        await expect(createButton).toBeEnabled();

        await window.getByTestId('new-thread-cancel').click();
    });

    test('hides the Add thread button while the form is open, and Cancel discards', async ({ window }) => {
        const discarded = `Discarded ${Date.now()}`;
        const addButton = window.getByTestId('add-thread-button');

        await addButton.click();
        // Previously a toggle: clicking it again silently threw away typed input.
        await expect(addButton).toBeHidden();

        await window.getByTestId('new-thread-name-input').fill(discarded);
        await window.getByTestId('new-thread-cancel').click();

        await expect(addButton).toBeVisible();
        await expect(
            window.getByTestId('thread-list').locator('.thread-item', { hasText: discarded }),
        ).toHaveCount(0);
    });

    test('renames a thread and edits its tags via Save', async ({ window }) => {
        const timestamp = Date.now();
        const threadName = `Tag Edit ${timestamp}`;
        const renamedName = `Tag Edited ${timestamp}`;
        const tag = `tag${timestamp}`;

        await window.getByTestId('add-thread-button').click();
        await window.getByTestId('new-thread-name-input').fill(threadName);
        await window.getByTestId('new-thread-create').click();

        const threadList = window.getByTestId('thread-list');
        const threadItem = threadList.locator('.thread-item', { hasText: threadName });
        await threadItem.hover();
        await threadItem.getByTitle('Rename').click({ force: true });

        await window.getByTestId('rename-thread-name-input').fill(renamedName);
        // Reaching this field at all is the regression under test: the name input
        // used to commit on blur, unmounting the form before tags could be typed.
        await window.getByTestId('rename-thread-tags-input').fill(tag);
        await window.getByTestId('rename-thread-save').click();

        const renamed = threadList.locator('.thread-item', { hasText: renamedName });
        await expect(renamed).toBeVisible();
        await expect(renamed.locator('.thread-tag', { hasText: tag })).toBeVisible();
    });

    test('discards a rename when Cancel is clicked', async ({ window }) => {
        const timestamp = Date.now();
        const threadName = `Keep Name ${timestamp}`;

        await window.getByTestId('add-thread-button').click();
        await window.getByTestId('new-thread-name-input').fill(threadName);
        await window.getByTestId('new-thread-create').click();

        const threadList = window.getByTestId('thread-list');
        const threadItem = threadList.locator('.thread-item', { hasText: threadName });
        await threadItem.hover();
        await threadItem.getByTitle('Rename').click({ force: true });

        await window.getByTestId('rename-thread-name-input').fill(`Abandoned ${timestamp}`);
        await window.getByTestId('rename-thread-cancel').click();

        await expect(threadList.locator('.thread-item', { hasText: threadName })).toBeVisible();
        await expect(
            threadList.locator('.thread-item', { hasText: `Abandoned ${timestamp}` }),
        ).toHaveCount(0);
    });
});
