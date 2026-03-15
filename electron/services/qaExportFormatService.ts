/**
 * qaExportFormatService.ts
 * Pure serialisation: QAPairData / thread → export Markdown string.
 * No filesystem access — keeping format logic separate from transport
 * so future non-file targets (OneNote, clipboard, …) can reuse this module.
 */

import type { QAPairData } from './qaPairService'
import type { ThreadData } from './threadService'

export const SCHEMA_VERSION = 1
export const WRITER_APP = 'llm-aggregator'

// ─── helpers ──────────────────────────────────────────────────────────────────

function appVersion(): string {
  // Resolved at runtime from package.json embedded by Electron build;
  // fall back gracefully so format service remains testable in isolation.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('../../../package.json') as { version: string }).version
  } catch {
    return '0.0.0'
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 50)
}

/** Suggested filename for a single-QA export. */
export function suggestedQAFilename(pair: QAPairData): string {
  const date = new Date().toISOString().slice(0, 10)
  return `${slugify(pair.title || 'qa')}_${date}.md`
}

/** Suggested filename for a thread export. */
export function suggestedThreadFilename(thread: ThreadData): string {
  const date = new Date().toISOString().slice(0, 10)
  return `thread_${slugify(thread.name || 'thread')}_${date}.md`
}

// ─── per-QA block serialisation ───────────────────────────────────────────────

function serializeQABlock(pair: QAPairData): string {
  const tagLine = pair.tags.length > 0 ? pair.tags.join(', ') : ''
  const lines: string[] = []
  lines.push(`title: ${pair.title}`)
  lines.push(`source: ${pair.source}`)
  lines.push(`url: ${pair.url ?? ''}`)
  lines.push(`tags: ${tagLine}`)
  lines.push(`version: ${pair.version}`)
  lines.push(`original_id: ${pair.id}`)
  lines.push(`original_timestamp: ${pair.timestamp}`)
  lines.push('')
  lines.push('## Question')
  lines.push('')
  lines.push(pair.question)
  lines.push('')
  lines.push('## Answer')
  lines.push('')
  lines.push(pair.answer)
  return lines.join('\n')
}

// ─── file header ──────────────────────────────────────────────────────────────

function fileHeader(exportType: 'qa' | 'thread', threadName?: string): string {
  const fields: string[] = [
    `writer_app: ${WRITER_APP}`,
    `writer_version: ${appVersion()}`,
    `schema_version: ${SCHEMA_VERSION}`,
    `exported_at: ${new Date().toISOString()}`,
    `export_type: ${exportType}`,
  ]
  if (exportType === 'thread' && threadName) {
    fields.push(`thread_name: ${threadName}`)
  }
  return `---\n${fields.join('\n')}\n---`
}

// ─── public API ───────────────────────────────────────────────────────────────

/** Serialise a single QA pair to an export Markdown string. */
export function formatQAExport(pair: QAPairData): string {
  const parts: string[] = [fileHeader('qa'), '', serializeQABlock(pair), '']
  return parts.join('\n')
}

/**
 * Serialise a thread and its ordered QA pairs to an export Markdown string.
 * Pairs not found in the provided map are silently skipped.
 */
export function formatThreadExport(
  thread: ThreadData,
  pairMap: Record<string, QAPairData>,
): string {
  const orderedPairs = thread.items
    .map((id) => pairMap[id])
    .filter((p): p is QAPairData => p !== undefined)

  const blocks = orderedPairs.map((p) => serializeQABlock(p))
  const separator = '\n\n---\n\n'
  const parts: string[] = [fileHeader('thread', thread.name), '', blocks.join(separator), '']
  return parts.join('\n')
}
