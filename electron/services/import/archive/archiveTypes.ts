/**
 * import/archive/archiveTypes.ts
 * Shared types for bulk ("account export") import.
 *
 * Pure — no Electron / filesystem — so the format registry and parsers can be
 * unit-tested under Node. Transport (file / zip reading) lives in
 * `archiveReader.ts`; orchestration in `bulkImportService.ts`.
 *
 * Note on plurality: every structure here is multi-conversation and every
 * selection is expressed as an array of ids. Single-item flows are the
 * one-element case, so the planned multi-select export / re-import does not
 * need a second set of shapes.
 */

import type { ProviderId, SharedImportQA } from '../types'

export type ArchiveFormatId =
  | 'claude-account-export'
  | 'chatgpt-account-export'
  | 'gemini-takeout'
  | 'copilot-activity-csv'

/** One conversation from an account export, ready to become a thread. */
export interface BulkImportThread {
  /** Provider-side conversation id. Stable across re-exports; used for selection. */
  sourceId: string
  name: string
  /** True when no real title was present and the name was derived. */
  nameWasDerived: boolean
  tags: string[]
  items: SharedImportQA[]
  /** ISO creation time reported by the provider, '' when unknown. */
  createdAt: string
  /** ISO time of the conversation's last message, '' when unknown. */
  updatedAt: string
  warnings: string[]
  /** Pairs in this thread whose `originId` already exists in the archive. */
  duplicateCount: number
}

/** Result of inspecting an archive, shown to the user before anything is written. */
export interface BulkImportPreview {
  format: ArchiveFormatId
  /** Human-readable format name, e.g. "Claude account export". */
  formatLabel: string
  provider: ProviderId
  /** Absolute path of the file the user picked. */
  sourcePath: string
  /** Entry inside the archive the conversations were read from. */
  sourceEntry: string
  threads: BulkImportThread[]
  totalPairs: number
  /** Pairs already present in the archive (matched by `origin_id`). */
  duplicatePairs: number
  /** Earliest / latest conversation timestamps, ISO. '' when unknown. */
  dateRange: { from: string; to: string }
  warnings: string[]
}

/**
 * Renderer-facing projection of a preview. The full preview holds every
 * question and answer body — megabytes for a real export — and the renderer
 * needs none of it to draw the selection list, so only counts and labels cross
 * the IPC bridge. The full preview stays in the main process, addressed by
 * `previewId` at commit time.
 */
export interface BulkImportThreadSummary {
  sourceId: string
  name: string
  nameWasDerived: boolean
  tags: string[]
  pairCount: number
  duplicateCount: number
  createdAt: string
  updatedAt: string
  warnings: string[]
}

export interface BulkImportPreviewSummary {
  previewId: string
  format: ArchiveFormatId
  formatLabel: string
  provider: ProviderId
  sourcePath: string
  sourceEntry: string
  threads: BulkImportThreadSummary[]
  totalPairs: number
  duplicatePairs: number
  dateRange: { from: string; to: string }
  warnings: string[]
}

/** What the user chose in the preview dialog. */
export interface BulkImportSelection {
  /** Conversations to import, by `BulkImportThread.sourceId`. Empty imports nothing. */
  threadSourceIds: string[]
  /** Skip pairs whose `origin_id` is already in the archive. */
  skipDuplicates: boolean
  /**
   * Prefix each created thread's name with its UTC calendar day. Only meaningful
   * for `gemini-takeout`, where a thread is a day-bucket rather than a real
   * conversation — ignored for every other format.
   */
  includeDateInThreadNames?: boolean
}

/** Progress tick emitted from main → renderer during a commit. */
export interface BulkImportProgress {
  /** Pairs written (or skipped) so far. */
  processed: number
  total: number
  /** 0–100, rounded. */
  percent: number
  /** Estimated seconds remaining; null until a rate can be established. */
  etaSeconds: number | null
  /** Thread currently being written, for display. */
  currentThreadName: string
  /** Pair currently being written, for display. */
  currentItemTitle: string
  /** Threads finished so far. */
  threadsDone: number
  threadsTotal: number
}

/** Outcome of a committed bulk import. */
export interface BulkImportCommitResult {
  createdPairs: number
  skippedDuplicates: number
  createdThreads: number
  failed: number
  /** Names of threads that were created, in order. */
  threadNames: string[]
  warnings: string[]
  /** True when the commit stopped early on user cancellation. */
  cancelled: boolean
}
