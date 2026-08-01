import { join } from 'path'
import { getDataDir } from './pathResolver'
import { debugLog, debugError } from './logger'
import { atomicWriteJsonSync } from './persistence/atomicFile'
import { loadJsonFile, raiseBarrier, clearBarrier, assertWritable } from './persistence/loadState'
import { ipcError } from '../../shared/contracts/errorWire'

/** Mirrors `src/types/Thread.ts` — threads.json is written from both sides. */
export interface ThreadData {
  name: string
  items: string[]
  tags?: string[]
  /** ISO. Source-conversation time for imports, creation time otherwise. */
  createdAt?: string
  /** ISO. Last entry or edit. */
  updatedAt?: string
}

export type ThreadMap = Record<string, ThreadData>

/** Barrier key for the failed-load quarantine (INV-LOAD). */
const THREADS_BARRIER = 'threads.json'

function getThreadsPath(): string {
  return join(getDataDir(), 'threads.json')
}

/** Accept any plain object; reject arrays/primitives as corrupt. Entry shapes stay
 *  backward-compatible on purpose — a slightly-older file must still load. */
function validateThreadMap(parsed: unknown): ThreadMap {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('threads.json is not an object map')
  }
  return parsed as ThreadMap
}

export function loadThreads(): ThreadMap {
  const filepath = getThreadsPath()
  debugLog('threadService', 'loadThreads from:', filepath)
  const state = loadJsonFile<ThreadMap>(filepath, { validate: validateThreadMap })

  switch (state.status) {
    case 'missing':
      clearBarrier(THREADS_BARRIER)
      debugLog('threadService', 'threads.json not found, returning empty')
      return {}
    case 'loaded':
      clearBarrier(THREADS_BARRIER)
      debugLog('threadService', 'loaded', Object.keys(state.value ?? {}).length, 'threads')
      return state.value ?? {}
    default:
      // corrupt / unreadable — never return empty and let the renderer save {}
      // over the last readable state. Quarantine until repair or reload.
      raiseBarrier(THREADS_BARRIER, state.status)
      debugError('threadService', 'threads.json load failed:', state.status, state.diagnostics)
      throw ipcError('load-corrupt', 'threads.json could not be read. Restore or fix it, then reload.')
  }
}

export function saveThreads(threads: ThreadMap): void {
  // Refuse to overwrite a quarantined file (INV-LOAD), then write atomically with
  // a last-known-good sibling (INV-DATA).
  assertWritable(THREADS_BARRIER)
  const filepath = getThreadsPath()
  debugLog('threadService', 'saveThreads to:', filepath, Object.keys(threads).length, 'threads')
  atomicWriteJsonSync(filepath, threads, { keepLastKnownGood: true })
}
