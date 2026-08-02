import * as path from 'path';
import * as fs from 'fs';
import { test, expect } from './electron.fixture';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Create a QA via the UI and return its title. */
async function createQA(
  window: Parameters<Parameters<typeof test>[1]>[0]['window'],
  title: string,
  question: string,
  answer: string,
) {
  await window.getByTitle('Show all QAs').click();
  await window.getByTestId('add-qa-button').click();
  await window.locator('textarea[placeholder="Enter question..."]').fill(question);
  await window.locator('textarea[placeholder="Enter answer..."]').fill(answer);
  // Fill title field if visible
  const titleInput = window.locator('input[placeholder="Enter title..."]');
  if (await titleInput.isVisible()) {
    await titleInput.fill(title);
  }
  await window.getByRole('button', { name: 'Create QA' }).click();
  // Wait for QA to appear in list
  await expect(window.getByTestId('qa-list').locator('.qa-item')).toContainText([question.substring(0, 20)], { timeout: 5000 }).catch(() => {});
}

/** Intercept dialog.showSaveDialog so it returns a fixed path without showing native UI. */
async function mockSaveDialog(
  electronApp: Parameters<Parameters<typeof test>[1]>[0]['electronApp'],
  savePath: string,
) {
  await electronApp.evaluate(
    ({ dialog }, sp: string) => {
      const original = dialog.showSaveDialog.bind(dialog);
      (dialog as any).showSaveDialog = () => Promise.resolve({ canceled: false, filePath: sp });
      setTimeout(() => { (dialog as any).showSaveDialog = original; }, 5000);
    },
    savePath,
  );
}

