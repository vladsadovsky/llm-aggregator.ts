import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { listAllPairs } from './qaPairService'
import { loadThreads } from './threadService'
import { debugLog } from './logger'

export interface DuplicateCandidate {
  idA: string
  titleA: string
  idB: string
  titleB: string
  similarity: number
}

export interface DeadEndEntry {
  id: string
  title: string
  status: string
  ageMonths: number
}

export interface HealthReport {
  totalPairs: number
  orphanIds: string[]
  metadataGaps: {
    missingTopic: string[]
    missingSummary: string[]
    missingConfidence: string[]
  }
  duplicateCandidates: DuplicateCandidate[]
  deadEndCandidates: DeadEndEntry[]
}

interface EmbeddingEntry {
  hash: string
  vector: number[]
}

type EmbeddingsStore = Record<string, EmbeddingEntry>

function loadEmbeddingsStore(): EmbeddingsStore {
  const path = join(app.getPath('userData'), 'embeddings.json')
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as EmbeddingsStore
  } catch {
    return {}
  }
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

function monthsAgo(timestamp: string): number {
  const created = new Date(timestamp).getTime()
  const now = Date.now()
  return (now - created) / (1000 * 60 * 60 * 24 * 30)
}

const DUPLICATE_THRESHOLD = 0.88
const DEAD_END_AGE_MONTHS = 6

export function runHealthCheck(): HealthReport {
  const pairs = listAllPairs()
  const threads = loadThreads()
  const embeddings = loadEmbeddingsStore()

  const allIds = Object.keys(pairs)
  debugLog('healthService', `Running health check on ${allIds.length} pairs`)

  // ── 1. Orphan detection ──────────────────────────────────────
  // Collect all IDs that appear in any thread
  const threadedIds = new Set<string>()
  for (const thread of Object.values(threads)) {
    for (const id of thread.items) {
      threadedIds.add(id)
    }
  }

  const orphanIds = allIds.filter((id) => {
    const pair = pairs[id]
    const inThread = threadedIds.has(id)
    const hasTags = pair.tags && pair.tags.length > 0
    return !inThread && !hasTags
  })

  // ── 2. Metadata coverage gaps ────────────────────────────────
  const missingTopic: string[] = []
  const missingSummary: string[] = []
  const missingConfidence: string[] = []

  for (const id of allIds) {
    const pair = pairs[id]
    if (!pair.aiTopic) missingTopic.push(id)
    if (!pair.aiSummary) missingSummary.push(id)
    if (!pair.aiConfidence) missingConfidence.push(id)
  }

  // ── 3. Near-duplicate detection ──────────────────────────────
  const duplicateCandidates: DuplicateCandidate[] = []
  const embeddedIds = allIds.filter((id) => embeddings[id]?.vector)

  for (let i = 0; i < embeddedIds.length; i++) {
    for (let j = i + 1; j < embeddedIds.length; j++) {
      const idA = embeddedIds[i]
      const idB = embeddedIds[j]
      const sim = cosineSimilarity(embeddings[idA].vector, embeddings[idB].vector)
      if (sim >= DUPLICATE_THRESHOLD) {
        duplicateCandidates.push({
          idA,
          titleA: pairs[idA]?.title ?? idA,
          idB,
          titleB: pairs[idB]?.title ?? idB,
          similarity: Math.round(sim * 100) / 100,
        })
      }
    }
  }

  // Sort by similarity descending
  duplicateCandidates.sort((a, b) => b.similarity - a.similarity)

  // ── 4. Dead-end / open entries without closure ───────────────
  const deadEndCandidates: DeadEndEntry[] = []

  for (const id of allIds) {
    const pair = pairs[id]
    const status = pair.aiStatus
    if (status === 'dead-end' || status === 'open') {
      const age = monthsAgo(pair.timestamp)
      if (age >= DEAD_END_AGE_MONTHS) {
        deadEndCandidates.push({
          id,
          title: pair.title,
          status,
          ageMonths: Math.round(age),
        })
      }
    }
  }

  deadEndCandidates.sort((a, b) => b.ageMonths - a.ageMonths)

  const report: HealthReport = {
    totalPairs: allIds.length,
    orphanIds,
    metadataGaps: { missingTopic, missingSummary, missingConfidence },
    duplicateCandidates,
    deadEndCandidates,
  }

  debugLog('healthService', `Health check complete: ${orphanIds.length} orphans, ${duplicateCandidates.length} duplicate candidates, ${deadEndCandidates.length} dead-end candidates`)

  return report
}
