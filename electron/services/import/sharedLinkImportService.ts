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

function summarizeRoles(messages: ParsedConversation['messages']): Record<string, number> {
  return messages.reduce<Record<string, number>>((acc, message) => {
    const role = message.role
    acc[role] = (acc[role] ?? 0) + 1
    return acc
  }, {})
}

export async function importSharedLink(rawUrl: string): Promise<SharedImportResult> {
  const match = detectProvider(rawUrl)
  if (!match) {
    throw new Error(
      'Unrecognized share link. Supported links look like:\n' +
        '• https://chatgpt.com/share/…\n' +
        '• https://gemini.google.com/share/… or https://share.gemini.google/…\n' +
        '• https://copilot.microsoft.com/shares/…',
    )
  }

  const { provider, shareId } = match
  debugLog('sharedLinkImport', 'importing', {
    provider,
    shareId,
    rawUrl,
  })

  let convo: ParsedConversation
  if (provider === 'chatgpt') {
    const json = await fetchJson(`https://chatgpt.com/backend-api/share/${shareId}`)
    debugLog('sharedLinkImport', 'chatgpt payload summary', {
      topLevelKeys: typeof json === 'object' && json !== null ? Object.keys(json as Record<string, unknown>) : [],
    })
    convo = parseChatGPT(json, rawUrl)
  } else if (provider === 'copilot') {
    const json = await fetchJson(`https://copilot.microsoft.com/c/api/conversations/shares/${shareId}`)
    debugLog('sharedLinkImport', 'copilot payload summary', {
      topLevelKeys: typeof json === 'object' && json !== null ? Object.keys(json as Record<string, unknown>) : [],
      rawMessages: Array.isArray((json as { messages?: unknown[] })?.messages)
        ? (json as { messages?: unknown[] }).messages?.length ?? 0
        : 0,
      title: (json as { conversationTitle?: string })?.conversationTitle ?? '',
    })
    convo = parseCopilot(json, rawUrl)
  } else {
    const extract = await renderGemini(rawUrl)
    debugLog('sharedLinkImport', 'gemini extraction summary', {
      title: extract.title,
      model: extract.model,
      rawMessages: extract.messages.length,
    })
    convo = parseGemini(extract, rawUrl)
  }

  debugLog('sharedLinkImport', 'parsed conversation summary', {
    provider: convo.provider,
    title: convo.title,
    model: convo.model,
    messageCount: convo.messages.length,
    roleCounts: summarizeRoles(convo.messages),
    warnings: convo.warnings,
    firstMessage: convo.messages[0]
      ? {
          role: convo.messages[0].role,
          textPreview: convo.messages[0].text.slice(0, 120),
        }
      : null,
  })

  if (convo.messages.length === 0) {
    throw new Error(
      `No conversation content could be extracted from this ${PROVIDER_LABEL[provider]} share link. ` +
        'The link may be private, expired, or the page format may have changed.',
    )
  }

  const result = buildResult(convo)
  debugLog('sharedLinkImport', 'built result summary', {
    threadName: result.threadName,
    itemCount: result.items.length,
    tags: result.tags,
    warnings: result.warnings,
    firstItem: result.items[0]
      ? {
          title: result.items[0].data.title,
          questionLength: result.items[0].data.question.length,
          answerLength: result.items[0].data.answer.length,
          itemWarnings: result.items[0].warnings,
        }
      : null,
  })
  return result
}
