/**
 * import/archive/bulkImportService.ts
 * Orchestrator for account-export ("bulk") import.
 *
 * Two phases, deliberately separated so nothing is written before the user has
 * seen what will happen:
 *   1. `previewArchive(path)` — read, detect, parse, count duplicates. Read-only.
 *   2. `commitArchiveImport(preview, selection, onProgress)` — write the pairs
 *      and threads the user selected, emitting progress as it goes.
 *
 * Writing happens **in the main process**, not the renderer. A 500-conversation
 * export is thousands of file writes; routing each through IPC would flood the
 * bridge and make progress reporting impossible.
 */

import { basename } from 'path'
import { readArchiveEntry } from './archiveReader'
import {
  detectArchiveFormat,
  CANDIDATE_ENTRY_NAMES,
  ALL_PATH_HINTS,
  UNSUPPORTED_HINTS,
  type ArchiveFormat,
} from './formatRegistry'
import { buildResult } from '../buildResult'
import { buildOriginIndex } from '../../duplicateService'
import { createPair } from '../../qaPairService'
import { loadThreads, saveThreads } from '../../threadService'
import { debugLog, debugError } from '../../logger'
import type {
  BulkImportPreview,
  BulkImportPreviewSummary,
  BulkImportThread,
  BulkImportSelection,
  BulkImportProgress,
  BulkImportCommitResult,
} from './archiveTypes'

/**
 * Previews awaiting a commit decision, keyed by `previewId`. Full previews hold
 * the entire archive text, so they are dropped as soon as the user commits or
 * cancels — see `releasePreview`.
 */
const pendingPreviews = new Map<string, BulkImportPreview>()

