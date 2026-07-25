/**
 * import/parsers/geminiParser.ts
 * Pure: Gemini DOM extract → ParsedConversation.
 *
 * Gemini share pages render the conversation client-side, so the transport
 * layer loads the page in a hidden BrowserWindow and runs GEMINI_EXTRACT_SCRIPT
 * to produce a `GeminiExtract`. This module normalizes that raw extract:
 * strips the visually-hidden "You said" label, drops empty turns, and turns a
 * bare model version ("3.6 Flash") into a full label ("Gemini 3.6 Flash").
 */

import type { ParsedConversation, ParsedMessage } from '../types'
import { htmlToMarkdown } from '../htmlToMarkdown'

export interface GeminiExtract {
  title: string
  model: string
  /** `html` (rendered answer HTML) is present for assistant turns; `text` is always the innerText fallback. */
  messages: Array<{ role: 'user' | 'assistant'; text: string; html?: string }>
}

/**
 * In-page extraction script (runs in the Gemini page context via
 * webContents.executeJavaScript). Returns a plain GeminiExtract object.
 * Assistant answers carry their rendered HTML so the parser can recover
 * Markdown structure (headings, lists, tables, code) that innerText flattens.
 */
export const GEMINI_EXTRACT_SCRIPT = `(() => {
  function cleanHtml(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('button, mat-icon, [role="button"], .code-block-decoration, .buttons-container-v2, .response-footer, .sources-list').forEach((n) => n.remove());
    return c.innerHTML;
  }
  const turns = Array.from(document.querySelectorAll('user-query, response-container'));
  const messages = [];
  for (const el of turns) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'user-query') {
      const q = el.querySelector('.query-text') || el;
      messages.push({ role: 'user', text: (q.innerText || '').trim(), html: '' });
    } else {
      const mds = Array.from(el.querySelectorAll('.markdown'));
      const text = mds.length
        ? mds.map((m) => (m.innerText || '').trim()).filter(Boolean).join('\\n\\n')
        : (el.innerText || '').trim();
      const html = mds.map((m) => cleanHtml(m)).join('\\n');
      messages.push({ role: 'assistant', text: text, html: html });
    }
  }
  const h1 = document.querySelector('h1');
  const title = h1 ? (h1.innerText || '').trim() : '';
  let model = '';
  const cm = (document.body.innerText || '').match(/Created with\\s+(.+?)\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)/);
  if (cm) model = cm[1].trim();
  return { title: title, model: model, messages: messages };
})()`

export function parseGemini(extract: GeminiExtract | null | undefined, url: string): ParsedConversation {
  const warnings: string[] = []
  const messages: ParsedMessage[] = []

  for (const m of extract?.messages ?? []) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    let text: string
    if (m.role === 'assistant' && m.html) {
      // Prefer Markdown recovered from the rendered HTML; fall back to plain text.
      text = htmlToMarkdown(m.html) || (m.text ?? '').trim()
    } else {
      // Strip the leading "You said" accessibility label that precedes user turns.
      text = (m.text ?? '').replace(/^You said\s*/i, '').trim()
    }
    if (!text) continue
    messages.push({ role: m.role, text })
  }

  let model = (extract?.model ?? '').trim()
  if (model && !/gemini/i.test(model)) model = `Gemini ${model}`

  const title = (extract?.title ?? '').trim()

  return { provider: 'gemini', url, title, model, messages, warnings }
}
