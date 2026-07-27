/**
 * import/archive/parsers/geminiTakeout.ts
 * Pure: Google Takeout "Gemini Apps" activity → ParsedConversation[].
 *
 * Takeout offers **two variants** of the same data and users get whichever they
 * picked at export time. Both are handled here and produce identical output:
 *
 *  - `MyActivity.json` (preferred): an array of activity records
 *      { header: "Gemini Apps", title: "Prompted …", time: "<ISO>",
 *        safeHtmlItem: [{ html }], products, subtitles, … }
 *  - `MyActivity.html`: the same records as Material-Design `outer-cell` blocks,
 *      `Prompted &lt;prompt&gt;<br>&lt;timestamp&gt;<br>&lt;response HTML&gt;`
 *
 * Three structural facts drive the design (all verified against a real export
 * of 875 records — the JSON and HTML variants agree exactly):
 *
 * 1. **There is no conversation grouping.** Takeout exports an activity log, not
 *    threads: every record is a standalone prompt + response and nothing links a
 *    follow-up to what preceded it. Records are grouped by **UTC calendar day**,
 *    a stand-in for threads, not a reconstruction of them.
 *
 * 2. **Not every record is a conversation.** Of 875 records only 822 are
 *    prompt-like (`Prompted` / `Branched` / `Answered`); the rest are `Created`
 *    (Canvas), `Used`, `Added`, and `Gave` (feedback) with no response body.
 *
 * 3. **Timestamps are not unique** — 13 collisions in the JSON variant, 28 in
 *    the HTML one — so dedup keys mix the timestamp with a hash of the prompt.
 *
 * Keys are normalized to whole seconds so that importing the JSON export and the
 * HTML export of the same history de-duplicates against itself: the JSON carries
 * milliseconds and the HTML does not.
 */

import type { ParsedConversation, ParsedMessage } from '../../types'
import { htmlToMarkdown } from '../../htmlToMarkdown'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Activity verbs that introduce a real prompt + response pair. */
const PROMPT_VERBS = ['Prompted', 'Branched', 'Answered']
const VERB_RE = new RegExp(`^(?:${PROMPT_VERBS.join('|')})\\s+`)

/** The product name Takeout stamps on Gemini records. */
const GEMINI_HEADER = 'Gemini Apps'

/**
 * HTML variant: one record's body cell, split into verb / prompt / timestamp /
 * response. The timestamp anchors the split because a prompt may itself contain
 * `<br>`, so counting breaks is not safe.
 */
const HTML_RECORD_RE = new RegExp(
  'mdl-typography--body-1">' +
    `(?:${PROMPT_VERBS.join('|')})\\s+` +
    '([\\s\\S]*?)<br>\\s*' +
    '([A-Z][a-z]{2}\\s+\\d{1,2},\\s+\\d{4},\\s+[\\d:]+\\s*[AP]M(?:\\s*[A-Z]{2,5})?)' +
    '<br>([\\s\\S]*?)</div>',
)