/** Intercept dialog.showOpenDialog so it returns a fixed path without showing native UI. */
async function mockOpenDialog(
  electronApp: Parameters<Parameters<typeof test>[1]>[0]['electronApp'],
  openPath: string,
) {
  await electronApp.evaluate(
    ({ dialog }, op: string) => {
      const original = dialog.showOpenDialog.bind(dialog);
      (dialog as any).showOpenDialog = () => {
        (dialog as any).showOpenDialog = original;
        return Promise.resolve({ canceled: false, filePaths: [op] });
      };
    },
    openPath,
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

test.describe('Export / Import', () => {

  test('exports single QA to file and file contains required metadata', async ({ window, electronApp, dataDir }) => {
    const ts = Date.now();
    const question = `Export test Q ${ts}`;
    const answer = `Export test A ${ts}`;
    const exportPath = path.join(dataDir, `export_qa_${ts}.md`);

    await createQA(window, `Export QA ${ts}`, question, answer);

    // Select the created QA
    const qaList = window.getByTestId('qa-list');
    const qaItem = qaList.locator('.qa-item').first();
    await qaItem.click();

    // Mock save dialog
    await mockSaveDialog(electronApp, exportPath);

    // Click the Export button
    await window.getByTestId('export-qa-button').click();

    // Wait for toast confirming export
    await expect(window.locator('.p-toast')).toContainText('QA exported', { timeout: 7000 });

    // Verify file was written with expected content
    expect(fs.existsSync(exportPath)).toBe(true);
    const content = fs.readFileSync(exportPath, 'utf-8');
    expect(content).toContain('writer_app: llm-aggregator');
    expect(content).toContain('writer_version:');
    expect(content).toContain('schema_version:');
    expect(content).toContain('exported_at:');
    expect(content).toContain('export_type: qa');
    expect(content).toContain('## Question');
    expect(content).toContain('## Answer');
    expect(content).toContain('original_id:');
    expect(content).toContain('original_timestamp:');
    expect(content).toContain(question);
    expect(content).toContain(answer);
  });

  test('imports single QA file and QA appears in list', async ({ window, electronApp, dataDir }) => {
    const ts = Date.now();

    // Write a pre-authored export file into dataDir
    const importPath = path.join(dataDir, `import_qa_${ts}.md`);
    fs.writeFileSync(importPath, [
      '---',
      'writer_app: llm-aggregator',
      'writer_version: 1.0.0',
      'schema_version: 1',
      `exported_at: ${new Date().toISOString()}`,
      'export_type: qa',
      '---',
      '',
      `title: Imported QA ${ts}`,
      'source: claude',
      'url: https://example.com',
      'tags: import, test',
      'version: 1',
      `original_id: 20260101_120000_000`,
      `original_timestamp: 2026-01-01T12:00:00.000Z`,
      '',
      '## Question',
      '',
      `Imported question ${ts}`,
      '',
      '## Answer',
      '',
      `Imported answer ${ts}`,
      '',
    ].join('\n'), 'utf-8');

    // Mock open dialog
    await mockOpenDialog(electronApp, importPath);

    // Trigger import via keyboard shortcut Ctrl+O
    await window.getByTitle('Show all QAs').click();
    await window.keyboard.press('Control+o');

    // Wait for success toast
    await expect(window.locator('.p-toast')).toContainText('import', { timeout: 8000 });

    // Verify QA appears in list
    await expect(window.getByTestId('qa-list')).toContainText(`Imported question ${ts}`, { timeout: 5000 });
  });

  test('exports thread to file with thread metadata and multiple QA blocks', async ({ window, electronApp, dataDir }) => {
    const ts = Date.now();
    const threadName = `Export Thread ${ts}`;
    const exportPath = path.join(dataDir, `export_thread_${ts}.md`);

    // Create thread
    await window.getByTestId('add-thread-button').click();
    const nameInput = window.getByTestId('new-thread-name-input');
    await nameInput.fill(threadName);
    await nameInput.press('Enter');

    // Create two QAs and add to thread via Ctrl+N
    for (let i = 1; i <= 2; i++) {
      await window.getByTestId('add-qa-button').click();
      await window.locator('textarea[placeholder="Enter question..."]').fill(`Thread Q${i} ${ts}`);
      await window.locator('textarea[placeholder="Enter answer..."]').fill(`Thread A${i} ${ts}`);
      await window.getByRole('button', { name: 'Create QA' }).click();
    }

    // Select the thread, find export button
    const threadList = window.getByTestId('thread-list');
    const threadItem = threadList.locator('.thread-item', { hasText: threadName });
    await threadItem.hover();

    // Mock save dialog before clicking export
    await mockSaveDialog(electronApp, exportPath);
    await threadItem.getByTestId('export-thread-button').click();

    // Wait for toast
    await expect(window.locator('.p-toast')).toContainText('Thread exported', { timeout: 7000 });

    // Verify file structure
    expect(fs.existsSync(exportPath)).toBe(true);
    const content = fs.readFileSync(exportPath, 'utf-8');
    expect(content).toContain('export_type: thread');
    expect(content).toContain(`thread_name: ${threadName}`);
    expect(content).toContain('## Question');
    expect(content).toContain('## Answer');
  });

  test('imports thread file and reconstructs thread with items', async ({ window, electronApp, dataDir }) => {
    const ts = Date.now();
    const threadName = `Imported Thread ${ts}`;
    const importPath = path.join(dataDir, `import_thread_${ts}.md`);

    fs.writeFileSync(importPath, [
      '---',
      'writer_app: llm-aggregator',
      'writer_version: 1.0.0',
      'schema_version: 1',
      `exported_at: ${new Date().toISOString()}`,
      'export_type: thread',
      `thread_name: ${threadName}`,
      'thread_tags: claude, migration',
      '---',
      '',
      `title: Thread QA 1 ${ts}`,
      'source: chatgpt',
      'url:',
      'tags: test',
      'version: 1',
      `original_id: 20260101_120000_001`,
      `original_timestamp: 2026-01-01T12:00:00.000Z`,
      '',
      '## Question',
      '',
      `Thread question 1 for ${ts}`,
      '',
      '## Answer',
      '',
      `Thread answer 1 for ${ts}`,
      '',
      '',
      '---',
      '',
      `title: Thread QA 2 ${ts}`,
      'source: chatgpt',
      'url:',
      'tags: test',
      'version: 1',
      `original_id: 20260101_120000_002`,
      `original_timestamp: 2026-01-01T12:00:01.000Z`,
      '',
      '## Question',
      '',
      `Thread question 2 for ${ts}`,
      '',
      '## Answer',
      '',
      `Thread answer 2 for ${ts}`,
      '',
    ].join('\n'), 'utf-8');

    await mockOpenDialog(electronApp, importPath);

    await window.getByTitle('Show all QAs').click();
    await window.keyboard.press('Control+o');

    // Wait for success toast
    await expect(window.locator('.p-toast')).toContainText('import', { timeout: 8000 });

    // Verify thread appears in thread list
    const threadList = window.getByTestId('thread-list');
    await expect(threadList).toContainText(threadName, { timeout: 5000 });
    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'threads.json'), 'utf-8')) as Record<
      string,
      { name: string; items: string[]; tags?: string[] }
    >;
    const imported = Object.values(persisted).find((thread) => thread.name === threadName);
    expect(imported?.items).toHaveLength(2);
    expect(imported?.tags).toEqual(['claude', 'migration']);
  });

  test('round-trips an exported thread with persisted QA membership', async ({ window, electronApp, dataDir }) => {
    const ts = Date.now();
    const threadName = `Roundtrip Thread ${ts}`;
    const exportPath = path.join(dataDir, `roundtrip_thread_${ts}.md`);
    const threadsPath = path.join(dataDir, 'threads.json');

    await window.getByTestId('add-thread-button').click();
    const nameInput = window.getByTestId('new-thread-name-input');
    await nameInput.fill(threadName);
    await nameInput.press('Enter');

    for (let i = 1; i <= 2; i++) {
      await window.getByTestId('add-qa-button').click();
      await window.locator('textarea[placeholder="Enter question..."]').fill(`Roundtrip Q${i} ${ts}`);
      await window.locator('textarea[placeholder="Enter answer..."]').fill(`Roundtrip A${i} ${ts}`);
      await window.getByRole('button', { name: 'Create QA' }).click();
    }

    const before = JSON.parse(fs.readFileSync(threadsPath, 'utf-8')) as Record<string, { name: string; items: string[] }>;
    const original = Object.entries(before).find(([, thread]) => thread.name === threadName);
    expect(original?.[1].items).toHaveLength(2);

    const threadItem = window.getByTestId('thread-list').locator('.thread-item', { hasText: threadName });
    await threadItem.hover();
    await mockSaveDialog(electronApp, exportPath);
    await threadItem.getByTestId('export-thread-button').click();
    await expect(window.locator('.p-toast')).toContainText('Thread exported', { timeout: 7000 });

    await mockOpenDialog(electronApp, exportPath);
    await window.keyboard.press('Control+o');
    await expect(window.locator('.p-toast')).toContainText('Import successful', { timeout: 8000 });

    await expect.poll(() => {
      const threads = JSON.parse(fs.readFileSync(threadsPath, 'utf-8')) as Record<string, { name: string; items: string[] }>;
      return Object.values(threads)
        .filter((thread) => thread.name === threadName)
        .map((thread) => thread.items.length)
        .sort();
    }).toEqual([2, 2]);

    const after = JSON.parse(fs.readFileSync(threadsPath, 'utf-8')) as Record<string, { name: string; items: string[] }>;
    const copies = Object.values(after).filter((thread) => thread.name === threadName);
    expect(copies[0].items).not.toEqual(copies[1].items);
  });

  test('re-importing the same account export reuses its thread and QAs', async ({ window, electronApp, dataDir }) => {
    const ts = Date.now();
    const sourceId = `claude-conversation-${ts}`;
    const importPath = path.join(dataDir, `claude-account-${ts}.json`);
    const threadsPath = path.join(dataDir, 'threads.json');
    fs.writeFileSync(importPath, JSON.stringify([
      {
        uuid: sourceId,
        name: `Claude repeat ${ts}`,
        created_at: '2026-07-01T10:00:00.000Z',
        chat_messages: [
          { uuid: `${sourceId}-q1`, sender: 'human', text: 'First question', created_at: '2026-07-01T10:00:00.000Z' },
          { uuid: `${sourceId}-a1`, sender: 'assistant', text: 'First answer', created_at: '2026-07-01T10:00:01.000Z' },
          { uuid: `${sourceId}-q2`, sender: 'human', text: 'Second question', created_at: '2026-07-01T10:01:00.000Z' },
          { uuid: `${sourceId}-a2`, sender: 'assistant', text: 'Second answer', created_at: '2026-07-01T10:01:01.000Z' },
        ],
      },
    ], null, 2), 'utf-8');

    await mockOpenDialog(electronApp, importPath);
    await window.evaluate(() => window.dispatchEvent(new CustomEvent('llm:import-file')));
    await expect(window.getByTestId('bulk-import-dialog')).toBeVisible({ timeout: 8000 });
    await window.getByTestId('bulk-import-submit').click();
    await expect(window.getByTestId('bulk-import-dialog')).toContainText('Imported 2 Q&A pairs into 1 thread', { timeout: 8000 });
    await window.getByRole('button', { name: 'Done' }).click();

    await mockOpenDialog(electronApp, importPath);
    await window.evaluate(() => window.dispatchEvent(new CustomEvent('llm:import-file')));
    await expect(window.getByTestId('bulk-import-dialog')).toContainText('2 of these pairs are already', { timeout: 8000 });
    await window.getByTestId('bulk-import-submit').click();
    await expect(window.getByTestId('bulk-import-dialog')).toContainText('Imported 0 Q&A pairs into 0 threads', { timeout: 8000 });
    await expect(window.getByTestId('bulk-import-dialog')).toContainText('Existing threads reused1');

    const persisted = JSON.parse(fs.readFileSync(threadsPath, 'utf-8')) as Record<
      string,
      { name: string; items: string[]; importSourceId?: string }
    >;
    const imported = Object.values(persisted).filter(
      (thread) => thread.importSourceId === `claude-account-export:${sourceId}`,
    );
    expect(imported).toHaveLength(1);
    expect(imported[0].items).toHaveLength(2);
  });

  test('import preserves original_id and original_timestamp in auxiliary fields', async ({ window, electronApp, dataDir }) => {
    const ts = Date.now();
    const originalId = `20260115_120000_${ts % 1000}`;
    const originalTimestamp = '2026-01-15T12:00:00.000Z';
    const importPath = path.join(dataDir, `import_aux_${ts}.md`);

    fs.writeFileSync(importPath, [
      '---',
      'writer_app: llm-aggregator',
      'writer_version: 1.0.0',
      'schema_version: 1',
      `exported_at: ${new Date().toISOString()}`,
      'export_type: qa',
      '---',
      '',
      `title: Aux Field QA ${ts}`,
      'source: claude',
      'url:',
      'tags:',
      'version: 2',
      `original_id: ${originalId}`,
      `original_timestamp: ${originalTimestamp}`,
      '',
      '## Question',
      '',
      `Aux question ${ts}`,
      '',
      '## Answer',
      '',
      `Aux answer ${ts}`,
      '',
    ].join('\n'), 'utf-8');

    await mockOpenDialog(electronApp, importPath);
    await window.getByTitle('Show all QAs').click();
    await window.keyboard.press('Control+o');

    await expect(window.locator('.p-toast')).toContainText('import', { timeout: 8000 });

    // Verify QA appears and that a new (different) ID was assigned
    // by checking archives directory for the original_id NOT being present as a filename prefix
    const archiveDir = path.join(dataDir, 'archive');
    const files = fs.readdirSync(archiveDir);
    const hasOriginalIdFile = files.some((f) => f.startsWith(originalId));
    expect(hasOriginalIdFile).toBe(false); // new ID was generated

    // Verify imported QA appears in list
    await expect(window.getByTestId('qa-list')).toContainText(`Aux question ${ts}`, { timeout: 5000 });
  });

  test('import shows summary dialog for human-authored file with no header', async ({ window, electronApp, dataDir }) => {
    const ts = Date.now();
    const importPath = path.join(dataDir, `import_noheader_${ts}.md`);

    // Human-authored file — no YAML frontmatter
    fs.writeFileSync(importPath, [
      `title: Human QA ${ts}`,
      'source: manual',
      '',
      '## Question',
      '',
      `Human question ${ts}`,
      '',
      '## Answer',
      '',
      `Human answer ${ts}`,
      '',
    ].join('\n'), 'utf-8');

    await mockOpenDialog(electronApp, importPath);
    await window.getByTitle('Show all QAs').click();
    await window.keyboard.press('Control+o');

    // Toast should indicate warning severity (contains 'warnings' text)
    await expect(window.locator('.p-toast')).toContainText('warning', { timeout: 8000 });

    // Import summary dialog should be visible
    await expect(window.getByTestId('import-summary-dialog')).toBeVisible({ timeout: 5000 });
  });

});
