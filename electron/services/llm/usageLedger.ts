/**
 * Centralized session usage ledger (Phase 0.7, `INV-COST`).
 *
 * One sink for every completion/embedding call: call counts and token totals
 * keyed by capability + provider + model + local/remote, plus an approximate
 * cost when pricing is known. It records NO prompt/response text, QA ids, URLs,
 * or secrets. Cost is explicit about uncertainty — unknown/stale pricing yields
 * "cost unavailable" rather than an invented number.
 *
 * Session-scoped: reset on app restart and via the existing reset action.
 */

export type UsageCapability = 'complete' | 'embed'

export interface UsageEvent {
  capability: UsageCapability
  provider: string
  model: string
  /** True for a local (loopback) provider; its monetary cost defaults to zero. */
  local?: boolean
  inputTokens?: number
  outputTokens?: number
}

export interface UsageEntry {
  capability: UsageCapability
  provider: string
  model: string
  local: boolean
  calls: number
  inputTokens: number
  outputTokens: number
  /** Approximate USD cost, or null when pricing is unknown. */
  approxCostUsd: number | null
}

export interface SessionUsage {
  entries: UsageEntry[]
  totals: { calls: number; inputTokens: number; outputTokens: number }
  cost: {
    /** Sum of known costs. */
    approxUsd: number
    /** True when every entry had known pricing (so approxUsd is the whole story). */
    complete: boolean
  }
  pricingSource: string
  pricingEffectiveDate: string
}

interface ModelPrice {
  inputPer1M: number
  outputPer1M: number
}

// Approximate public list prices, USD per 1M tokens. Marked with a source/date so
// staleness is visible; an unlisted model yields "cost unavailable" rather than a
// guess. Update deliberately, not silently.
const PRICING_SOURCE = 'public list pricing'
const PRICING_EFFECTIVE_DATE = '2026-07'
const PRICE_TABLE: Record<string, ModelPrice> = {
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'text-embedding-3-small': { inputPer1M: 0.02, outputPer1M: 0 },
  'text-embedding-3-large': { inputPer1M: 0.13, outputPer1M: 0 },
}

function bucketKey(e: { capability: string; provider: string; model: string }): string {
  return `${e.capability}|${e.provider}|${e.model}`
}

const buckets = new Map<string, UsageEntry>()

/** Record one physical call. Called from the provider adapters, once per request. */
export function recordUsage(event: UsageEvent): void {
  const key = bucketKey(event)
  const existing = buckets.get(key)
  const inputTokens = Math.max(0, Math.floor(event.inputTokens ?? 0))
  const outputTokens = Math.max(0, Math.floor(event.outputTokens ?? 0))
  const entry: UsageEntry = existing ?? {
    capability: event.capability,
    provider: event.provider,
    model: event.model,
    local: event.local === true,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    approxCostUsd: 0,
  }
  entry.calls += 1
  entry.inputTokens += inputTokens
  entry.outputTokens += outputTokens
  entry.approxCostUsd = priceFor(entry)
  buckets.set(key, entry)
}

/** Approximate cost for an entry, or null when the model has no known price. */
function priceFor(entry: UsageEntry): number | null {
  if (entry.local) return 0
  const price = PRICE_TABLE[entry.model]
  if (!price) return null
  return (entry.inputTokens / 1_000_000) * price.inputPer1M + (entry.outputTokens / 1_000_000) * price.outputPer1M
}

export function getSessionUsage(): SessionUsage {
  const entries = [...buckets.values()].map((e) => ({ ...e }))
  const totals = entries.reduce(
    (acc, e) => ({
      calls: acc.calls + e.calls,
      inputTokens: acc.inputTokens + e.inputTokens,
      outputTokens: acc.outputTokens + e.outputTokens,
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0 },
  )
  let approxUsd = 0
  let complete = true
  for (const e of entries) {
    if (e.approxCostUsd === null) complete = false
    else approxUsd += e.approxCostUsd
  }
  return {
    entries,
    totals,
    cost: { approxUsd, complete },
    pricingSource: PRICING_SOURCE,
    pricingEffectiveDate: PRICING_EFFECTIVE_DATE,
  }
}

export function resetUsage(): void {
  buckets.clear()
}

/**
 * Estimate cost/tokens for a batch before running, so a caller can warn/confirm
 * above a threshold. `avgInputTokens`/`avgOutputTokens` are caller estimates.
 */
export function estimateBatchCost(
  model: string,
  local: boolean,
  calls: number,
  avgInputTokens: number,
  avgOutputTokens: number,
): { calls: number; inputTokens: number; outputTokens: number; approxCostUsd: number | null } {
  const inputTokens = Math.max(0, Math.round(calls * avgInputTokens))
  const outputTokens = Math.max(0, Math.round(calls * avgOutputTokens))
  if (local) return { calls, inputTokens, outputTokens, approxCostUsd: 0 }
  const price = PRICE_TABLE[model]
  const approxCostUsd = price
    ? (inputTokens / 1_000_000) * price.inputPer1M + (outputTokens / 1_000_000) * price.outputPer1M
    : null
  return { calls, inputTokens, outputTokens, approxCostUsd }
}
