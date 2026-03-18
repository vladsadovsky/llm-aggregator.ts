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
  // Machine-generated metadata (all optional, prefixed ai_)
  aiTopic?: string
  aiConcepts?: string[]
  aiStatus?: 'open' | 'closed' | 'speculative' | 'dead-end'
  aiConfidence?: 'speculative' | 'working' | 'confident' | 'validated'
  aiSummary?: string
  aiRelatedIds?: string[]
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
  aiTopic?: string
  aiConcepts?: string[]
  aiStatus?: 'open' | 'closed' | 'speculative' | 'dead-end'
  aiConfidence?: 'speculative' | 'working' | 'confident' | 'validated'
  aiSummary?: string
  aiRelatedIds?: string[]
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
      // Machine-generated metadata (optional)
      ...(metadata.ai_topic !== undefined && { aiTopic: metadata.ai_topic }),
      ...(metadata.ai_concepts !== undefined && { aiConcepts: metadata.ai_concepts }),
      ...(metadata.ai_status !== undefined && { aiStatus: metadata.ai_status }),
      ...(metadata.ai_confidence !== undefined && { aiConfidence: metadata.ai_confidence }),
      ...(metadata.ai_summary !== undefined && { aiSummary: metadata.ai_summary }),
      ...(metadata.ai_related_ids !== undefined && { aiRelatedIds: metadata.ai_related_ids }),
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
  const id = generateUniqueId(dir, now)

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

  const metadata: Record<string, unknown> = {
    id: pair.id,
    title: updatedPair.title,
    timestamp: pair.timestamp,
    source: updatedPair.source,
    url: updatedPair.url,
    tags: updatedPair.tags,
    version: newVersion,
    thread_pairs: pair.threadPairs,
  }
  // Persist ai_ fields if present (use snake_case keys in frontmatter)
  if (updatedPair.aiTopic !== undefined) metadata.ai_topic = updatedPair.aiTopic
  if (updatedPair.aiConcepts !== undefined) metadata.ai_concepts = updatedPair.aiConcepts
  if (updatedPair.aiStatus !== undefined) metadata.ai_status = updatedPair.aiStatus
  if (updatedPair.aiConfidence !== undefined) metadata.ai_confidence = updatedPair.aiConfidence
  if (updatedPair.aiSummary !== undefined) metadata.ai_summary = updatedPair.aiSummary
  if (updatedPair.aiRelatedIds !== undefined) metadata.ai_related_ids = updatedPair.aiRelatedIds

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
  const sec = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${y}${m}${d}_${h}${min}${sec}_${ms}`
}

function generateUniqueId(dir: string, base: Date): string {
  let candidateDate = new Date(base.getTime())
  for (let i = 0; i < 1000; i += 1) {
    const candidate = formatTimestamp(candidateDate)
    const exists = readdirSync(dir).some((file) => file.startsWith(`${candidate}_`) && extname(file) === '.md')
    if (!exists) {
      return candidate
    }
    candidateDate = new Date(candidateDate.getTime() + 1)
  }
  // Last-resort fallback. This should be practically unreachable.
  return `${formatTimestamp(new Date())}_${Math.random().toString(36).slice(2, 8)}`
}
