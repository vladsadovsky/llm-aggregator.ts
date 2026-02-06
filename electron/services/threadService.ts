import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDataDir } from './pathResolver'

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
  if (!existsSync(filepath)) {
    return {}
  }
  const content = readFileSync(filepath, 'utf-8')
  return JSON.parse(content)
}

export function saveThreads(threads: ThreadMap): void {
  const filepath = getThreadsPath()
  const dir = join(getDataDir())
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(filepath, JSON.stringify(threads, null, 2), 'utf-8')
}
