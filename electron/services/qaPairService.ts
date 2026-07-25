import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, extname, basename } from 'path'
import matter from 'gray-matter'
import yaml from 'js-yaml'
import { getDataDir } from './pathResolver'
import { debugLog } from './logger'

/** Serialize a metadata object + answer body into a .md file string. */
function serializeQAFile(frontmatter: Record<string, unknown>, answer: string): string {
  let yamlStr = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true, quotingType: '"' })

  // Keep id as an explicit string in YAML so values like 20260724_163232_733
  // are not coerced to numbers on read (which drops underscores / precision).
  if (typeof frontmatter.id === 'string' && frontmatter.id.length > 0) {
    const escaped = frontmatter.id.replace(/'/g, "''")
    yamlStr = yamlStr.replace(/^id:\s*.*$/m, `id: '${escaped}'`)
  }

  return `---\n${yamlStr}---\n\n${answer.trim()}\n`
}

function extractIdFromFilename(filepath: string): string | null {
  const name = basename(filepath, '.md')
  const marker = '_00_'
  const idx = name.indexOf(marker)
  if (idx <= 0) return null
  return name.slice(0, idx)
}

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

    // New format: question stored in frontmatter, body is the answer
    // Legacy format: ## Question / ## Answer markers in body (read-only fallback)
    let question: string
    let answer: string
    if (metadata.question !== undefined) {
      question = String(metadata.question).trim()
      answer = body.trim()
    } else {
      const qMatch = body.match(/##?\s*Question\s*\n([\s\S]*?)(?=##?\s*Answer|\s*$)/)
      const aMatch = body.match(/##?\s*Answer\s*\n([\s\S]*)/)
      question = qMatch ? qMatch[1].trim() : ''
      answer = aMatch ? aMatch[1].trim() : body.trim()
    }

    const filenameId = extractIdFromFilename(filepath)
    const parsedId = metadata.id !== undefined && metadata.id !== null ? String(metadata.id) : ''

    return {
      id: filenameId || parsedId || filepath.replace(/\.md$/, ''),
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
    question: data.question,
  }

  const content = serializeQAFile(metadata, data.answer)

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
    question: updatedPair.question,
  }
  // Persist ai_ fields if present (use snake_case keys in frontmatter)
  if (updatedPair.aiTopic !== undefined) metadata.ai_topic = updatedPair.aiTopic
  if (updatedPair.aiConcepts !== undefined) metadata.ai_concepts = updatedPair.aiConcepts
  if (updatedPair.aiStatus !== undefined) metadata.ai_status = updatedPair.aiStatus
  if (updatedPair.aiConfidence !== undefined) metadata.ai_confidence = updatedPair.aiConfidence
  if (updatedPair.aiSummary !== undefined) metadata.ai_summary = updatedPair.aiSummary
  if (updatedPair.aiRelatedIds !== undefined) metadata.ai_related_ids = updatedPair.aiRelatedIds

  const content = serializeQAFile(metadata, updatedPair.answer)

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
