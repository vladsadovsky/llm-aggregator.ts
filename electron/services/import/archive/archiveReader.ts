/**
 * import/archive/archiveReader.ts
 * Transport for bulk import: a path the user picked → the text of the entry
 * that holds the conversations.
 *
 * Handles three shapes of the same export:
 *  - the .zip exactly as downloaded
 *  - an unzipped folder
 *  - the inner conversations file on its own
 *
 * **A candidate basename is not enough to identify the right entry.** A single
 * Google Takeout archive contains `My Activity/<Product>/MyActivity.json` for
 * every product you have ever used — YouTube, Chrome, Search, Maps, Gemini Apps
 * — all with the identical filename and envelope. Taking the first basename
 * match would import your browser history. So the caller supplies an `accept`
 * predicate (structural detection) and this module keeps trying candidates
 * until one is accepted, preferring paths that match `pathHints`.
 *
 * Only accepted entries are inflated in full; rejected ones are read and
 * discarded, so hints matter for large archives.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'fs'
import { join, basename as pathBasename, dirname, extname } from 'path'
import yauzl from 'yauzl'
import { debugLog, debugError } from '../../logger'

/** Refuse to inflate a single entry larger than this (guards against zip bombs). */
const MAX_ENTRY_BYTES = 512 * 1024 * 1024

export interface ArchiveEntryText {
  /** Path as it appeared inside the archive (or on disk). */
  entryPath: string
  text: string
}

export interface ReadArchiveOptions {
  /** Entry basenames (lowercase) worth probing. */
  candidateBasenames: string[]
  /**
   * Regex patterns matched against the lowercase basename, for exports whose
   * conversations file is sharded (ChatGPT: `conversations-000.json`, …).
   */
  candidatePatterns?: RegExp[]
  /**
   * Structural check. The first candidate accepted is returned. When omitted,
   * the first candidate found is returned unchecked.
   */
  accept?: (text: string, entryPath: string) => boolean
  /**
   * Lowercase path fragments to try first, e.g. "gemini apps". Purely an
   * ordering optimization — correctness comes from `accept`.
   */
  pathHints?: string[]
}

/** Build a basename matcher from exact names plus optional shard patterns. */
function makeMatcher(basenames: string[], patterns: RegExp[] = []): (entryPath: string) => boolean {
  const wanted = new Set(basenames.map((n) => n.toLowerCase()))
  return (entryPath: string): boolean => {
    const base = pathBasename(entryPath).toLowerCase()
    return wanted.has(base) || patterns.some((p) => p.test(base))
  }
}

/** Rank candidates so hinted paths are probed before everything else. */
function preferenceScore(entryPath: string, pathHints: string[]): number {
  const lower = entryPath.toLowerCase()
  for (let i = 0; i < pathHints.length; i += 1) {
    if (lower.includes(pathHints[i])) return i
  }
  return pathHints.length
}

function orderCandidates<T extends { entryPath: string }>(items: T[], pathHints: string[]): T[] {
  return [...items].sort(
    (a, b) => preferenceScore(a.entryPath, pathHints) - preferenceScore(b.entryPath, pathHints),
  )
}

/**
 * Pass 1 — list matching entry names without inflating anything.
 *
 * yauzl reads sequentially in `lazyEntries` mode: an `Entry` handle is only
 * valid for `openReadStream` during its own `entry` event, so handles cannot be
 * stashed and read later. Listing and fetching are therefore separate passes.
 * Each pass only costs a central-directory read.
 */
function listZipCandidates(
  zipPath: string,
  match: (entryPath: string) => boolean,
): Promise<Array<{ entryPath: string; size: number }>> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
      if (openErr || !zipfile) {
        reject(new Error(`Could not open the archive: ${openErr?.message ?? 'unknown error'}`))
        return
      }
      const found: Array<{ entryPath: string; size: number }> = []
      zipfile.on('error', reject)
      zipfile.on('entry', (entry) => {
        const name = entry.fileName
        if (!name.endsWith('/') && match(name)) {
          found.push({ entryPath: name, size: entry.uncompressedSize })
        }
        zipfile.readEntry()
      })
      zipfile.on('end', () => resolve(found))
      zipfile.readEntry()
    })
  })
}

/** Pass 2 — inflate exactly one entry, identified by its full path. */
function fetchZipEntry(zipPath: string, entryPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
      if (openErr || !zipfile) {
        reject(new Error(`Could not open the archive: ${openErr?.message ?? 'unknown error'}`))
        return
      }
      let settled = false
      const finish = (value: string | null, err?: Error): void => {
        if (settled) return
        settled = true
        try {
          zipfile.close()
        } catch {
          /* already closed */
        }
        if (err) reject(err)
        else resolve(value)
      }

      zipfile.on('error', (err: Error) => finish(null, err))
      zipfile.on('end', () => finish(null))
      zipfile.on('entry', (entry) => {
        if (entry.fileName !== entryPath) {
          zipfile.readEntry()
          return
        }
        // Must open the stream here, while this entry is current.
        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            finish(null, new Error(`Could not read "${entryPath}" from the archive.`))
            return
          }
          const chunks: Buffer[] = []
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('error', (err: Error) => finish(null, err))
          stream.on('end', () => finish(Buffer.concat(chunks).toString('utf-8')))
        })
      })
      zipfile.readEntry()
    })
  })
}

