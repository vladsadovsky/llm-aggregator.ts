export interface LLMProvider {
  /**
   * Send a prompt and return the text response.
   */
  complete(userPrompt: string, systemPrompt: string): Promise<string>

  /**
   * Generate an embedding vector for the given text.
   */
  embed(text: string): Promise<number[]>

  /**
   * Make a minimal API call to verify the key is valid.
   * Throws if the connection fails.
   */
  testConnection(): Promise<void>
}
