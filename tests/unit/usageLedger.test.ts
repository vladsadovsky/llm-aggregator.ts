/**
 * Phase 0.7 (INV-COST): one metered sink counts every call with model
 * attribution and honest cost — unknown pricing yields "cost unavailable", local
 * providers cost zero, and reset clears only session accounting.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordUsage,
  getSessionUsage,
  resetUsage,
  estimateBatchCost,
} from '../../electron/services/llm/usageLedger'
import { getTokenStats } from '../../electron/services/llm/tokenTracker'

beforeEach(() => resetUsage())

describe('usage ledger', () => {
  it('aggregates calls and tokens per model', () => {
    recordUsage({ capability: 'complete', provider: 'openai', model: 'gpt-4o', inputTokens: 100, outputTokens: 50 })
    recordUsage({ capability: 'complete', provider: 'openai', model: 'gpt-4o', inputTokens: 200, outputTokens: 100 })
    const usage = getSessionUsage()
    expect(usage.totals).toEqual({ calls: 2, inputTokens: 300, outputTokens: 150 })
    expect(usage.entries).toHaveLength(1)
    expect(usage.entries[0].calls).toBe(2)
  })

  it('computes an approximate cost for known pricing', () => {
    recordUsage({ capability: 'complete', provider: 'openai', model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 0 })
    const usage = getSessionUsage()
    expect(usage.entries[0].approxCostUsd).toBeCloseTo(2.5, 5)
    expect(usage.cost.complete).toBe(true)
  })

  it('marks cost unavailable for an unknown model but still counts tokens', () => {
    recordUsage({ capability: 'complete', provider: 'anthropic', model: 'claude-mystery', inputTokens: 500, outputTokens: 500 })
    const usage = getSessionUsage()
    expect(usage.entries[0].approxCostUsd).toBeNull()
    expect(usage.cost.complete).toBe(false)
    expect(usage.totals.inputTokens).toBe(500)
  })

  it('treats local providers as zero cost', () => {
    recordUsage({ capability: 'complete', provider: 'ollama', model: 'llama3', local: true, inputTokens: 1000, outputTokens: 1000 })
    expect(getSessionUsage().entries[0].approxCostUsd).toBe(0)
    expect(getSessionUsage().cost.complete).toBe(true)
  })

  it('separates completion and embedding buckets', () => {
    recordUsage({ capability: 'complete', provider: 'openai', model: 'gpt-4o', inputTokens: 10, outputTokens: 20 })
    recordUsage({ capability: 'embed', provider: 'openai', model: 'text-embedding-3-small', inputTokens: 30 })
    expect(getSessionUsage().entries).toHaveLength(2)
  })

  it('derives the legacy token-stats shape', () => {
    recordUsage({ capability: 'complete', provider: 'openai', model: 'gpt-4o', inputTokens: 10, outputTokens: 20 })
    recordUsage({ capability: 'embed', provider: 'openai', model: 'text-embedding-3-small', inputTokens: 30 })
    expect(getTokenStats()).toEqual({ llm: { input: 10, output: 20 }, embeddings: { input: 30 } })
  })

  it('reset clears session accounting', () => {
    recordUsage({ capability: 'complete', provider: 'openai', model: 'gpt-4o', inputTokens: 10, outputTokens: 20 })
    resetUsage()
    expect(getSessionUsage().totals.calls).toBe(0)
  })

  it('estimateBatchCost projects known and unknown pricing', () => {
    const known = estimateBatchCost('gpt-4o', false, 10, 100, 50)
    expect(known.calls).toBe(10)
    expect(known.approxCostUsd).not.toBeNull()
    const unknown = estimateBatchCost('claude-mystery', false, 10, 100, 50)
    expect(unknown.approxCostUsd).toBeNull()
    const local = estimateBatchCost('llama3', true, 10, 100, 50)
    expect(local.approxCostUsd).toBe(0)
  })
})
