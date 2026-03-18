import { getProvider } from './llm/providerFactory'
import { listAllPairs, updatePair } from './qaPairService'
import { debugLog, debugError } from './logger'
import type { QAPairData } from './qaPairService'

export type ConfidenceLevel = 'speculative' | 'working' | 'confident' | 'validated'

export interface AnnotationProposal {
  id: string
  title: string
  currentConfidence: ConfidenceLevel | undefined
  proposedConfidence: ConfidenceLevel
  rationale: string
}

const BATCH_SIZE = 20

const SYSTEM_PROMPT = `You are annotating Q&A pairs from a personal research archive with confidence levels.

Confidence levels:
- "speculative": hypothesis with little support, might be wrong, tentative claim
- "working": plausible and being used, but not firmly established or tested
- "confident": well-supported by reasoning or evidence; the researcher treats this as reliable
- "validated": empirically confirmed or cross-validated across multiple independent sources

For each Q&A entry, return a JSON array element with:
- "id": the exact id string provided
- "confidence": one of the four levels above
- "rationale": one sentence (max 20 words) explaining the rating, grounded in the content

Respond with ONLY a valid JSON array. No markdown, no prose, no explanation outside the array.`

function buildBatchPrompt(pairs: QAPairData[]): string {
  const entries = pairs
    .map(
      (p, i) =>
        `[${i + 1}] id: ${p.id}\nTitle: ${p.title}\nQuestion: ${p.question.slice(0, 400)}\nAnswer: ${p.answer.slice(0, 600)}`,
    )
    .join('\n\n---\n\n')

  return `Annotate the following ${pairs.length} Q&A entries:\n\n${entries}`
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/**
 * Generate confidence annotation proposals for all QAs (or a subset).
 * Processes in batches of BATCH_SIZE to avoid token limits.
 */
export async function generateAnnotations(ids?: string[]): Promise<AnnotationProposal[]> {
  const allPairs = listAllPairs()
  const targets = ids
    ? ids.map((id) => allPairs[id]).filter(Boolean)
    : Object.values(allPairs)

  if (targets.length === 0) return []

  debugLog('annotationService', `generating annotations for ${targets.length} QAs`)

  const provider = getProvider()
  const proposals: AnnotationProposal[] = []
  const batches = chunk(targets, BATCH_SIZE)

  for (const batch of batches) {
    const prompt = buildBatchPrompt(batch)
    const raw = await provider.complete(prompt, SYSTEM_PROMPT)

    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: Array<{ id: string; confidence: string; rationale: string }>
    try {
      parsed = JSON.parse(cleaned)
    } catch (err) {
      debugError('annotationService', 'Failed to parse batch response:', cleaned.slice(0, 300), err)
      // Skip failed batch rather than aborting everything
      continue
    }

    for (const item of parsed) {
      const pair = allPairs[item.id]
      if (!pair) continue

      const confidence = item.confidence as ConfidenceLevel
      const valid: ConfidenceLevel[] = ['speculative', 'working', 'confident', 'validated']
      if (!valid.includes(confidence)) continue

      proposals.push({
        id: item.id,
        title: pair.title,
        currentConfidence: pair.aiConfidence,
        proposedConfidence: confidence,
        rationale: item.rationale ?? '',
      })
    }
  }

  debugLog('annotationService', `generated ${proposals.length} proposals`)
  return proposals
}

/**
 * Apply a set of approved annotations back to QA frontmatter.
 */
export async function applyAnnotations(
  approved: Array<{ id: string; confidence: ConfidenceLevel }>,
): Promise<void> {
  debugLog('annotationService', `applying ${approved.length} annotations`)
  for (const { id, confidence } of approved) {
    updatePair(id, { aiConfidence: confidence })
  }
}
