/**
 * One immutable snapshot of every path an archive operation needs (`INV-PATH`).
 *
 * Replaces ad-hoc `join(getDataDir(), …)` / raw `getDataDirectory()` construction
 * scattered across services. Capturing a snapshot at operation start means a
 * mid-flight settings change cannot redirect a write to a different archive.
 *
 * `namespace` is a stable, path-derived id (SHA-256 of the canonical archive
 * directory) for scoping derived indexes/caches per archive. Path-derived on
 * purpose: moving an archive regenerates its index rather than silently reusing
 * another archive's (the safer first migration).
 */
import { basename, join, resolve } from 'path'
import { createHash } from 'crypto'
import { getDataDirectory } from '../settingsService'

export interface ArchivePaths {
  /** Canonical data root containing archive/, threads.json, tag-dictionary.json. */
  readonly dataRoot: string
  /** Directory holding the QA `.md` files. */
  readonly archiveDir: string
  /** threads.json path. */
  readonly threadsPath: string
  /** tag-dictionary.json path. */
  readonly tagsPath: string
  /** Stable per-archive namespace for derived indexes/caches. */
  readonly namespace: string
}

/** Canonicalize a path for identity/hashing. Windows paths are case-insensitive. */
function canonical(p: string): string {
  const resolved = resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * Resolve an `ArchivePaths` snapshot from a data-directory setting. Normalizes
 * the "user selected the archive/ folder itself" case exactly once.
 */
export function resolveArchivePaths(dataDirectorySetting: string): ArchivePaths {
  const configured = resolve(dataDirectorySetting)
  const dataRoot =
    basename(configured).toLowerCase() === 'archive' ? resolve(configured, '..') : configured

  const archiveDir = join(dataRoot, 'archive')
  const namespace = createHash('sha256').update(canonical(archiveDir)).digest('hex').slice(0, 16)

  return Object.freeze({
    dataRoot,
    archiveDir,
    threadsPath: join(dataRoot, 'threads.json'),
    tagsPath: join(dataRoot, 'tag-dictionary.json'),
    namespace,
  })
}

/** Snapshot for the currently configured data directory. */
export function currentArchivePaths(): ArchivePaths {
  return resolveArchivePaths(getDataDirectory())
}
