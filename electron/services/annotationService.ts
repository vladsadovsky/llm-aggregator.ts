import { z } from 'zod'
import { getCompletionProvider } from './llm/providerFactory'
import { listAllPairs, updatePair } from './qaPairService'
import { runBatchJob, type BatchItem, type BatchJobSpec } from './llm/batchRunner'
import { debugLog } from './logger'
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
const VALID_LEVELS: ConfidenceLevel[] = ['speculative', 'working', 'confident', 'validated']

/** Strict per-record schema for the model output (rejects wrong shapes). */
const AnnotationRecordSchema = z
  .object({ id: z.string(), confidence: z.string(), rationale: z.string().optional() })
  .passthrough()

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

function formatPairContent(p: QAPairData): string {
  return `id: ${p.id}\nTitle: ${p.title}\nQuestion: ${p.question.slice(0, 400)}\nAnswer: ${p.answer.slice(0, 600)}`
}

/**
 * Generate confidence annotation proposals for all QAs (or a subset), through the
 * generic batch runner: read-only, cancellable, metered, and validated. A failed
 * batch is skipped rather than aborting the whole pass.
 */
export async function generateAnnotations(
  ids?: string[],
  signal?: AbortSignal,
): Promise<AnnotationProposal[]> {
  const allPairs = listAllPairs()
  const targets = ids ? ids.map((id) => allPairs[id]).filter(Boolean) : Object.values(allPairs)
  if (targets.length === 0) return []

  debugLog('annotationService', `generating annotations for ${targets.length} QAs`)

  const items: BatchItem[] = targets.map((p) => ({
    id: p.id,
    content: formatPairContent(p),
    contentHash: '', // annotation apply goes through the legacy IPC; hash unused here
  }))

  const spec: BatchJobSpec<AnnotationProposal> = {
    batchSize: BATCH_SIZE,
    systemPrompt: SYSTEM_PROMPT,
    buildPrompt: (batch) =>
      `Annotate the following ${batch.length} Q&A entries:\n\n${batch
        .map((it, i) => `[${i + 1}] ${it.content}`)
        .join('\n\n---\n\n')}`,
    parseResponse: (text) => z.array(AnnotationRecordSchema).parse(JSON.parse(text)),
    toProposal: (record, item) => {
      const pair = allPairs[item.id]
      const confidence = record.confidence as ConfidenceLevel
      if (!pair || !VALID_LEVELS.includes(confidence)) return null
      return {
        id: item.id,
        title: pair.title,
        currentConfidence: pair.aiConfidence,
        proposedConfidence: confidence,
        rationale: typeof record.rationale === 'string' ? record.rationale : '',
      }
    },
  }

  const result = await runBatchJob(spec, items, getCompletionProvider(), { signal })
  debugLog('annotationService', `generated ${result.proposals.length} proposals`)
  return result.proposals
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
