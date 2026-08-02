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
import { readArchiveEntry, readMatchingEntries } from './archiveReader'
import {
  detectArchiveFormat,
  CANDIDATE_ENTRY_NAMES,
  CANDIDATE_ENTRY_PATTERNS,
  ALL_PATH_HINTS,
  UNSUPPORTED_HINTS,
  type ArchiveFormat,
} from './formatRegistry'
import type { ParsedConversation } from '../types'
import { buildResult } from '../buildResult'
import { buildOriginIndex } from '../../duplicateService'
import { createPair } from '../../qaPairService'
import { loadThreads, saveThreads } from '../../threadService'
import { addTag, listTags } from '../../tagDictionaryService'
import { debugLog, debugError, debugTrace } from '../../logger'
import { ipcError } from '../../../../shared/contracts/errorWire'
import type {
  BulkImportPreview,
  BulkImportPreviewSummary,
  BulkImportThread,
  BulkImportSelection,
  BulkImportProgress,
  BulkImportCommitResult,
} from './archiveTypes'

import { randomUUID } from 'crypto'

/**
 * Previews awaiting a commit decision, keyed by `previewId`. Full previews hold
 * the entire archive text, so they are dropped as soon as the user commits or
 * cancels (see `releasePreview`) or when their TTL expires — an abandoned preview
 * must not pin megabytes of archive text in main forever.
 */
interface PendingPreview {
  preview: BulkImportPreview
  createdAt: number
  /** Set while a commit is running so it can be aborted and not double-committed. */
  committing: boolean
  abort?: AbortController
}

const pendingPreviews = new Map<string, PendingPreview>()

/** Uncommitted previews expire after this long. */
const PREVIEW_TTL_MS = 10 * 60 * 1000

// Unref'd sweeper: drop expired, not-committing previews without holding the
// event loop open.
const sweeper = setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of pendingPreviews) {
    if (!entry.committing && now - entry.createdAt > PREVIEW_TTL_MS) {
      pendingPreviews.delete(id)
    }
  }
}, 60_000)
if (typeof sweeper.unref === 'function') sweeper.unref()

/**
 * Applied to every thread and pair produced by an account-export import, on top
 * of the provider/model tags `buildResult` already assigns. It is what makes a
 * whole batch filterable — and separable — after the fact.
 */
export const BULK_TAG = 'bulk'

export function storePreview(preview: BulkImportPreview): string {
  // Opaque, unguessable id (INV-IMPORT).
  const previewId = randomUUID()
  pendingPreviews.set(previewId, { preview, createdAt: Date.now(), committing: false })
  return previewId
}

export function getPreview(previewId: string): BulkImportPreview | null {
  return pendingPreviews.get(previewId)?.preview ?? null
}

export function releasePreview(previewId: string): void {
  const entry = pendingPreviews.get(previewId)
  entry?.abort?.abort()
  pendingPreviews.delete(previewId)
}

/**
 * Claim a preview for commit. Returns its abort signal, or throws on a missing or
 * already-committing preview so a duplicate commit cannot run twice.
 */
export function beginCommit(previewId: string): { preview: BulkImportPreview; signal: AbortSignal } {
  const entry = pendingPreviews.get(previewId)
  if (!entry) {
    throw ipcError('not-found', 'This import preview has expired. Please choose the file again.')
  }
  if (entry.committing) {
    throw ipcError('cancelled', 'This import is already being committed.')
  }
  entry.committing = true
  entry.abort = new AbortController()
  return { preview: entry.preview, signal: entry.abort.signal }
}

/** Abort a running commit if one is in flight; otherwise release the preview. */
export function cancelCommit(previewId: string): void {
  const entry = pendingPreviews.get(previewId)
  if (entry?.committing && entry.abort) {
    entry.abort.abort()
  } else {
    pendingPreviews.delete(previewId)
  }
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
      updatedAt: t.updatedAt,
      warnings: t.warnings,
    })),
    totalPairs: preview.totalPairs,
    duplicatePairs: preview.duplicatePairs,
    dateRange: preview.dateRange,
    warnings: preview.warnings,
  }
}

