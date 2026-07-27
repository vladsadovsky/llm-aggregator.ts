/**
 * import/types.ts
 * Shared types for the shared-link conversation importer.
 * Pure — no Electron / filesystem dependencies, so these can be used from
 * both the parsing layer (unit-tested under Node) and the transport layer.
 */

import type { QACreateData } from '../qaPairService'

export type ProviderId = 'chatgpt' | 'gemini' | 'copilot' | 'claude'

export interface ParsedMessage {
  role: 'user' | 'assistant'
  text: string
  /**
   * Provider-side stable identifier for this message (a message uuid), when the
   * payload carries one. Used to build dedup keys — see `originId` below.
   */
  id?: string
  /**
   * When the provider says this message was sent (ISO). Absent when the payload
   * carries no per-message time. Imported pairs are timestamped from this rather
   * than from the moment of import, so an archived conversation keeps its real
   * date — see `SharedImportQA.data.timestamp`.
   */
  createdAt?: string
}

/** Normalized shape every provider parser produces. */
export interface ParsedConversation {
  provider: ProviderId
  url: string
  /** Conversation title as found on the page. '' when none could be detected. */
  title: string
  /** Model / chatbot label, e.g. "Gemini 3.6 Flash", "gpt-5". '' when unknown. */
  model: string
  messages: ParsedMessage[]
  /** Provider-level anomalies surfaced to the user. */
  warnings: string[]
  /** Provider-side conversation id (uuid), when known. Part of the dedup key. */
  sourceId?: string
  /** Conversation creation time as reported by the provider (ISO). '' when unknown. */
  createdAt?: string
}

/** One QA pair ready for creation, plus any per-pair anomalies. */
export interface SharedImportQA {
  data: QACreateData
  warnings: string[]
  /**
   * Stable cross-import identity: `<provider>:<conversationId>:<firstMessageId>`.
   * Persisted to QA frontmatter as `origin_id` so a re-import of the same
   * conversation is recognized instead of duplicated. Undefined when the
   * provider payload carries no usable ids.
   */
  originId?: string
}

/** Result returned to the renderer, which creates the pairs + thread. */
export interface SharedImportResult {
  provider: ProviderId
  url: string
  /** Display label for the model / chatbot (never empty; falls back to provider name). */
  model: string
  /** Suggested thread name (either the detected title or a derived one). */
  threadName: string
  /** True when no real title was found and threadName was auto-derived — the UI reminds the user to rename. */
  titleWasDerived: boolean
  /** Tags applied to both the thread and every imported QA (provider + model). */
  tags: string[]
  items: SharedImportQA[]
  /** File / conversation-level warnings. */
  warnings: string[]
  /** Earliest message time in the conversation (ISO), '' when the payload has none. */
  createdAt: string
  /** Latest message time in the conversation (ISO), '' when the payload has none. */
  updatedAt: string
}
