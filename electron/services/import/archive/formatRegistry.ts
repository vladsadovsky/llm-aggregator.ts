/**
 * import/archive/formatRegistry.ts
 * Pure: recognize an account-export payload and hand back a parser.
 *
 * Detection keys on **structure**, never on filename or extension — three
 * different vendors ship a file literally named `conversations.json` with three
 * unrelated shapes. `matches()` therefore receives the raw text of a candidate
 * entry and decides for itself.
 *
 * Raw text (not pre-parsed JSON) is deliberate: Copilot's consumer export is
 * CSV and Google Takeout can be HTML, so the contract must not assume JSON.
 *
 * Adding a format = one entry here + one pure parser + fixtures. Nothing else
 * in the import pipeline changes.
 */

import type { ParsedConversation, ProviderId } from '../types'
import type { ArchiveFormatId } from './archiveTypes'
import { looksLikeClaudeAccountExport, parseClaudeAccountExport } from './parsers/claudeAccountExport'
import { looksLikeGeminiTakeout, parseGeminiTakeout } from './parsers/geminiTakeout'
import { looksLikeCopilotCsv, parseCopilotCsv } from './parsers/copilotCsv'
import { parseChatGPT } from '../parsers/chatgptParser'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ArchiveFormat {
  id: ArchiveFormatId
  /** Human-readable name shown in the preview dialog. */
  label: string
  provider: ProviderId
  /**
   * Entry basenames (lowercase) worth probing inside a zip / folder, in
   * priority order. Matched by basename so nested layouts (Takeout's
   * `Takeout/My Activity/...`) work the same as flat ones.
   */
  candidateEntries: string[]
  /**
   * Lowercase path fragments worth probing first inside a multi-product archive.
   * Ordering only — correctness comes from `matches`.
   */
  pathHints?: string[]
  /**
   * True when this format has been validated against a real export file.
   * Unvalidated formats still import, but the UI warns first.
   */
  validated: boolean
  /** Cheap structural check on the raw entry text. */
  matches(text: string): boolean
  /** Pure: raw entry text → conversations. */
  parse(text: string): ParsedConversation[]
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** ChatGPT exports are an array of the same conversation-tree shape share links return. */
function looksLikeChatGPTAccountExport(json: unknown): boolean {
  if (!Array.isArray(json) || json.length === 0) return false
  return json.some(
    (c: any) => c !== null && typeof c === 'object' && c.mapping !== null && typeof c.mapping === 'object',
  )
}

function parseChatGPTAccountExport(json: unknown): ParsedConversation[] {
  if (!Array.isArray(json)) return []
  return json
    .filter((c: any) => c && typeof c === 'object' && c.mapping)
    .map((c: any) => {
      const id = (typeof c.conversation_id === 'string' && c.conversation_id) || (typeof c.id === 'string' && c.id) || ''
      // parseChatGPT already reads title / mapping / create_time / conversation_id.
      return parseChatGPT(c, id ? `https://chatgpt.com/c/${id}` : '')
    })
}

export const ARCHIVE_FORMATS: ArchiveFormat[] = [
  {
    id: 'claude-account-export',
    label: 'Claude account export',
    provider: 'claude',
    candidateEntries: ['conversations.json'],
    validated: true,
    matches: (text) => looksLikeClaudeAccountExport(safeJson(text)),
    parse: (text) => parseClaudeAccountExport(safeJson(text)),
  },
  {
    id: 'chatgpt-account-export',
    label: 'ChatGPT account export',
    provider: 'chatgpt',
    candidateEntries: ['conversations.json'],
    // Reuses the share-link tree walker, which is well covered; the *envelope*
    // (array of conversations) has not been checked against a real export yet.
    validated: false,
    matches: (text) => looksLikeChatGPTAccountExport(safeJson(text)),
    parse: (text) => parseChatGPTAccountExport(safeJson(text)),
  },
  {
    id: 'gemini-takeout',
    label: 'Gemini (Google Takeout activity)',
    provider: 'gemini',
    // Takeout offers HTML or JSON; users get whichever they picked at export time.
    candidateEntries: ['myactivity.html', 'myactivity.json'],
    // A Takeout archive holds one MyActivity file per product (YouTube, Chrome,
    // Search…), all identically named — probe the Gemini folder first.
    pathHints: ['gemini apps'],
    validated: true,
    matches: (text) => looksLikeGeminiTakeout(text),
    parse: (text) => parseGeminiTakeout(text),
  },
  {
    id: 'copilot-activity-csv',
    label: 'Copilot activity history (CSV)',
    provider: 'copilot',
    // Downloaded as a bare .csv from the Microsoft privacy dashboard, not a zip,
    // so the name varies — detection is by header row.
    candidateEntries: ['copilot-activity-history.csv'],
    validated: true,
    matches: (text) => looksLikeCopilotCsv(text),
    parse: (text) => parseCopilotCsv(text),
  },
]

/** Every entry basename worth reading when probing an archive. */
export const CANDIDATE_ENTRY_NAMES: string[] = Array.from(
  new Set(ARCHIVE_FORMATS.flatMap((f) => f.candidateEntries)),
)

/** Path fragments to probe first, across all formats. */
export const ALL_PATH_HINTS: string[] = Array.from(
  new Set(ARCHIVE_FORMATS.flatMap((f) => f.pathHints ?? [])),
)

/**
 * Formats we can recognize but cannot yet import. Detecting these lets the app
 * say "Gemini Takeout is not supported yet" instead of "unrecognized file".
 */
export const UNSUPPORTED_HINTS: Array<{ test: (basename: string, text: string) => boolean; message: string }> = [
  {
    // The HTML variant is supported; the JSON variant is not parsed yet.
    test: (basename) => /^myactivity\.json$/i.test(basename),
    message:
      'This looks like the JSON variant of a Google Takeout "My Activity" export. Only the HTML ' +
      'variant is supported today — re-run Takeout and choose HTML for Gemini Apps.',
  },
  {
    test: (basename, text) => /^myactivity\.html$/i.test(basename) && !/Gemini Apps/.test(text),
    message:
      'This is a Google Takeout "My Activity" page, but not for Gemini Apps. Re-run Takeout and ' +
      'select only Gemini under the Takeout product list.',
  },
  {
    // Copilot CSV *is* supported; this only fires for a CSV we cannot read.
    test: (basename) => basename.endsWith('.csv'),
    message:
      'This CSV was not recognized. Copilot history must be the "Export all activity history" file ' +
      'from the Microsoft privacy dashboard, whose first row is: Conversation,Time,Author,Message',
  },
]

/** Pick the first format whose structural check passes. */
export function detectArchiveFormat(text: string): ArchiveFormat | null {
  for (const format of ARCHIVE_FORMATS) {
    try {
      if (format.matches(text)) return format
    } catch {
      // A throwing matcher must never break detection of the other formats.
      continue
    }
  }
  return null
}