function formatThreadId(date: Date): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return (
    `thread_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

/**
 * Thread ids follow the existing `thread_YYYYMMdd_HHMMSS` convention, which only
 * has second-level resolution — so they collide easily and must be checked
 * against the ids already taken in this commit.
 *
 * The id is derived from the conversation's own time when the export reports
 * one, so ids read chronologically like the QA ids do. Collisions are real here:
 * Takeout day-buckets all start at whatever the first record's time was, and a
 * Copilot export can hold several conversations opened in the same second. On a
 * collision the id walks forward one second at a time — the id is an identifier,
 * not the thread's timestamp, which is stored separately as `createdAt`.
 */
function generateThreadId(sourceTime: string, taken: Set<string>): string {
  const parsed = sourceTime ? Date.parse(sourceTime) : NaN
  const base = Number.isNaN(parsed) ? Date.now() : parsed
  for (let i = 0; i < 5000; i += 1) {
    const candidate = formatThreadId(new Date(base + i * 1000))
    if (!taken.has(candidate)) return candidate
  }
  return `${formatThreadId(new Date())}_${Math.random().toString(36).slice(2, 6)}`
}

function archiveThreadSourceId(preview: BulkImportPreview, thread: BulkImportThread): string | undefined {
  return thread.sourceId ? `${preview.format}:${thread.sourceId}` : undefined
}

function hasExactMembership(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  return leftSet.size === rightSet.size && [...leftSet].every((id) => rightSet.has(id))
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
    candidatePatterns: CANDIDATE_ENTRY_PATTERNS,
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
        : 'This file was not recognized as a supported account export. Supported today: Claude and ' +
          'ChatGPT (conversations.json, or the .zip containing it), Gemini (Google Takeout, HTML or ' +
          'JSON), and Copilot (the privacy-dashboard activity CSV).',
    )
  }

  debugLog('bulkImport', 'detected format', format.id, 'from', entry.entryPath)

  // Sharded exports (ChatGPT) spread conversations across several matching
  // entries. Read and merge them all; the first accepted entry above only
  // identified the format. Non-sharded formats parse the single entry as-is.
  let conversations: ParsedConversation[]
  if (format.sharded) {
    const entries = await readMatchingEntries(sourcePath, {
      candidateBasenames: format.candidateEntries,
      candidatePatterns: format.candidatePatterns,
    })
    debugLog('bulkImport', 'sharded read', entries.length, 'entries:', entries.map((e) => basename(e.entryPath)))
    conversations = entries.flatMap((e) => format.parse(e.text))
  } else {
    conversations = format.parse(entry.text)
  }

  const originIndex = buildOriginIndex()
  const warnings: string[] = []

  if (!format.validated) {
    warnings.push(
      `${format.label} support has not been verified against a real export file yet. ` +
        'Review the imported threads and report anything that looks wrong.',
    )
  }

  if (format.id === 'gemini-takeout') {
    warnings.push(
      'Google Takeout does not record which prompts belong to the same conversation — the threads ' +
        'below are approximated by grouping prompts from the same UTC calendar day. A real conversation ' +
        'may be split across two threads, or unrelated questions from the same day may be merged into one.',
    )
  }

  const threads: BulkImportThread[] = []
  let totalPairs = 0
  let duplicatePairs = 0
  let from = ''
  let to = ''

  for (const convo of conversations) {
    // Reuse the share-link builder: identical tagging, titling, and pairing rules.
    // The `bulk` tag is the one addition — it lands on the thread and on every
    // pair, so a whole import can be filtered (or found again) as a batch.
    const built = buildResult(convo, { extraTags: [BULK_TAG] })
    const duplicateCount = built.items.filter((i) => i.originId && originIndex.has(i.originId)).length

    totalPairs += built.items.length
    duplicatePairs += duplicateCount

    // Prefer the message-derived range: `convo.createdAt` is conversation-level
    // and absent for some formats, while message times are what the pairs use.
    const createdAt = built.createdAt || convo.createdAt || ''
    const updatedAt = built.updatedAt || createdAt
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
      updatedAt,
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
 * Teach the tag dictionary the tags this import just applied, so the vocabulary
 * UI and tag enforcement recognize them immediately instead of treating an
 * import's own tags as unknown. Best-effort: a dictionary write failure must not
 * fail an import whose pairs are already on disk.
 */
function registerImportTags(tags: string[]): void {
  try {
    const known = new Set(listTags())
    for (const tag of new Set(tags)) {
      if (tag && !known.has(tag)) addTag(tag)
    }
  } catch (err) {
    debugError('bulkImport', 'tag dictionary update failed', err)
  }
}

/** Yield a turn to Electron's event loop so a large import never freezes main. */
function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** Yield after roughly this many processed pairs (one frame's worth of work). */
const YIELD_EVERY = 64

/**
 * Write the selected conversations. Emits a progress tick per pair.
 *
 * A conversation is the durable unit (INV-IMPORT): its pairs are written, then
 * threads.json is saved atomically before the conversation is declared complete.
 * The loop yields to the event loop periodically so main stays responsive, and
 * honors an AbortSignal — cancellation stops before the next durable unit and
 * never promotes a half-written thread. Pairs from an aborted mid-thread are
 * recoverable on re-run through their origin_id.
 *
 * Per-pair failures are isolated: one unwritable file must not abandon the rest.
 */
export async function commitArchiveImport(
  preview: BulkImportPreview,
  selection: BulkImportSelection,
  onProgress?: (progress: BulkImportProgress) => void,
  signal?: AbortSignal,
): Promise<BulkImportCommitResult> {
  const traceId = `archive-${randomUUID().slice(0, 8)}`
  const wanted = new Set(selection.threadSourceIds)
  const selected = preview.threads.filter((t) => wanted.has(t.sourceId))

  const originIndex = buildOriginIndex()
  const total = selected.reduce((sum, t) => sum + t.items.length, 0)
  const threadsTotal = selected.length

  const result: BulkImportCommitResult = {
    createdPairs: 0,
    skippedDuplicates: 0,
    createdThreads: 0,
    reusedThreads: 0,
    failed: 0,
    threadNames: [],
    warnings: [],
    cancelled: false,
  }

  const threads = loadThreads()
  debugLog('bulkImportTrace', 'commit start', {
    traceId,
    format: preview.format,
    provider: preview.provider,
    selectedSourceIds: selected.map((thread) => thread.sourceId),
    selectedThreadCount: selected.length,
    selectedPairCount: total,
    skipDuplicates: selection.skipDuplicates,
    existingOriginCount: originIndex.size,
    existingThreadCount: Object.keys(threads).length,
    existingIdentifiedThreadCount: Object.values(threads).filter((thread) => thread.importSourceId).length,
  })
  const takenThreadIds = new Set(Object.keys(threads))
  const startedAt = Date.now()
  let processed = 0
  let threadsDone = 0

  // Only meaningful for gemini-takeout, where a "thread" is a day-bucket, not a
  // real conversation — the date is the one piece of structure the grouping
  // actually has, so surfacing it is opt-in rather than assumed.
  const applyDatePrefix = Boolean(selection.includeDateInThreadNames) && preview.format === 'gemini-takeout'

  outer: for (const thread of selected) {
    const createdIds: string[] = []
    const day = thread.createdAt.slice(0, 10)
    const threadName = applyDatePrefix && day ? `${day} — ${thread.name}` : thread.name
    debugLog('bulkImportTrace', 'conversation start', {
      traceId,
      sourceId: thread.sourceId || null,
      parsedItemCount: thread.items.length,
      originIds: thread.items.map((item) => item.originId ?? null),
    })

    for (const [itemIndex, item] of thread.items.entries()) {
      // Stop before the next durable pair; the current thread is left unpromoted.
      if (signal?.aborted) {
        result.cancelled = true
        break outer
      }

      // Duplicate check runs against a live index so duplicates *within* the
      // same import are caught too, not just ones already on disk.
      const isDuplicate = Boolean(item.originId && originIndex.has(item.originId))
      if (selection.skipDuplicates && isDuplicate) {
        result.skippedDuplicates += 1
        // Thread the pair that already exists (S5 / IMP-01). Without this the
        // duplicate's id never reaches createdIds, so the thread below is skipped
        // by the `createdIds.length > 0` guard — which is why re-importing a
        // crashed import (pairs written, threads.json not yet saved) produced
        // zero threads and left the pairs permanently orphaned. Now a re-run
        // reconstructs the thread from the pairs already on disk.
        const existingId = item.originId ? originIndex.get(item.originId) : undefined
        if (existingId) createdIds.push(existingId)
        debugTrace('bulkImportTrace', 'pair reused', {
          traceId,
          sourceId: thread.sourceId || null,
          itemIndex,
          originId: item.originId ?? null,
          existingId: existingId ?? null,
          reason: 'origin-id-match',
        })
      } else {
        try {
          debugTrace('bulkImportTrace', 'pair creating', {
            traceId,
            sourceId: thread.sourceId || null,
            itemIndex,
            originId: item.originId ?? null,
            duplicateDetected: isDuplicate,
            skipDuplicates: selection.skipDuplicates,
          })
          const created = createPair(item.data)
          createdIds.push(created.id)
          if (item.originId) originIndex.set(item.originId, created.id)
          result.createdPairs += 1
          debugTrace('bulkImportTrace', 'pair created', {
            traceId,
            sourceId: thread.sourceId || null,
            itemIndex,
            originId: item.originId ?? null,
            persistedId: created.id,
          })
        } catch (err) {
          result.failed += 1
          debugError('bulkImportTrace', 'pair creation failed', {
            traceId,
            sourceId: thread.sourceId || null,
            itemIndex,
            originId: item.originId ?? null,
            error: err,
          })
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
          currentThreadName: threadName,
          currentItemTitle: item.data.title,
          threadsDone,
          threadsTotal,
        })
      }

      if (processed % YIELD_EVERY === 0) await yieldToLoop()
    }

    if (createdIds.length > 0) {
      const uniqueItemIds = [...new Set(createdIds)]
      const importSourceId = archiveThreadSourceId(preview, thread)
      let threadId = importSourceId
        ? Object.keys(threads).find((id) => threads[id].importSourceId === importSourceId)
        : undefined
      let reuseReason = threadId ? 'source-id-match' : ''

      // Compatibility for archives imported before importSourceId was persisted:
      // reuse an exact membership match and stamp it. Existing extra copies are
      // intentionally not deleted by an import operation.
      if (!threadId) {
        const membershipMatches = Object.keys(threads).filter((id) =>
          hasExactMembership(threads[id].items, uniqueItemIds),
        )
        threadId = membershipMatches[0]
        reuseReason = threadId ? 'exact-membership-match' : ''
        if (membershipMatches.length > 1) {
          result.warnings.push(
            `Found ${membershipMatches.length} existing copies of "${threadName}"; reused one and left the others unchanged.`,
          )
        }
      }

      if (threadId) {
        const existing = threads[threadId]
        const mergedItems = [...existing.items]
        for (const id of uniqueItemIds) {
          if (!mergedItems.includes(id)) mergedItems.push(id)
        }
        threads[threadId] = {
          ...existing,
          items: mergedItems,
          ...(importSourceId ? { importSourceId } : {}),
        }
        result.reusedThreads += 1
        debugLog('bulkImportTrace', 'conversation thread reused', {
          traceId,
          sourceId: thread.sourceId || null,
          importSourceId: importSourceId ?? null,
          threadId,
          reuseReason,
          itemIds: mergedItems,
        })
      } else {
        threadId = generateThreadId(thread.createdAt, takenThreadIds)
        takenThreadIds.add(threadId)
        threads[threadId] = {
          name: threadName,
          items: uniqueItemIds,
          ...(thread.tags.length > 0 ? { tags: [...thread.tags] } : {}),
          ...(thread.createdAt ? { createdAt: thread.createdAt } : {}),
          ...(thread.updatedAt || thread.createdAt
            ? { updatedAt: thread.updatedAt || thread.createdAt }
            : {}),
          ...(importSourceId ? { importSourceId } : {}),
        }
        result.createdThreads += 1
        result.threadNames.push(threadName)
      }
      // Durable unit: persist threads.json before declaring this conversation
      // done, so a crash after this point cannot lose the thread linkage.
      saveThreads(threads)
      const reloadedThread = loadThreads()[threadId]
      const missingItemIds = createdIds.filter((id) => !reloadedThread?.items.includes(id))
      debugLog('bulkImportTrace', 'conversation persisted', {
        traceId,
        sourceId: thread.sourceId || null,
        threadId,
        expectedItemIds: createdIds,
        reloadedItemIds: reloadedThread?.items ?? [],
        missingItemIds,
        membershipComplete: missingItemIds.length === 0,
      })
    } else if (thread.items.length > 0) {
      result.warnings.push(`"${threadName}" produced no new pairs (all duplicates or failed) — no thread created.`)
    }
    threadsDone += 1
    await yieldToLoop()
  }

  // Final save is a no-op-safe backstop (incremental saves already persisted each
  // completed thread); still needed when nothing triggered an incremental save.
  saveThreads(threads)
  registerImportTags(selected.flatMap((t) => t.tags))

  debugLog('bulkImportTrace', 'commit complete', {
    traceId,
    createdPairs: result.createdPairs,
    skippedDuplicates: result.skippedDuplicates,
    createdThreads: result.createdThreads,
    reusedThreads: result.reusedThreads,
    failed: result.failed,
    cancelled: result.cancelled,
  })

  return result
}
