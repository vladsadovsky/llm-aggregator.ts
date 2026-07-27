/**
 * archiveResetService.ts
 * Returns the app to its "virgin" state: no Q&A pairs, no threads, no tag
 * vocabulary, no embeddings.
 *
 * Nothing is deleted. Everything is *moved* into `<dataDirectory>/purged-<stamp>/`
 * in one step, so a mis-click is recoverable by hand and the operation stays fast
 * regardless of archive size (a rename, not thousands of unlinks). The app never
 * scans that folder — only `<dataDirectory>/archive` is read.
 *
 * Deliberately preserved: `settings.json` (including the data directory itself),
 * stored API keys, and the model-catalog cache. Those are configuration, not
 * archive content, and wiping them would log the user out of their own setup.
 */

import { existsSync, mkdirSync, readdirSync, renameSync, copyFileSync, unlinkSync, readFileSync } from 'fs'
import { join, extname } from 'path'
import { app } from 'electron'
import { getDataDir } from './pathResolver'
import { saveThreads } from './threadService'
import { invalidateCache as invalidateTagCache } from './tagDictionaryService'
import { debugLog, debugError } from './logger'

export interface ArchiveResetResult {
  pairsRemoved: number
  threadsRemoved: number
  tagsRemoved: number
  embeddingsRemoved: boolean
  /** Absolute path of the folder everything was moved into. */
  backupPath: string
  warnings: string[]
}

/** What a reset would remove, for the confirmation dialog. */
export interface ArchiveResetPreview {
  pairs: number
  threads: number
  tags: number
  hasEmbeddings: boolean
  dataDirectory: string
}

function timestampSuffix(): string {
  const now = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_` +
    `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  )
}

function countMarkdownFiles(dir: string): number {
  if (!existsSync(dir)) return 0
  try {
    return readdirSync(dir).filter((f) => extname(f) === '.md').length
  } catch {
    return 0
  }
}

function countJsonKeys(path: string, key?: string): number {
  if (!existsSync(path)) return 0
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    const target = key ? parsed?.[key] : parsed
    return target && typeof target === 'object' ? Object.keys(target).length : 0
  } catch {
    return 0
  }
}

function getEmbeddingsPath(): string {
  return join(app.getPath('userData'), 'embeddings.json')
}

/**
 * Move `from` to `to`. Falls back to copy+unlink because the embeddings file
 * lives under `userData` while the backup folder lives in the data directory —
 * those can be on different volumes, where rename fails with EXDEV.
 */
function movePath(from: string, to: string): void {
  try {
    renameSync(from, to)
  } catch {
    copyFileSync(from, to)
    unlinkSync(from)
  }
}

export function previewArchiveReset(): ArchiveResetPreview {
  const dataDir = getDataDir()
  return {
    pairs: countMarkdownFiles(join(dataDir, 'archive')),
    threads: countJsonKeys(join(dataDir, 'threads.json')),
    tags: countJsonKeys(join(dataDir, 'tag-dictionary.json'), 'tags'),
    hasEmbeddings: existsSync(getEmbeddingsPath()),
    dataDirectory: dataDir,
  }
}

/**
 * Clear the archive. Each item is moved independently: a file that is locked by
 * another process must not leave the reset half-done and silent, so failures are
 * collected as warnings and the rest proceeds.
 */
export function resetArchive(): ArchiveResetResult {
  const dataDir = getDataDir()
  const before = previewArchiveReset()
  const backupPath = join(dataDir, `purged-${timestampSuffix()}`)
  const warnings: string[] = []

  mkdirSync(backupPath, { recursive: true })

  const archiveDir = join(dataDir, 'archive')
  if (existsSync(archiveDir)) {
    try {
      movePath(archiveDir, join(backupPath, 'archive'))
    } catch (err) {
      debugError('archiveReset', 'could not move archive dir', err)
      warnings.push(`The archive folder could not be moved aside: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // Recreate it empty so the next listAllPairs() has somewhere to look.
  mkdirSync(archiveDir, { recursive: true })

  for (const filename of ['threads.json', 'tag-dictionary.json']) {
    const path = join(dataDir, filename)
    if (!existsSync(path)) continue
    try {
      movePath(path, join(backupPath, filename))
    } catch (err) {
      debugError('archiveReset', 'could not move', filename, err)
      warnings.push(`${filename} could not be moved aside: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  let embeddingsRemoved = false
  const embeddingsPath = getEmbeddingsPath()
  if (existsSync(embeddingsPath)) {
    try {
      movePath(embeddingsPath, join(backupPath, 'embeddings.json'))
      embeddingsRemoved = true
    } catch (err) {
      debugError('archiveReset', 'could not move embeddings.json', err)
      warnings.push(`embeddings.json could not be moved aside: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Write an empty threads.json rather than leaving the file absent — loadThreads
  // tolerates either, but an existing empty file is the app's normal steady state.
  saveThreads({})
  // The dictionary is cached in memory; without this the old vocabulary would be
  // re-saved to disk on the next tag write.
  invalidateTagCache()

  const result: ArchiveResetResult = {
    pairsRemoved: before.pairs,
    threadsRemoved: before.threads,
    tagsRemoved: before.tags,
    embeddingsRemoved,
    backupPath,
    warnings,
  }
  debugLog('archiveReset', 'reset complete', result)
  return result
}
