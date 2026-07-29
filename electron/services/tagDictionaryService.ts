import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDataDirectory } from './settingsService'
import { listAllPairs } from './qaPairService'
import { debugLog, debugError } from './logger'

export interface TagEntry {
  created: string
  aliases: string[]
}

export interface TagDictionary {
  version: number
  tags: Record<string, TagEntry>
}

// ── Module-level cache ──────────────────────────────────────────────────────
// Invalidated on every saveDictionary() and on explicit invalidateCache() call.
let _cache: TagDictionary | null = null

/**
 * Absolute path of the tag dictionary. Exported so other services (e.g. archive
 * reset) locate it here rather than re-deriving it — it lives under raw
 * `getDataDirectory()`, which differs from `getDataDir()` when the user has
 * selected the `archive` folder itself, and a second copy of that logic drifted
 * (issue: archive reset reported `tags: 0` and left the dictionary behind).
 */
export function getDictionaryPath(): string {
  return join(getDataDirectory(), 'tag-dictionary.json')
}

// ── I/O ────────────────────────────────────────────────────────────────────

export function loadDictionary(): TagDictionary {
  if (_cache) return _cache
  const path = getDictionaryPath()
  if (!existsSync(path)) {
    _cache = { version: 1, tags: {} }
    return _cache
  }
  try {
    _cache = JSON.parse(readFileSync(path, 'utf-8')) as TagDictionary
    debugLog('tagDictionaryService', 'loaded', Object.keys(_cache.tags).length, 'tags from', path)
    return _cache
  } catch (err) {
    debugError('tagDictionaryService', 'Failed to parse tag-dictionary.json, starting empty:', err)
    _cache = { version: 1, tags: {} }
    return _cache
  }
}

export function saveDictionary(dict: TagDictionary): void {
  const path = getDictionaryPath()
  const dir = join(path, '..')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(path, JSON.stringify(dict, null, 2), 'utf-8')
  _cache = dict
  debugLog('tagDictionaryService', 'saved', Object.keys(dict.tags).length, 'tags')
}

/** Discard in-memory cache so the next load reads fresh from disk.
 *  Call when the data directory changes (settings save). */
export function invalidateCache(): void {
  _cache = null
}

// ── Query ──────────────────────────────────────────────────────────────────

/** Return the canonical tag name if `input` is a known tag or alias, else null. */
export function resolveTag(input: string): string | null {
  const normalized = input.trim().toLowerCase()
  if (!normalized) return null
  const dict = loadDictionary()
  if (dict.tags[normalized]) return normalized
  for (const [canonical, entry] of Object.entries(dict.tags)) {
    if (entry.aliases.some((a) => a.toLowerCase() === normalized)) {
      return canonical
    }
  }
  return null
}

export function isKnownTag(input: string): boolean {
  return resolveTag(input) !== null
}

export function listTags(): string[] {
  return Object.keys(loadDictionary().tags).sort()
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Add a new canonical tag. No-op if the tag already exists. */
export function addTag(tag: string, aliases: string[] = []): void {
  const normalized = tag.trim().toLowerCase()
  if (!normalized) return
  const dict = loadDictionary()
  if (dict.tags[normalized]) return
  dict.tags[normalized] = {
    created: new Date().toISOString(),
    aliases: aliases.map((a) => a.trim().toLowerCase()).filter(Boolean),
  }
  saveDictionary(dict)
}

/** Remove a canonical tag from the dictionary. Does NOT retag QA pairs. */
export function removeTag(tag: string): void {
  const normalized = tag.trim().toLowerCase()
  const dict = loadDictionary()
  if (!dict.tags[normalized]) return
  delete dict.tags[normalized]
  saveDictionary(dict)
}

/** Rename a canonical tag. The old name becomes an alias of the new name. */
export function renameTag(oldTag: string, newTag: string): void {
  const oldNorm = oldTag.trim().toLowerCase()
  const newNorm = newTag.trim().toLowerCase()
  if (!oldNorm || !newNorm || oldNorm === newNorm) return
  const dict = loadDictionary()
  const entry = dict.tags[oldNorm]
  if (!entry) return
  const mergedAliases = [...new Set([...entry.aliases, oldNorm])]
  dict.tags[newNorm] = { ...entry, aliases: mergedAliases }
  delete dict.tags[oldNorm]
  saveDictionary(dict)
}

/** Add an alias to an existing canonical tag. */
export function addAlias(tag: string, alias: string): void {
  const normalized = tag.trim().toLowerCase()
  const aliasNorm = alias.trim().toLowerCase()
  if (!aliasNorm) return
  const dict = loadDictionary()
  if (!dict.tags[normalized]) return
  if (!dict.tags[normalized].aliases.includes(aliasNorm)) {
    dict.tags[normalized].aliases.push(aliasNorm)
    saveDictionary(dict)
  }
}

/** Remove an alias from a canonical tag. */
export function removeAlias(tag: string, alias: string): void {
  const normalized = tag.trim().toLowerCase()
  const aliasNorm = alias.trim().toLowerCase()
  const dict = loadDictionary()
  if (!dict.tags[normalized]) return
  dict.tags[normalized].aliases = dict.tags[normalized].aliases.filter((a) => a !== aliasNorm)
  saveDictionary(dict)
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

/** Scan all QA pairs and add any tags not yet in the dictionary.
 *  Returns the list of tag names that were newly added. */
export function syncFromArchive(): { added: string[] } {
  const pairs = listAllPairs()
  const dict = loadDictionary()
  const added: string[] = []

  for (const pair of Object.values(pairs)) {
    for (const tag of pair.tags) {
      const normalized = tag.trim().toLowerCase()
      if (!normalized) continue
      if (!dict.tags[normalized]) {
        dict.tags[normalized] = {
          created: new Date().toISOString(),
          aliases: [],
        }
        added.push(normalized)
      }
    }
  }

  if (added.length > 0) {
    saveDictionary(dict)
    debugLog('tagDictionaryService', 'syncFromArchive added', added.length, 'tags')
  }

  return { added }
}
