/**
 * import/htmlToMarkdown.ts
 * Rendered-HTML → Markdown conversion (Turndown + GFM).
 *
 * Used by the Gemini importer: Gemini share pages only expose rendered HTML
 * (no source markdown), so we convert the answer HTML back to Markdown to
 * preserve headings, lists, tables, and fenced code blocks. ChatGPT/Copilot
 * keep their original markdown and don't go through here.
 *
 * Deterministic and dependency-only (Turndown bundles its own DOM), so this is
 * safe to call from the otherwise-pure parser layer and to unit-test in Node.
 */

import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

let service: TurndownService | null = null

function getService(): TurndownService {
  if (service) return service
  const s = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    hr: '---',
  })
  s.use(gfm) // tables, strikethrough, task lists, fenced code with language
  service = s
  return s
}

/** Convert an HTML fragment to Markdown. Returns '' on empty/invalid input. */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return ''
  try {
    return getService().turndown(html).trim()
  } catch {
    return ''
  }
}
