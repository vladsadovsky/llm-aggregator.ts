import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, extname } from 'path'
import matter from 'gray-matter'
import { getDataDir } from './pathResolver'
import { debugLog } from './logger'

export interface QAPairData {
  id: string
  filepath: string
  title: string
  source: string
  url: string
  tags: string[]
  timestamp: string
  version: number
  threadPairs: Array<{ thread_id: string; order: number }>
  question: string
  answer: string
}

export interface QACreateData {
  title: string
  source: string
  url: string
  tags: string[]
  question: string
  answer: string
}

export interface QAUpdateData {
  title?: string
  source?: string
  url?: string
  tags?: string[]
  question?: string
  answer?: string
}

function getArchiveDir(): string {
  const dir = join(getDataDir(), 'archive')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function parseQAFile(filepath: string): QAPairData | null {
  try {
    const content = readFileSync(filepath, 'utf-8')
    const { data: metadata, content: body } = matter(content)

    // Extract question and answer from body
    const qMatch = body.match(/##?\s*Question\s*\n([\s\S]*?)(?=##?\s*Answer|\s*$)/)
    const aMatch = body.match(/##?\s*Answer\s*\n([\s\S]*)/)

    const question = qMatch ? qMatch[1].trim() : ''
    const answer = aMatch ? aMatch[1].trim() : body.trim()

    return {
      id: metadata.id || filepath.replace(/\.md$/, ''),
      filepath,
      title: metadata.title || 'Untitled',
      source: metadata.source || 'unknown',
      url: metadata.url || '',
      tags: metadata.tags || [],
      timestamp: metadata.timestamp || '',
      version: metadata.version || 0,
      threadPairs: metadata.thread_pairs || [],
      question,
      answer,
    }
  } catch (err) {
    console.error(`Error parsing ${filepath}:`, err)
    return null
  }
}

export function listAllPairs(): Record<string, QAPairData> {
  const dir = getArchiveDir()
  debugLog('qaPairService', 'listAllPairs from:', dir)
  const result: Record<string, QAPairData> = {}

  const files = readdirSync(dir).filter((f) => extname(f) === '.md')
  debugLog('qaPairService', 'found', files.length, '.md files')
  for (const file of files) {
    const filepath = join(dir, file)
    const pair = parseQAFile(filepath)
    if (pair) {
      result[pair.id] = pair
    }
  }
  debugLog('qaPairService', 'loaded', Object.keys(result).length, 'pairs')
  return result
}

export function getPair(id: string): QAPairData | null {
  const dir = getArchiveDir()
  const files = readdirSync(dir).filter((f) => extname(f) === '.md')

  for (const file of files) {
    const filepath = join(dir, file)
    const pair = parseQAFile(filepath)
    if (pair && pair.id === id) {
      return pair
    }
  }
  return null
}

export function createPair(data: QACreateData): QAPairData {
  const dir = getArchiveDir()
  const now = new Date()
  const id = formatTimestamp(now)

  // Generate filename matching Python format
  const firstWords = data.question
    .substring(0, 50)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 30)

  const sourceStr = data.source || 'unknown'
  const filename = `${id}_00_${sourceStr}_${firstWords}.md`
  const filepath = join(dir, filename)

  const metadata = {
    id,
    title: data.title,
    timestamp: now.toISOString(),
    source: data.source,
    url: data.url,
    tags: data.tags,
    version: 0,
    thread_pairs: [],
  }

  const content = matter.stringify(
    `\n## Question\n${data.question}\n\n## Answer\n${data.answer}\n`,
    metadata
  )

  writeFileSync(filepath, content, 'utf-8')

  return {
    id,
    filepath,
    title: data.title,
    source: data.source,
    url: data.url,
    tags: data.tags,
    timestamp: now.toISOString(),
    version: 0,
    threadPairs: [],
    question: data.question,
    answer: data.answer,
  }
}

export function updatePair(id: string, data: QAUpdateData): QAPairData | null {
  const pair = getPair(id)
  if (!pair) return null

  const updatedPair = { ...pair, ...data }
  const newVersion = pair.version + 1

  const metadata = {
    id: pair.id,
    title: updatedPair.title,
    timestamp: pair.timestamp,
    source: updatedPair.source,
    url: updatedPair.url,
    tags: updatedPair.tags,
    version: newVersion,
    thread_pairs: pair.threadPairs,
  }

  const content = matter.stringify(
    `\n## Question\n${updatedPair.question}\n\n## Answer\n${updatedPair.answer}\n`,
    metadata
  )

  writeFileSync(pair.filepath, content, 'utf-8')

  return { ...updatedPair, version: newVersion }
}

export function deletePair(id: string): void {
  const pair = getPair(id)
  if (pair && existsSync(pair.filepath)) {
    unlinkSync(pair.filepath)
  }
}

function formatTimestamp(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}${m}${d}_${h}${min}`
}
