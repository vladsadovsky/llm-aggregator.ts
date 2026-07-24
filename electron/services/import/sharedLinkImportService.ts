/**
 * import/sharedLinkImportService.ts
 * Orchestrator: shared-conversation URL → SharedImportResult.
 *
 * Wires provider detection → transport (JSON API or rendered DOM) → the pure
 * parser for that provider → buildResult. The renderer takes the result and
 * creates the QA pairs + thread (mirroring the existing file-import flow).
 */

import { detectProvider, PROVIDER_LABEL } from './providerDetection'
import { fetchJson, renderGemini } from './conversationFetcher'
import { parseChatGPT } from './parsers/chatgptParser'
import { parseCopilot } from './parsers/copilotParser'
import { parseGemini } from './parsers/geminiParser'
import { buildResult } from './buildResult'
import { debugLog } from '../logger'
import type { ParsedConversation, SharedImportResult } from './types'

export async function importSharedLink(rawUrl: string): Promise<SharedImportResult> {
  const match = detectProvider(rawUrl)
  if (!match) {
    throw new Error(
      'Unrecognized share link. Supported links look like:\n' +
        '• https://chatgpt.com/share/…\n' +
        '• https://gemini.google.com/share/…\n' +
        '• https://copilot.microsoft.com/shares/…',
    )
  }

  const { provider, shareId } = match
  debugLog('sharedLinkImport', 'importing', provider, shareId)

  let convo: ParsedConversation
  if (provider === 'chatgpt') {
    const json = await fetchJson(`https://chatgpt.com/backend-api/share/${shareId}`)
    convo = parseChatGPT(json, rawUrl)
  } else if (provider === 'copilot') {
    const json = await fetchJson(`https://copilot.microsoft.com/c/api/conversations/shares/${shareId}`)
    convo = parseCopilot(json, rawUrl)
  } else {
    const extract = await renderGemini(rawUrl)
    convo = parseGemini(extract, rawUrl)
  }

  if (convo.messages.length === 0) {
    throw new Error(
      `No conversation content could be extracted from this ${PROVIDER_LABEL[provider]} share link. ` +
        'The link may be private, expired, or the page format may have changed.',
    )
  }

  const result = buildResult(convo)
  debugLog('sharedLinkImport', 'built result:', result.items.length, 'pairs, thread:', result.threadName)
  return result
}
