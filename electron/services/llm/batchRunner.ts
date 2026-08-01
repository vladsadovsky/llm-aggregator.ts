/**
 * Generic bounded batch-LLM job runner (Phase 0.2).
 *
 * Read-only generation: chunks targets, checks cancellation before each batch,
 * calls a capability-specific (already-metered) completion provider, strips only
 * known fence wrappers, validates the response through the job's parser, rejects
 * duplicate/unknown ids, and collects per-item errors without trusting model
 * text. Generation writes nothing. Application is a separate command that rechecks
 * each target is unchanged (a content hash) and skips stale ones.
 *
 * Provider is injected so the runner is unit-testable with a fake.
 */
import { createHash } from 'crypto'
import type { CompletionProvider } from './types'

export interface BatchItem {
  id: string
  /** Formatted content for the prompt. */
  content: string
  /** Hash of the source content at generation time; rechecked before apply. */
  contentHash: string
}

export interface BatchProgress {
  processed: number
  total: number
  batchesDone: number
  batchesTotal: number
}

export interface BatchError {
  scope: string
  message: string
}

export interface BatchResult<TProposal> {
  proposals: TProposal[]
  errors: BatchError[]
  cancelled: boolean
}

export interface BatchJobSpec<TProposal> {
  batchSize: number
  systemPrompt: string
  buildPrompt(items: BatchItem[]): string
  /** Parse+validate raw model text into per-id records. Throw to reject the batch. */
  parseResponse(text: string): Array<{ id: string } & Record<string, unknown>>
  /** Map a validated record (matched to its source item) to a proposal, or null to drop. */
  toProposal(record: { id: string } & Record<string, unknown>, item: BatchItem): TProposal | null
}

export interface RunOptions {
  signal?: AbortSignal
  onProgress?: (p: BatchProgress) => void
}

/** SHA-256 hash of source content, used for the staleness check on apply. */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/** Strip a single leading/trailing markdown code fence, if present. */
export function stripJsonFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += Math.max(1, size)) out.push(arr.slice(i, i + size))
  return out
}

const yieldToLoop = () => new Promise<void>((r) => setImmediate(r))

export async function runBatchJob<TProposal>(
  spec: BatchJobSpec<TProposal>,
  items: BatchItem[],
  provider: CompletionProvider,
  options: RunOptions = {},
): Promise<BatchResult<TProposal>> {
  const proposals: TProposal[] = []
  const errors: BatchError[] = []
  const batches = chunk(items, spec.batchSize)
  let processed = 0
  let cancelled = false

  for (let b = 0; b < batches.length; b += 1) {
    if (options.signal?.aborted) {
      cancelled = true
      break
    }
    const batch = batches[b]
    const byId = new Map(batch.map((it) => [it.id, it]))

    let text: string
    try {
      text = await provider.complete(spec.buildPrompt(batch), spec.systemPrompt)
    } catch (err) {
      errors.push({ scope: `batch ${b + 1}`, message: err instanceof Error ? err.message : 'provider failed' })
      processed += batch.length
      options.onProgress?.({ processed, total: items.length, batchesDone: b + 1, batchesTotal: batches.length })
      continue
    }

    let records: Array<{ id: string } & Record<string, unknown>>
    try {
      records = spec.parseResponse(stripJsonFences(text))
    } catch {
      errors.push({ scope: `batch ${b + 1}`, message: 'unparseable or invalid response' })
      processed += batch.length
      options.onProgress?.({ processed, total: items.length, batchesDone: b + 1, batchesTotal: batches.length })
      continue
    }

    const seen = new Set<string>()
    for (const record of records) {
      const item = byId.get(record.id)
      if (!item) {
        errors.push({ scope: record.id, message: 'unknown-id' })
        continue
      }
      if (seen.has(record.id)) {
        errors.push({ scope: record.id, message: 'duplicate-id' })
        continue
      }
      seen.add(record.id)
      const proposal = spec.toProposal(record, item)
      if (proposal !== null) proposals.push(proposal)
    }

    processed += batch.length
    options.onProgress?.({ processed, total: items.length, batchesDone: b + 1, batchesTotal: batches.length })
    await yieldToLoop()
  }

  return { proposals, errors, cancelled }
}

// ─── Application (separate validated command) ────────────────────────────────

export interface ApplyTarget {
  id: string
  /** The content hash captured when the proposal was generated. */
  expectedHash: string
}

export interface ApplyResult {
  applied: string[]
  skippedStale: string[]
  vanished: string[]
  failed: Array<{ id: string; message: string }>
}

/**
 * Apply approved proposals, but only to targets whose current content still
 * matches the hash captured at generation time. A changed target is skipped as
 * `stale-target`; a vanished one is reported; write failures are per-item.
 */
export function applyBatchProposals(
  targets: ApplyTarget[],
  currentHash: (id: string) => string | null,
  apply: (id: string) => void,
): ApplyResult {
  const result: ApplyResult = { applied: [], skippedStale: [], vanished: [], failed: [] }
  for (const { id, expectedHash } of targets) {
    const cur = currentHash(id)
    if (cur === null) {
      result.vanished.push(id)
      continue
    }
    if (cur !== expectedHash) {
      result.skippedStale.push(id)
      continue
    }
    try {
      apply(id)
      result.applied.push(id)
    } catch (err) {
      result.failed.push({ id, message: err instanceof Error ? err.message : 'apply failed' })
    }
  }
  return result
}