export function storePreview(preview: BulkImportPreview): string {
  const previewId = `preview_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  pendingPreviews.set(previewId, preview)
  return previewId
}

export function getPreview(previewId: string): BulkImportPreview | null {
  return pendingPreviews.get(previewId) ?? null
}

export function releasePreview(previewId: string): void {
  pendingPreviews.delete(previewId)
}

/** Strip the pair bodies so only display data crosses the IPC bridge. */
export function summarizePreview(preview: BulkImportPreview, previewId: string): BulkImportPreviewSummary {
  return {
    previewId,
    format: preview.format,
    formatLabel: preview.formatLabel,
    provider: preview.provider,
    sourcePath: preview.sourcePath,
    sourceEntry: preview.sourceEntry,
    threads: preview.threads.map((t) => ({
      sourceId: t.sourceId,
      name: t.name,
      nameWasDerived: t.nameWasDerived,
      tags: t.tags,
      pairCount: t.items.length,
      duplicateCount: t.duplicateCount,
      createdAt: t.createdAt,
      warnings: t.warnings,
    })),
    totalPairs: preview.totalPairs,
    duplicatePairs: preview.duplicatePairs,
    dateRange: preview.dateRange,
    warnings: preview.warnings,
  }
}

/** Thread ids follow the existing `thread_YYYYMMdd_HHMMSS` convention. */
function generateThreadId(offset: number): string {
  const now = new Date(Date.now() + offset)
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return (
    `thread_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

/**
 * Inspect an archive without writing anything.
 * Accepts the downloaded .zip, an unzipped folder, or the bare conversations file.
 */
export async function previewArchive(sourcePath: string): Promise<BulkImportPreview> {
  // Detection doubles as the accept test: a Google Takeout archive contains a
  // `MyActivity.json` for every product, so the reader must keep looking until
  // it finds one a format actually recognizes.
  const entry = await readArchiveEntry(sourcePath, {
    candidateBasenames: CANDIDATE_ENTRY_NAMES,
    pathHints: ALL_PATH_HINTS,
    accept: (text) => detectArchiveFormat(text) !== null,
  })
  if (!entry) {
    throw new Error(
      'No supported conversation data was found in this file. Select the export .zip as ' +
        'downloaded, the folder you unzipped it to, or the conversations file inside it. ' +
        'For Google Takeout, make sure the export includes Gemini.',
    )
  }

  const format: ArchiveFormat | null = detectArchiveFormat(entry.text)
  if (!format) {
    const hint = UNSUPPORTED_HINTS.find((h) => h.test(basename(entry.entryPath).toLowerCase(), entry.text))
    throw new Error(
      hint
        ? hint.message
        : 'This file was not recognized as a supported account export. Supported today: Claude ' +
          '(conversations.json, or the .zip containing it) and ChatGPT.',
    )
  }

  debugLog('bulkImport', 'detected format', format.id, 'from', entry.entryPath)

  const conversations = format.parse(entry.text)
  const originIndex = buildOriginIndex()
  const warnings: string[] = []

  if (!format.validated) {
    warnings.push(
      `${format.label} support has not been verified against a real export file yet. ` +
        'Review the imported threads and report anything that looks wrong.',
    )
  }

  const threads: BulkImportThread[] = []
  let totalPairs = 0
  let duplicatePairs = 0
  let from = ''
  let to = ''

  for (const convo of conversations) {
    // Reuse the share-link builder: identical tagging, titling, and pairing rules.
    const built = buildResult(convo)
    const duplicateCount = built.items.filter((i) => i.originId && originIndex.has(i.originId)).length

    totalPairs += built.items.length
    duplicatePairs += duplicateCount

    const createdAt = convo.createdAt ?? ''
    if (createdAt) {
      if (!from || createdAt < from) from = createdAt
      if (!to || createdAt > to) to = createdAt
    }

    threads.push({
      sourceId: convo.sourceId ?? '',
      name: built.threadName,
      nameWasDerived: built.titleWasDerived,
      tags: built.tags,
      items: built.items,
      createdAt,
      warnings: built.warnings,
      duplicateCount,
    })
  }

  if (threads.length === 0) {
    warnings.push('The export was read successfully but contained no conversations.')
  }
  const idless = threads.filter((t) => !t.sourceId).length
  if (idless > 0) {
    warnings.push(
      `${idless} conversation(s) carry no id — these cannot be de-duplicated on a future re-import.`,
    )
  }

  return {
    format: format.id,
    formatLabel: format.label,
    provider: format.provider,
    sourcePath,
    sourceEntry: entry.entryPath,
    threads,
    totalPairs,
    duplicatePairs,
    dateRange: { from, to },
    warnings,
  }
}

/**
 * Write the selected conversations. Emits a progress tick per pair.
 *
 * Failures are isolated per pair: one unwritable file must not abandon the rest
 * of a 500-conversation import.
 */
export function commitArchiveImport(
  preview: BulkImportPreview,
  selection: BulkImportSelection,
  onProgress?: (progress: BulkImportProgress) => void,
): BulkImportCommitResult {
  const wanted = new Set(selection.threadSourceIds)
  const selected = preview.threads.filter((t) => wanted.has(t.sourceId))

  const originIndex = buildOriginIndex()
  const total = selected.reduce((sum, t) => sum + t.items.length, 0)
  const threadsTotal = selected.length

  const result: BulkImportCommitResult = {
    createdPairs: 0,
    skippedDuplicates: 0,
    createdThreads: 0,
    failed: 0,
    threadNames: [],
    warnings: [],
  }

  const threads = loadThreads()
  const startedAt = Date.now()
  let processed = 0
  let threadsDone = 0

  for (const thread of selected) {
    const createdIds: string[] = []

    for (const item of thread.items) {
      // Duplicate check runs against a live index so duplicates *within* the
      // same import are caught too, not just ones already on disk.
      const isDuplicate = Boolean(item.originId && originIndex.has(item.originId))
      if (selection.skipDuplicates && isDuplicate) {
        result.skippedDuplicates += 1
      } else {
        try {
          const created = createPair(item.data)
          createdIds.push(created.id)
          if (item.originId) originIndex.set(item.originId, created.id)
          result.createdPairs += 1
        } catch (err) {
          result.failed += 1
          debugError('bulkImport', 'createPair failed', item.data.title, err)
          result.warnings.push(`Could not import "${item.data.title}": ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      processed += 1
      if (onProgress) {
        const elapsed = (Date.now() - startedAt) / 1000
        // Only estimate once there is a rate worth extrapolating from.
        const etaSeconds =
          processed >= 5 && elapsed > 0 ? Math.max(0, Math.round((elapsed / processed) * (total - processed))) : null
        onProgress({
          processed,
          total,
          percent: total > 0 ? Math.round((processed / total) * 100) : 100,
          etaSeconds,
          currentThreadName: thread.name,
          currentItemTitle: item.data.title,
          threadsDone,
          threadsTotal,
        })
      }
    }

    if (createdIds.length > 0) {
      const threadId = generateThreadId(threadsDone)
      threads[threadId] = { name: thread.name, items: createdIds }
      result.createdThreads += 1
      result.threadNames.push(thread.name)
    } else if (thread.items.length > 0) {
      result.warnings.push(`"${thread.name}" produced no new pairs (all duplicates or failed) — no thread created.`)
    }
    threadsDone += 1
  }

  saveThreads(threads)

  debugLog('bulkImport', 'commit complete', {
    createdPairs: result.createdPairs,
    skippedDuplicates: result.skippedDuplicates,
    createdThreads: result.createdThreads,
    failed: result.failed,
  })

  return result
}
