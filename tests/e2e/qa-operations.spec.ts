import { test, expect } from './electron.fixture';

test.describe('QA Operations', () => {
    test('creates, edits, and deletes a QA pair', async ({ window }) => {
        const timestamp = Date.now();
        const question = `Question ${timestamp}`;
        const answer = `Answer ${timestamp}`;
        const editedAnswer = `Edited Answer ${timestamp}`;

        // Ensure we are in a state where we can add (select Show all QAs)
        await window.getByTitle('Show all QAs').click();

        // Create QA
        await window.getByTestId('add-qa-button').click();

        // Fill form
        await window.locator('textarea[placeholder="Enter question..."]').fill(question);
        await window.locator('textarea[placeholder="Enter answer..."]').fill(answer);

        // Click 'Create QA'
        await window.getByRole('button', { name: 'Create QA' }).click();

        // Verify created
        const qaItemList = window.getByTestId('qa-list');
        await expect(qaItemList).toContainText(question);

        // Select the QA
        const qaItem = qaItemList.locator('.qa-item', { hasText: question });
        await qaItem.click();

        // Verify Content Panel
        await expect(window.locator('.qa-content-panel')).toContainText(answer);

        // Edit QA
        await window.getByTestId('edit-qa-button').click();

        // Edit Answer
        const editAnswer = window.locator('textarea').nth(1);
        await editAnswer.fill(editedAnswer);

        // Save
        await window.getByRole('button', { name: 'Save' }).click();

        // Verify Edit
        await expect(window.locator('.qa-content-panel')).toContainText(editedAnswer);

        // Delete QA
        await window.getByTestId('delete-qa-button').click();

        // Confirm delete
        const dialog = window.getByRole('alertdialog');
        await dialog.getByRole('button', { name: 'Delete' }).click();

        // Verify Deletion
        await expect(qaItemList.locator('.qa-item', { hasText: question })).toBeHidden();
    });
});
