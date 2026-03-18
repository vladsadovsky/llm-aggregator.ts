import { getProvider } from './llm/providerFactory'
import { getPair, updatePair } from './qaPairService'
import type { QAPairData } from './qaPairService'
import { debugLog, debugError } from './logger'

const SYSTEM_PROMPT = `You are analyzing a Q&A pair from a personal research archive on a narrow technical domain.
Generate structured metadata about it. Respond with valid JSON only — no prose, no markdown fences.`

interface AIMetadata {
  aiTopic: string
  aiConcepts: string[]
  aiStatus: 'open' | 'closed' | 'speculative' | 'dead-end'
  aiConfidence: 'speculative' | 'working' | 'confident' | 'validated'
  aiSummary: string
}

function buildPrompt(pair: QAPairData): string {
  return `Analyze this Q&A pair and return a JSON object with exactly these fields:

- "aiTopic": a single short topic string (e.g. "gradient descent", "memory consolidation")
- "aiConcepts": array of 3–6 key concept strings extracted from the content
- "aiStatus": one of "open" (question remains unresolved), "closed" (question is settled), "speculative" (hypothesis or tentative claim), "dead-end" (direction consciously closed)
- "aiConfidence": one of "speculative" (highly uncertain), "working" (plausible but unverified), "confident" (well-supported), "validated" (empirically confirmed)
- "aiSummary": 1–2 sentence summary of what was established or concluded

Title: ${pair.title}

Question:
${pair.question}

Answer:
${pair.answer}`
}

export async function generateMetadata(id: string): Promise<QAPairData | null> {
  const pair = getPair(id)
  if (!pair) {
    debugError('metadataService', 'QA not found:', id)
    return null
  }

  debugLog('metadataService', 'generating metadata for:', id)
  const provider = getProvider()
  const raw = await provider.complete(buildPrompt(pair), SYSTEM_PROMPT)

  // Strip markdown code fences if the model included them despite instructions
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let metadata: AIMetadata
  try {
    metadata = JSON.parse(cleaned) as AIMetadata
  } catch (err) {
    debugError('metadataService', 'Failed to parse LLM response as JSON:', cleaned, err)
    throw new Error(`Metadata generation failed: could not parse response as JSON. Raw response: ${raw.slice(0, 200)}`)
  }

  debugLog('metadataService', 'metadata generated:', metadata)

  return updatePair(id, {
    aiTopic: metadata.aiTopic,
    aiConcepts: metadata.aiConcepts,
    aiStatus: metadata.aiStatus,
    aiConfidence: metadata.aiConfidence,
    aiSummary: metadata.aiSummary,
  })
}
