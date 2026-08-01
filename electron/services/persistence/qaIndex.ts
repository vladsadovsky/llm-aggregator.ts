/**
 * Archive scan aggregation + id→path index (`INV-DATA`, archive health).
 *
 * Pure: it takes already-parsed files and produces the pairs map, a stable
 * id→path index, and health diagnostics (files that failed to parse, and every
 * duplicate-id collision). Duplicate ids no longer silently overwrite earlier
 * entries — the first occurrence in a deterministic (path-sorted) order wins and
 * the rest are reported.
 */
import type { QAPairData } from '../qaPairService'

export interface SkippedFile {
  path: string
  reason: string
}

export interface DuplicateIdEntry {
  id: string
  keptPath: string
  duplicatePath: string
}

export interface ArchiveScan {
  pairs: Record<string, QAPairData>
  /** id → absolute filepath for the winning pair. */
  index: Map<string, string>
  duplicates: DuplicateIdEntry[]
  skipped: SkippedFile[]
}

export interface ScannedFile {
  path: string
  /** Parsed pair, or null when the file could not be parsed. */
  pair: QAPairData | null
}

/** Aggregate parsed files into pairs + a deterministic index + health data. */
export function aggregateScan(files: ScannedFile[]): ArchiveScan {
  const pairs: Record<string, QAPairData> = {}
  const index = new Map<string, string>()
  const duplicates: DuplicateIdEntry[] = []
  const skipped: SkippedFile[] = []

  // Deterministic order so "first wins" is stable across runs.
  const ordered = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  for (const { path, pair } of ordered) {
    if (!pair) {
      skipped.push({ path, reason: 'parse-failed' })
      continue
    }
    const existing = index.get(pair.id)
    if (existing) {
      duplicates.push({ id: pair.id, keptPath: existing, duplicatePath: path })
      continue
    }
    pairs[pair.id] = pair
    index.set(pair.id, path)
  }

  return { pairs, index, duplicates, skipped }
}
