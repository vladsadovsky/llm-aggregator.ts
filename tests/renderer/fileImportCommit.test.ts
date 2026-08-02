import { describe, expect, it } from 'vitest'
import { formatThreadExport } from '../../electron/services/qaExportFormatService'
import { parseImportFile } from '../../electron/services/qaImportFormatService'
import type { QAPairData } from '../../electron/services/qaPairService'
import type { ThreadData } from '../../electron/services/threadService'
import { commitParsedFileImport } from '../../src/utils/fileImportCommit'

function pair(id: string, title: string): QAPairData {
  return {
    id,
    filepath: `/archive/${id}.md`,
    title,
    source: 'manual',
    url: '',
    tags: [],
    timestamp: '2026-08-01T00:00:00.000Z',
    version: 1,
    threadPairs: [],
    question: `${title} question`,
    answer: `${title} answer`,
  }
}

describe('file thread export/import invariant', () => {
  it('exports, parses, commits, reloads, and retains ordered persisted membership', async () => {
    const p1 = pair('old-1', 'First')
    const p2 = pair('old-2', 'Second')
    const thread: ThreadData = { name: 'Roundtrip', items: [p1.id, p2.id], tags: ['claude', 'migration'] }
    const parsed = parseImportFile(formatThreadExport(thread, { [p1.id]: p1, [p2.id]: p2 }))

    const persistedPairs: string[] = []
    const persistedThreads: Record<string, { name: string; items: string[]; tags?: string[] }> = {}
    let nextId = 1
    const outcome = await commitParsedFileImport(parsed, {
      createPair: async () => {
        const id = `new-${nextId++}`
        persistedPairs.push(id)
        return { id }
      },
      createThreadWithItems: async (name, ids, options) => {
        persistedThreads['thread-new'] = { name, items: [...ids], tags: [...(options.tags ?? [])] }
        return 'thread-new'
      },
      reload: async () => {},
      getThreadItems: (threadId) => persistedThreads[threadId]?.items,
    })

    expect(persistedPairs).toEqual(['new-1', 'new-2'])
    expect(persistedThreads['thread-new']).toEqual({
      name: 'Roundtrip',
      items: ['new-1', 'new-2'],
      tags: ['claude', 'migration'],
    })
    expect(outcome).toEqual({
      createdIds: ['new-1', 'new-2'],
      importedThreadId: 'thread-new',
      membershipComplete: true,
    })
  })

  it('fails the postcondition when reload loses a membership', async () => {
    const parsed = parseImportFile(formatThreadExport(
      { name: 'Broken', items: ['old-1'] },
      { 'old-1': pair('old-1', 'Only') },
    ))

    const outcome = await commitParsedFileImport(parsed, {
      createPair: async () => ({ id: 'new-1' }),
      createThreadWithItems: async () => 'thread-new',
      reload: async () => {},
      getThreadItems: () => [],
    })

    expect(outcome.membershipComplete).toBe(false)
  })
})
