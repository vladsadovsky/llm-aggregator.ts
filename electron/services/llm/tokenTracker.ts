export interface TokenStats {
  llm: { input: number; output: number }
  embeddings: { input: number }
}

const stats: TokenStats = {
  llm: { input: 0, output: 0 },
  embeddings: { input: 0 },
}

export function addLlmTokens(input: number, output: number): void {
  stats.llm.input += input
  stats.llm.output += output
}

export function addEmbeddingTokens(input: number): void {
  stats.embeddings.input += input
}

export function getTokenStats(): TokenStats {
  return {
    llm: { ...stats.llm },
    embeddings: { ...stats.embeddings },
  }
}

export function resetTokenStats(): void {
  stats.llm.input = 0
  stats.llm.output = 0
  stats.embeddings.input = 0
}
