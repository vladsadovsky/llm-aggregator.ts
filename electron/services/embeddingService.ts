import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getEmbeddingProvider } from './llm/providerFactory'
import { getPair, listAllPairs } from './qaPairService'
import { debugLog, debugError } from './logger'

interface EmbeddingEntry {
  hash: string
  vector: number[]
}

type EmbeddingsStore = Record<string, EmbeddingEntry>

function getEmbeddingsPath(): string {
  return join(app.getPath('userData'), 'embeddings.json')
}

function loadStore(): EmbeddingsStore {
  const path = getEmbeddingsPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as EmbeddingsStore
  } catch {
    return {}
  }
}

function saveStore(store: EmbeddingsStore): void {
  writeFileSync(getEmbeddingsPath(), JSON.stringify(store), 'utf-8')
}

function contentHash(question: string, answer: string): string {
  return createHash('sha256').update(question + '\n\n' + answer).digest('hex')
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Generate and store an embedding for the given QA id.
 * No-ops if the content hasn't changed since the last embedding.
 */
export async function generateEmbedding(id: string): Promise<void> {
  const pair = getPair(id)
  if (!pair) {
    debugError('embeddingService', 'QA not found:', id)
    return
  }

  const hash = contentHash(pair.question, pair.answer)
  const store = loadStore()

  if (store[id]?.hash === hash) {
    debugLog('embeddingService', 'embedding up to date for:', id)
    return
  }

  debugLog('embeddingService', 'generating embedding for:', id)
  const provider = getEmbeddingProvider()
  const text = `${pair.question}\n\n${pair.answer}`
  const vector = await provider.embed(text)

  store[id] = { hash, vector }
  saveStore(store)
  debugLog('embeddingService', 'embedding stored for:', id)
}

/**
 * Generate embeddings for all QAs that are missing or stale.
 * Returns counts: { total, generated, skipped }.
 */
export async function generateAllEmbeddings(): Promise<{ total: number; generated: number; skipped: number }> {
  const pairs = listAllPairs()
  const store = loadStore()
  const provider = getEmbeddingProvider()

  let generated = 0
  let skipped = 0
  const ids = Object.keys(pairs)

  for (const id of ids) {
    const pair = pairs[id]
    const hash = contentHash(pair.question, pair.answer)

    if (store[id]?.hash === hash) {
      skipped++
      continue
    }

    debugLog('embeddingService', 'generating embedding for:', id)
    const text = `${pair.question}\n\n${pair.answer}`
    const vector = await provider.embed(text)
    store[id] = { hash, vector }
    generated++
  }

  if (generated > 0) {
    saveStore(store)
  }

  return { total: ids.length, generated, skipped }
}

/**
 * Find the top-K most similar QA ids to the given query text.
 */
export async function semanticSearch(query: string, topK: number): Promise<string[]> {
  const provider = getEmbeddingProvider()
  const queryVector = await provider.embed(query)

  const store = loadStore()
  const entries = Object.entries(store)

  if (entries.length === 0) return []

  const scored = entries.map(([id, entry]) => ({
    id,
    score: cosineSimilarity(queryVector, entry.vector),
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).map((e) => e.id)
}
