/**
 * LLM provider capability interfaces (`INV-LLM`).
 *
 * The old universal `LLMProvider` forced every provider to implement both
 * completion and embedding, so requesting an embedding from a completion-only
 * provider (Anthropic) failed at runtime inside `embed()`. Capabilities are now
 * split: code asks the factory for exactly the capability it needs, and the
 * factory validates the selected provider declares it *before* any network call.
 */

export interface TestableProvider {
  /**
   * Make a minimal API call to verify the key is valid.
   * Throws if the connection fails.
   */
  testConnection(): Promise<void>
}

export interface LlmCallOptions {
  /** Optional abort signal from a suggestion/job controller. */
  signal?: AbortSignal
}

export interface CompletionProvider extends TestableProvider {
  /** Send a prompt and return the text response. */
  complete(userPrompt: string, systemPrompt: string, options?: LlmCallOptions): Promise<string>
}

export interface EmbeddingProvider extends TestableProvider {
  /** Generate an embedding vector for the given text. */
  embed(text: string, options?: LlmCallOptions): Promise<number[]>
}

/**
 * Concrete providers may implement both capabilities. Retained for the existing
 * OpenAI/Anthropic classes; new adapters should implement only the capability
 * interfaces they actually support.
 */
export interface LLMProvider extends CompletionProvider, EmbeddingProvider {}