/** Read matching zip entries in preference order, stopping at the first accepted. */
async function readZipEntry(zipPath: string, options: ReadArchiveOptions): Promise<ArchiveEntryText | null> {
  const match = makeMatcher(options.candidateBasenames, options.candidatePatterns)
  const candidates = await listZipCandidates(zipPath, match)
  debugLog('archiveReader', 'zip candidates:', candidates.map((c) => c.entryPath))

  for (const candidate of orderCandidates(candidates, options.pathHints ?? [])) {
    if (candidate.size > MAX_ENTRY_BYTES) {
      debugLog('archiveReader', 'skipping oversized entry', candidate.entryPath, candidate.size)
      continue
    }
    const text = await fetchZipEntry(zipPath, candidate.entryPath)
    if (text === null) continue
    if (!options.accept || options.accept(text, candidate.entryPath)) {
      debugLog('archiveReader', 'accepted zip entry', candidate.entryPath, text.length, 'chars')
      return { entryPath: candidate.entryPath, text }
    }
    debugLog('archiveReader', 'rejected zip entry', candidate.entryPath)
  }

  return null
}

/** Collect candidate file paths under a folder, up to `maxDepth` levels deep. */
function collectFolderCandidates(dir: string, match: (entryPath: string) => boolean, maxDepth: number): string[] {
  const found: string[] = []

  const walk = (current: string, depth: number): void => {
    let names: string[]
    try {
      names = readdirSync(current)
    } catch {
      return
    }
    for (const name of names) {
      const full = join(current, name)
      let isDir: boolean
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        if (depth > 0) walk(full, depth - 1)
      } else if (match(full)) {
        found.push(full)
      }
    }
  }

  walk(dir, maxDepth)
  return found
}

/** Find an acceptable candidate inside an unzipped export folder. */
function readFolderEntry(dir: string, options: ReadArchiveOptions): ArchiveEntryText | null {
  const match = makeMatcher(options.candidateBasenames, options.candidatePatterns)
  const candidates = collectFolderCandidates(dir, match, 4).map((entryPath) => ({ entryPath }))
  debugLog('archiveReader', 'folder candidates:', candidates.map((c) => c.entryPath))

  for (const { entryPath } of orderCandidates(candidates, options.pathHints ?? [])) {
    let text: string
    try {
      text = readFileSync(entryPath, 'utf-8')
    } catch {
      continue
    }
    if (!options.accept || options.accept(text, entryPath)) {
      debugLog('archiveReader', 'accepted folder entry', entryPath)
      return { entryPath, text }
    }
    debugLog('archiveReader', 'rejected folder entry', entryPath)
  }
  return null
}

/**
 * Resolve whatever the user picked into the text of the conversations entry.
 * Returns null when nothing acceptable is inside.
 */
export async function readArchiveEntry(
  sourcePath: string,
  options: ReadArchiveOptions,
): Promise<ArchiveEntryText | null> {
  if (!existsSync(sourcePath)) {
    throw new Error(`File not found: ${sourcePath}`)
  }

  const stats = statSync(sourcePath)

  if (stats.isDirectory()) {
    debugLog('archiveReader', 'reading unzipped folder', sourcePath)
    return readFolderEntry(sourcePath, options)
  }

  if (extname(sourcePath).toLowerCase() === '.zip') {
    debugLog('archiveReader', 'peeking into zip', sourcePath)
    try {
      return await readZipEntry(sourcePath, options)
    } catch (err) {
      debugError('archiveReader', 'zip read failed', err)
      throw err
    }
  }

  // A bare file the user pointed at directly — trust their choice, whatever it
  // is named, and let detection decide.
  debugLog('archiveReader', 'reading plain file', sourcePath)
  return { entryPath: sourcePath, text: readFileSync(sourcePath, 'utf-8') }
}

function readFolderPaths(paths: string[]): ArchiveEntryText[] {
  const out: ArchiveEntryText[] = []
  for (const p of paths) {
    try {
      out.push({ entryPath: p, text: readFileSync(p, 'utf-8') })
    } catch (err) {
      debugError('archiveReader', 'could not read matching entry', p, err)
    }
  }
  return out
}

/**
 * Read EVERY entry matching the given basenames/patterns — used for sharded
 * exports (ChatGPT splits its conversations across `conversations-000.json` …
 * `conversations-00N.json`, which all belong to one logical export and must be
 * merged). The caller already knows the format, so there is no `accept` step.
 *
 * For a bare file the user pointed at, the sibling shards in the same directory
 * are picked up too, so choosing any one shard imports the whole export.
 */
export async function readMatchingEntries(
  sourcePath: string,
  options: { candidateBasenames: string[]; candidatePatterns?: RegExp[] },
): Promise<ArchiveEntryText[]> {
  if (!existsSync(sourcePath)) {
    throw new Error(`File not found: ${sourcePath}`)
  }
  const match = makeMatcher(options.candidateBasenames, options.candidatePatterns)
  const stats = statSync(sourcePath)

  if (stats.isDirectory()) {
    return readFolderPaths(collectFolderCandidates(sourcePath, match, 4))
  }

  if (extname(sourcePath).toLowerCase() === '.zip') {
    const candidates = await listZipCandidates(sourcePath, match)
    const out: ArchiveEntryText[] = []
    for (const candidate of candidates) {
      if (candidate.size > MAX_ENTRY_BYTES) {
        debugLog('archiveReader', 'skipping oversized shard', candidate.entryPath, candidate.size)
        continue
      }
      const text = await fetchZipEntry(sourcePath, candidate.entryPath)
      if (text !== null) out.push({ entryPath: candidate.entryPath, text })
    }
    return out
  }

  // Bare file: read it plus any sibling shards in the same directory.
  const siblings = collectFolderCandidates(dirname(sourcePath), match, 0)
  const paths = Array.from(new Set([sourcePath, ...siblings]))
  return readFolderPaths(paths)
}
