import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDataDir } from './pathResolver'
import { debugLog, debugError } from './logger'

export interface ThreadData {
  name: string
  items: string[]
}

export type ThreadMap = Record<string, ThreadData>

function getThreadsPath(): string {
  return join(getDataDir(), 'threads.json')
}

export function loadThreads(): ThreadMap {
  const filepath = getThreadsPath()
  debugLog('threadService', 'loadThreads from:', filepath)
  if (!existsSync(filepath)) {
    debugLog('threadService', 'threads.json not found, returning empty')
    return {}
  }
  const content = readFileSync(filepath, 'utf-8')
  const parsed = JSON.parse(content) as ThreadMap
  debugLog('threadService', 'loaded', Object.keys(parsed).length, 'threads')
  return parsed
}

export function saveThreads(threads: ThreadMap): void {
  const filepath = getThreadsPath()
  const dir = getDataDir()
  debugLog('threadService', 'saveThreads to:', filepath)
  debugLog('threadService', 'threads to save:', JSON.stringify(Object.keys(threads)))
  try {
    if (!existsSync(dir)) {
      debugLog('threadService', 'creating dir:', dir)
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(filepath, JSON.stringify(threads, null, 2), 'utf-8')
    debugLog('threadService', 'saveThreads SUCCESS, file exists:', existsSync(filepath))
  } catch (err) {
    debugError('threadService', 'saveThreads FAILED:', err)
    throw err
  }
}
