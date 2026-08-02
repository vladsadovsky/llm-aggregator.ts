import type { ImportResult } from '../global'
import type { QACreateData } from '../types/QAPair'
import { debugError, debugLog, debugTrace } from './logger'

export interface FileImportCommitDeps {
  createPair(data: QACreateData): Promise<{ id: string }>
  createThreadWithItems(
    name: string,
    pairIds: readonly string[],
    options: { tags?: readonly string[] },
  ): Promise<string>
  reload(): Promise<void>
  getThreadItems(threadId: string): readonly string[] | undefined
  onCreateError?(item: ImportResult['items'][number], error: unknown): void
}

export interface FileImportCommitOutcome {
  createdIds: string[]
  importedThreadId: string | null
  membershipComplete: boolean
}

/**
 * Apply a parsed app-file import and verify the durable thread postcondition.
 * Keeping this orchestration outside App.vue makes export → parse → commit →
 * persisted-membership a fast renderer test instead of an E2E-only promise.
 */
export async function commitParsedFileImport(
  result: ImportResult,
  deps: FileImportCommitDeps,
): Promise<FileImportCommitOutcome> {
  const traceId = `file-${Date.now().toString(36)}`
  debugLog('fileImportTrace', 'commit start', {
    traceId,
    exportType: result.exportType,
    threadNamePresent: Boolean(result.threadName),
    threadTags: result.threadTags ?? [],
    parsedItemCount: result.items.length,
  })

  const createdIds: string[] = []
  for (const [itemIndex, item] of result.items.entries()) {
    try {
      debugTrace('fileImportTrace', 'creating pair', {
        traceId,
        itemIndex,
        originalId: item.originalId || null,
        originId: item.data.originId ?? null,
      })
      const created = await deps.createPair(item.data)
      createdIds.push(created.id)
      debugTrace('fileImportTrace', 'pair created', {
        traceId,
        itemIndex,
        persistedId: created.id,
      })
    } catch (error) {
      debugError('fileImportTrace', 'pair creation failed', { traceId, itemIndex, error })
      deps.onCreateError?.(item, error)
    }
  }

  let importedThreadId: string | null = null
  if (result.exportType === 'thread' && result.threadName && createdIds.length > 0) {
    debugLog('fileImportTrace', 'creating populated thread', {
      traceId,
      expectedItemIds: createdIds,
    })
    importedThreadId = await deps.createThreadWithItems(result.threadName, createdIds, {
      tags: result.threadTags,
    })
    debugLog('fileImportTrace', 'populated thread saved', {
      traceId,
      importedThreadId,
      expectedItemIds: createdIds,
    })
  } else {
    debugLog('fileImportTrace', 'thread creation not requested', {
      traceId,
      exportType: result.exportType,
      threadNamePresent: Boolean(result.threadName),
      createdItemCount: createdIds.length,
    })
  }

  await deps.reload()
  const persistedItems = importedThreadId ? deps.getThreadItems(importedThreadId) ?? [] : []
  const missingItemIds = importedThreadId
    ? createdIds.filter((id) => !persistedItems.includes(id))
    : []
  const membershipComplete =
    importedThreadId === null || missingItemIds.length === 0

  const completion = {
    traceId,
    importedThreadId,
    createdItemIds: createdIds,
    persistedItemIds: persistedItems,
    missingItemIds,
    membershipComplete,
  }
  if (membershipComplete) {
    debugLog('fileImportTrace', 'post-reload membership verified', completion)
  } else {
    debugError('fileImportTrace', 'post-reload membership mismatch', completion)
  }

  return { createdIds, importedThreadId, membershipComplete }
}
