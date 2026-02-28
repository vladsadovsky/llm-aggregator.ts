import { test, expect } from './electron.fixture';

test.describe('Search', () => {
    test('filters QAs based on search input', async ({ window }) => {
        const timestamp = Date.now();
        const searchKey = `key${timestamp}`;
        const question = `Searchable Question ${searchKey}`;

        // Ensure we are in a state where we can add (select Show all QAs)
        await window.getByTitle('Show all QAs').click();

        // First, create a specific QA to search for
        await window.getByTestId('add-qa-button').click();
        await window.locator('textarea[placeholder="Enter question..."]').fill(question);
        await window.locator('textarea[placeholder="Enter answer..."]').fill('This is the answer.');
        await window.getByRole('button', { name: 'Create QA' }).click();

        // Verify it appeared
        await expect(window.getByTestId('qa-list')).toContainText(question);

        // Use search
        const searchInput = window.getByTestId('search-input');
        await searchInput.fill(searchKey);

        // Wait for debounce and result
        await expect(window.getByTestId('qa-list')).toContainText(question);

        // Search for something that shouldn't match
        await searchInput.fill('NonExistentTerm999');
        await expect(window.getByTestId('qa-list')).not.toContainText(question, { timeout: 3000 });

        // Clear search
        await searchInput.fill('');
        await expect(window.getByTestId('qa-list')).toContainText(question);
    });
});
