/**
 * import/archive/parsers/copilotCsv.ts
 * Pure: Microsoft Copilot activity-history CSV → ParsedConversation[].
 *
 * Shape (verified against a real export, July 2026), from the Microsoft privacy
 * dashboard → Copilot → Export all activity history:
 *
 *   Conversation,Time,Author,Message
 *   "Git Flag Explained",2026-07-26T23:20:56,AI,"**Short answer:** …"
 *   "Git Flag Explained",2026-07-26T23:20:56,Human,"what does --no-git-tag-version do?"
 *
 * Unlike Google Takeout this export *is* threaded: the `Conversation` column
 * carries the conversation title, so real threads can be reconstructed rather
 * than grouped by day. Message bodies are full Markdown.
 *
 * Two ordering facts drive the implementation:
 *
 * 1. **Rows are newest-first**, globally and within a conversation.
 * 2. **The AI row and its Human prompt share an identical timestamp** — 1290 of
 *    2613 rows in a real export tie with a sibling. Sorting by time is therefore
 *    ambiguous *and wrong*: a stable ascending sort keeps the file's AI-before-
 *    Human order within each tie. The rows must be **reversed**, not sorted.
 *
 * There are no message or conversation ids, so dedup keys use the conversation
 * title plus the timestamp and a hash of the message text.
 */

import type { ParsedConversation, ParsedMessage } from '../../types'

/** Header the export always starts with; also the format's signature. */
const EXPECTED_HEADER = ['conversation', 'time', 'author', 'message']

/** Non-crypto, deterministic string hash (djb2) — keeps this module dependency-free. */
function shortHash(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

/**
 * Minimal RFC 4180 reader. Message bodies are multi-line Markdown containing
 * commas, quotes, and blank lines, so a line-based split is not an option.
 */
export function parseCsvRows(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '') // strip the BOM Microsoft writes
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"' // escaped quote
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\r') {
      // Row separators are CRLF; embedded newlines inside fields are LF.
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/** Structural check used by the format registry. */
export function looksLikeCopilotCsv(text: string): boolean {
  // Only read as far as the first row — the file is multi-megabyte.
  const firstBreak = text.indexOf('\n')
  const headerLine = (firstBreak === -1 ? text : text.slice(0, firstBreak)).replace(/^\uFEFF/, '')
  const header = parseCsvRows(headerLine)[0]
  if (!header || header.length < EXPECTED_HEADER.length) return false
  return EXPECTED_HEADER.every((name, i) => header[i]?.trim().toLowerCase() === name)
}

/** ISO to whole seconds; '' when unparseable. The export omits a timezone. */
function normalizeTime(raw: string): { instant: string; iso: string } {
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return { instant: raw.trim(), iso: '' }
  const iso = new Date(parsed).toISOString()
  return { instant: `${iso.slice(0, 19)}Z`, iso }
}

interface CsvRecord {
  role: 'user' | 'assistant'
  text: string
  instant: string
  iso: string
}

/**
 * Parse the export into one ParsedConversation per `Conversation` title,
 * conversations in first-seen (newest-first) file order, messages within each
 * restored to chronological order.
 */
export function parseCopilotCsv(text: string): ParsedConversation[] {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []

  const grouped = new Map<string, CsvRecord[]>()
  let skipped = 0

  // Row 0 is the header.
  for (const row of rows.slice(1)) {
    if (row.length < 4) {
      skipped += 1
      continue
    }
    const [title, time, author, message] = row
    const role = author === 'AI' ? 'assistant' : author === 'Human' ? 'user' : null
    if (!role || !message.trim()) {
      skipped += 1
      continue
    }
    const key = title.trim() || '(untitled conversation)'
    const { instant, iso } = normalizeTime(time)
    const list = grouped.get(key) ?? []
    list.push({ role, text: message.trim(), instant, iso })
    grouped.set(key, list)
  }

  const conversations: ParsedConversation[] = []
  for (const [title, records] of grouped) {
    // Reverse rather than sort: siblings share a timestamp, so sorting would
    // leave the AI reply ahead of the prompt that produced it.
    const ordered = [...records].reverse()

    const messages: ParsedMessage[] = ordered.map((record) => ({
      role: record.role,
      text: record.text,
      // No ids in the export; the message hash disambiguates tied timestamps.
      id: `${record.instant}#${shortHash(record.text)}`,
    }))

    const warnings: string[] = []
    if (title === '(untitled conversation)') {
      warnings.push('These messages had no conversation title in the export and were grouped together.')
    }

    conversations.push({
      provider: 'copilot',
      url: '',
      title: title === '(untitled conversation)' ? '' : title,
      model: '',
      messages,
      warnings,
      // No conversation id exists; the title is the only stable handle.
      sourceId: `csv:${shortHash(title)}`,
      createdAt: ordered[0]?.iso ?? '',
    })
  }

  if (skipped > 0 && conversations.length > 0) {
    conversations[0].warnings.push(`Skipped ${skipped} row(s) with an unrecognized author or empty message.`)
  }

  return conversations
}