/** Non-crypto, deterministic string hash (djb2) — keeps this module dependency-free. */
function shortHash(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

/** Strip tags and decode the handful of entities Takeout emits. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&emsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * A record normalized away from either source variant.
 * `instant` is the dedup anchor: ISO truncated to whole seconds, so the JSON
 * variant (which has milliseconds) and the HTML variant agree.
 */
interface TakeoutRecord {
  prompt: string
  answerMarkdown: string
  /** ISO to whole seconds, e.g. 2026-07-26T06:07:57Z. '' when unparseable. */
  instant: string
  /** Grouping key: UTC day, or the literal date text when the time cannot be parsed. */
  day: string
  /** Full ISO including milliseconds where available, for `createdAt`. */
  isoExact: string
}

interface ExtractResult {
  records: TakeoutRecord[]
  /** Activity records that are not conversations at all (Canvas, uploads, feedback). */
  skipped: number
  /** Prompt-like records whose prompt text was empty — typically image-only prompts. */
  promptless: number
}

/** ISO → { instant, day }, both '' when unparseable. */
function normalizeInstant(raw: string): { instant: string; day: string; isoExact: string } {
  const parsed = Date.parse(raw)
  const usable = Number.isNaN(parsed) ? Date.parse(raw.replace(/\s+[A-Z]{2,5}$/, '')) : parsed
  if (Number.isNaN(usable)) return { instant: '', day: '', isoExact: '' }
  const date = new Date(usable)
  const isoExact = date.toISOString()
  return {
    // Drop milliseconds so both export variants produce the same key.
    instant: `${isoExact.slice(0, 19)}Z`,
    day: isoExact.slice(0, 10),
    isoExact,
  }
}

// ─── variant detection ────────────────────────────────────────────────────────

/** JSON variant: an array of activity records whose header names Gemini Apps. */
export function looksLikeGeminiTakeoutJson(text: string): boolean {
  const json = safeJson(text)
  if (!Array.isArray(json) || json.length === 0) return false
  // Other Takeout products (YouTube, Chrome, Search…) ship the same filename and
  // envelope, so the product name is what distinguishes them.
  return json.some(
    (r: any) =>
      r !== null &&
      typeof r === 'object' &&
      (r.header === GEMINI_HEADER ||
        (Array.isArray(r.products) && r.products.includes(GEMINI_HEADER))),
  )
}

/**
 * HTML variant: the Material-Design activity page for Gemini Apps.
 *
 * Takeout writes one HTML page per product, all named `MyActivity.html`, so the
 * product must be read out of the header cell and compared exactly — a loose
 * substring test would accept a YouTube page that merely mentions Gemini.
 */
export function looksLikeGeminiTakeoutHtml(text: string): boolean {
  if (!/outer-cell/.test(text)) return false
  const header = text.match(/class="header-cell[^"]*"[^>]*>\s*<p[^>]*>([^<]*)</)
  return header !== null && header[1].trim() === GEMINI_HEADER
}

/** True for either variant — used by the format registry. */
export function looksLikeGeminiTakeout(text: string): boolean {
  return looksLikeGeminiTakeoutJson(text) || looksLikeGeminiTakeoutHtml(text)
}

// ─── record extraction ────────────────────────────────────────────────────────

function extractJsonRecords(json: any[]): ExtractResult {
  const records: TakeoutRecord[] = []
  let skipped = 0
  let promptless = 0

  for (const entry of json) {
    const title = typeof entry?.title === 'string' ? entry.title : ''
    if (!VERB_RE.test(title)) {
      skipped += 1
      continue
    }
    const prompt = title.replace(VERB_RE, '').trim()
    if (!prompt) {
      // Image-only prompts: the JSON variant records the verb with no text.
      promptless += 1
      continue
    }
    // A handful of records carry several html items; join rather than take [0].
    const html = (Array.isArray(entry?.safeHtmlItem) ? entry.safeHtmlItem : [])
      .map((item: any) => (typeof item?.html === 'string' ? item.html : ''))
      .filter(Boolean)
      .join('\n')

    const { instant, day, isoExact } = normalizeInstant(String(entry?.time ?? ''))
    records.push({
      prompt,
      answerMarkdown: htmlToMarkdown(html),
      instant,
      day: day || 'unknown date',
      isoExact,
    })
  }

  return { records, skipped, promptless }
}

function extractHtmlRecords(html: string): ExtractResult {
  // Splitting beats a global regex here: each block is bounded and self-contained.
  const blocks = html.split('<div class="outer-cell').slice(1)
  const records: TakeoutRecord[] = []
  let skipped = 0
  let promptless = 0

  for (const block of blocks) {
    const match = block.match(HTML_RECORD_RE)
    if (!match) {
      skipped += 1
      continue
    }
    const [, promptHtml, timestamp, responseHtml] = match
    const prompt = htmlToPlainText(promptHtml)
    if (!prompt) {
      promptless += 1
      continue
    }
    const { instant, day, isoExact } = normalizeInstant(timestamp)
    records.push({
      prompt,
      answerMarkdown: htmlToMarkdown(responseHtml),
      instant: instant || timestamp,
      // Fall back to the literal date text if the zone abbreviation defeated Date.parse.
      day: day || timestamp.replace(/,\s+[\d:]+\s*[AP]M.*$/, ''),
      isoExact,
    })
  }

  return { records, skipped, promptless }
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Parse either Takeout variant into one ParsedConversation per calendar day,
 * days in first-seen order, records within a day in export order.
 */
export function parseGeminiTakeout(text: string): ParsedConversation[] {
  const json = safeJson(text)
  const { records, skipped, promptless } = Array.isArray(json)
    ? extractJsonRecords(json)
    : extractHtmlRecords(text)

  if (records.length === 0) return []

  const byDay = new Map<string, TakeoutRecord[]>()
  for (const record of records) {
    const list = byDay.get(record.day) ?? []
    list.push(record)
    byDay.set(record.day, list)
  }

  const conversations: ParsedConversation[] = []
  for (const [day, dayRecords] of byDay) {
    const messages: ParsedMessage[] = []
    for (const record of dayRecords) {
      // Timestamps alone collide, so mix in the prompt.
      const id = `${record.instant}#${shortHash(record.prompt)}`
      messages.push({ role: 'user', text: record.prompt, id })
      messages.push({ role: 'assistant', text: record.answerMarkdown, id })
    }

    const warnings: string[] = []
    const emptyAnswers = dayRecords.filter((r) => !r.answerMarkdown).length
    if (emptyAnswers > 0) {
      warnings.push(`${emptyAnswers} record(s) on this day had no response text.`)
    }

    // No real conversation title exists for a Takeout day-bucket — leave it
    // blank so buildResult() derives the name from the first prompt, same as
    // every other provider's untitled-conversation fallback.
    conversations.push({
      provider: 'gemini',
      url: '',
      title: '',
      model: '',
      messages,
      warnings,
      sourceId: `takeout:${day}`,
      createdAt: dayRecords[0].isoExact,
    })
  }

  if (conversations.length > 0) {
    if (skipped > 0) {
      conversations[0].warnings.push(
        `Skipped ${skipped} non-conversation activity record(s) (Canvas, uploads, feedback).`,
      )
    }
    if (promptless > 0) {
      conversations[0].warnings.push(
        `Skipped ${promptless} record(s) with no prompt text — these are usually image-only prompts, ` +
          'which Takeout records without a question.',
      )
    }
  }

  return conversations
}
