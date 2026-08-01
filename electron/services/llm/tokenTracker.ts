/**
 * Backwards-compatible token-stats facade over the session usage ledger
 * (Phase 0.7). The IPC `ai:getTokenStats` shape is preserved, but the numbers now
 * come from the single ledger sink so every call is counted in one place.
 */
import { getSessionUsage, resetUsage } from './usageLedger'

export interface TokenStats {
  llm: { input: number; output: number }
  embeddings: { input: number }
}

export function getTokenStats(): TokenStats {
  const usage = getSessionUsage()
  const stats: TokenStats = { llm: { input: 0, output: 0 }, embeddings: { input: 0 } }
  for (const e of usage.entries) {
    if (e.capability === 'complete') {
      stats.llm.input += e.inputTokens
      stats.llm.output += e.outputTokens
    } else {
      stats.embeddings.input += e.inputTokens
    }
  }
  return stats
}

export function resetTokenStats(): void {
  resetUsage()
}
