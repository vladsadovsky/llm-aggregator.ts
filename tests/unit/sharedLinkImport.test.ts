/**
 * Unit tests for the shared-link import parsing/building layer.
 * These modules are pure (no Electron / filesystem), so they run directly
 * under the Node vitest config.
 */
import { describe, it, expect } from 'vitest'
import { detectProvider, normalizeTag, classifyShareUrl } from '../../electron/services/import/providerDetection'
import { parseChatGPT } from '../../electron/services/import/parsers/chatgptParser'
import { parseCopilot } from '../../electron/services/import/parsers/copilotParser'
import { parseGemini } from '../../electron/services/import/parsers/geminiParser'
import { parseClaude } from '../../electron/services/import/parsers/claudeParser'
import { pairMessages } from '../../electron/services/import/pairMessages'
import { buildResult, deriveTitle } from '../../electron/services/import/buildResult'
import { htmlToMarkdown } from '../../electron/services/import/htmlToMarkdown'
import type { ParsedConversation } from '../../electron/services/import/types'

describe('detectProvider', () => {
  it('detects ChatGPT share links', () => {
    expect(detectProvider('https://chatgpt.com/share/6a63dd0d-03e0-83e8-afb8-e610e2c7676b')).toEqual({
      provider: 'chatgpt',
      shareId: '6a63dd0d-03e0-83e8-afb8-e610e2c7676b',
    })
  })

  it('detects ChatGPT /share/e/ form and legacy host', () => {
    expect(detectProvider('https://chatgpt.com/share/e/abc123')?.shareId).toBe('abc123')
    expect(detectProvider('https://chat.openai.com/share/xyz789')?.provider).toBe('chatgpt')
  })

  it('detects Gemini share links (ignoring query params)', () => {
    expect(detectProvider('https://gemini.google.com/share/dae2d696ce75?skid=8ce4d85e')).toEqual({
      provider: 'gemini',
      shareId: 'dae2d696ce75',
    })
    expect(detectProvider('https://share.gemini.google/HUUbtVKXnlNG')).toEqual({
      provider: 'gemini',
      shareId: 'HUUbtVKXnlNG',
    })
  })

  it('detects Copilot share links', () => {
    expect(detectProvider('https://copilot.microsoft.com/shares/BZsTfJy1ksVsgEPCs23wH')).toEqual({
      provider: 'copilot',
      shareId: 'BZsTfJy1ksVsgEPCs23wH',
    })
  })

  it('detects Claude share links', () => {
    expect(detectProvider('https://claude.ai/share/7eb61e46-3c37-465f-9613-478c90a6e817')).toEqual({
      provider: 'claude',
      shareId: '7eb61e46-3c37-465f-9613-478c90a6e817',
    })
    expect(detectProvider('https://claude.com/share/abc123?utm_source=x')?.provider).toBe('claude')
  })

  it('rejects unsupported / malformed URLs', () => {
    expect(detectProvider('https://example.com/share/abc')).toBeNull()
    expect(detectProvider('https://claude.ai/chat/7eb61e46-3c37-465f-9613-478c90a6e817')).toBeNull()
    expect(detectProvider('not a url')).toBeNull()
    expect(detectProvider('ftp://chatgpt.com/share/abc')).toBeNull()
    expect(detectProvider('https://chatgpt.com/c/abc')).toBeNull()
  })

  it('rejects http (S6 — https only)', () => {
    expect(detectProvider('http://chatgpt.com/share/abc')).toBeNull()
    expect(detectProvider('http://gemini.google.com/share/dae2d696ce75')).toBeNull()
  })
})

describe('classifyShareUrl (S6)', () => {
  it('flags an http share link as insecure and accepts the https form', () => {
    expect(classifyShareUrl('http://gemini.google.com/share/dae2d696ce75')).toEqual({ kind: 'insecure-scheme' })
    expect(classifyShareUrl('https://gemini.google.com/share/dae2d696ce75')).toEqual({
      kind: 'ok',
      match: { provider: 'gemini', shareId: 'dae2d696ce75' },
    })
  })

  it('distinguishes unsupported and malformed from insecure', () => {
    expect(classifyShareUrl('https://example.com/x')).toEqual({ kind: 'unsupported' })
    expect(classifyShareUrl('not a url')).toEqual({ kind: 'unsupported' })
  })
})

describe('normalizeTag', () => {
  it('lowercases and hyphenates, keeping dots', () => {
    expect(normalizeTag('Gemini 3.6 Flash')).toBe('gemini-3.6-flash')
    expect(normalizeTag('GPT-5 (Instant)')).toBe('gpt-5-instant')
    expect(normalizeTag('  Copilot  ')).toBe('copilot')
  })
})

describe('parseChatGPT', () => {
  // Minimal mapping tree mirroring the backend-api/share shape.
  const json = {
    title: 'Haiku on Waterfall Tree',
    default_model_slug: 'gpt-5-3-instant',
    mapping: {
      root: { id: 'root', parent: null, children: ['sys'] },
      sys: { id: 'sys', parent: 'root', children: ['u1'], message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } } },
      u0: { id: 'u0', parent: 'sys', children: ['u1'], message: { author: { role: 'user' }, recipient: 'all', content: { content_type: 'text', parts: ['Original custom instructions no longer available'] } } },
      u1: { id: 'u1', parent: 'sys', children: ['tool'], message: { author: { role: 'user' }, recipient: 'all', content: { content_type: 'text', parts: ['First question'] } } },
      tool: { id: 'tool', parent: 'u1', children: ['a1'], message: { author: { role: 'assistant' }, recipient: 'web', content: { content_type: 'code', parts: [''] } } },
      a1: { id: 'a1', parent: 'tool', children: [], message: { author: { role: 'assistant' }, recipient: 'all', metadata: { model_slug: 'gpt-5-3-instant' }, content: { content_type: 'text', parts: ['First answer'] } } },
    },
  }

  it('walks the tree, filtering system, tool channels, and artifacts', () => {
    const convo = parseChatGPT(json, 'https://chatgpt.com/share/x')
    expect(convo.title).toBe('Haiku on Waterfall Tree')
    expect(convo.model).toBe('gpt-5-3-instant')
    expect(convo.messages).toEqual([
      { role: 'user', text: 'First question' },
      { role: 'assistant', text: 'First answer' },
    ])
  })

  it('walks the active branch via current_node when children are empty (account-export shape)', () => {
    // Real ChatGPT exports leave `children` empty and express the tree only
    // through `parent` + `current_node`. A forward children-walk would extract
    // nothing; the current_node → parent walk recovers the conversation.
    const exportShape = {
      title: 'Export shape',
      default_model_slug: 'gpt-4o',
      current_node: 'a1',
      mapping: {
        root: { id: 'root', parent: null, children: [], message: null },
        u1: { id: 'u1', parent: 'root', children: [], message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['Q1'] } } },
        a1: { id: 'a1', parent: 'u1', children: [], message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['A1'] } } },
      },
    }
    const convo = parseChatGPT(exportShape, 'https://chatgpt.com/c/x')
    expect(convo.messages).toEqual([
      { role: 'user', text: 'Q1' },
      { role: 'assistant', text: 'A1' },
    ])
  })
})

describe('parseCopilot', () => {
  // Newest-first, as returned by the API; each ai reply sits above its human question.
  const json = {
    conversationTitle: 'Wildfire Air Quality',
    messages: [
      { author: 'ai', createdAt: '2026-07-18T15:44:23.948+00:00', content: [{ type: 'text', text: 'Answer 2' }, { type: 'citation' }] },
      { author: 'human', createdAt: '2026-07-18T15:44:23.947+00:00', content: [{ type: 'text', text: 'Question 2' }] },
      { author: 'ai', createdAt: '2026-07-18T15:34:18.522+00:00', content: [{ type: 'text', text: 'Answer 1a' }, { type: 'card' }, { type: 'text', text: 'Answer 1b' }] },
      { author: 'human', createdAt: '2026-07-18T15:34:18.512+00:00', content: [{ type: 'text', text: 'Question 1' }] },
    ],
  }

  it('sorts chronologically and concatenates text parts', () => {
    const convo = parseCopilot(json, 'https://copilot.microsoft.com/shares/x')
    expect(convo.title).toBe('Wildfire Air Quality')
    expect(convo.model).toBe('')
    expect(convo.messages).toEqual([
      { role: 'user', text: 'Question 1' },
      { role: 'assistant', text: 'Answer 1a\n\nAnswer 1b' },
      { role: 'user', text: 'Question 2' },
      { role: 'assistant', text: 'Answer 2' },
    ])
  })
})

describe('parseGemini', () => {
  it('strips the "You said" label and prefixes the model with Gemini', () => {
    const convo = parseGemini(
      {
        title: 'Bluetti Battery Sine Wave Explained',
        model: '3.6 Flash',
        messages: [
          { role: 'user', text: 'You said\n\nWhat is a sine wave?' },
          { role: 'assistant', text: 'It means pure sine output.' },
        ],
      },
      'https://gemini.google.com/share/x',
    )
    expect(convo.title).toBe('Bluetti Battery Sine Wave Explained')
    expect(convo.model).toBe('Gemini 3.6 Flash')
    expect(convo.messages[0]).toEqual({ role: 'user', text: 'What is a sine wave?' })
  })

  it('converts assistant HTML to Markdown, preserving structure', () => {
    const convo = parseGemini(
      {
        title: 'T',
        model: 'Gemini',
        messages: [
          { role: 'user', text: 'You said\n\nExplain' },
          {
            role: 'assistant',
            text: 'Heading Bold point Second',
            html: '<h2>Heading</h2><ul><li><strong>Bold</strong> point</li><li>Second</li></ul>',
          },
        ],
      },
      'https://gemini.google.com/share/x',
    )
    expect(convo.messages[1].text).toBe('## Heading\n\n-   **Bold** point\n-   Second')
  })

  it('falls back to plain text when assistant HTML is empty', () => {
    const convo = parseGemini(
      {
        title: 'T',
        model: 'Gemini',
        messages: [
          { role: 'user', text: 'Q' },
          { role: 'assistant', text: 'plain answer', html: '' },
        ],
      },
      'https://gemini.google.com/share/x',
    )
    expect(convo.messages[1].text).toBe('plain answer')
  })
})

describe('parseClaude', () => {
  // Mirrors /api/chat_snapshots/<id>: flat markdown `text`, `content: null`.
  const json = {
    snapshot_name: 'Migrating projects and conversations',
    up_to_date: true,
    chat_messages: [
      { index: 1, sender: 'assistant', text: 'Answer 1', content: null },
      { index: 0, sender: 'human', text: 'Question 1', content: null },
      { index: 2, sender: 'human', text: 'Question 2', content: null },
      { index: 3, sender: 'assistant', text: 'Answer 2', content: null },
    ],
  }

  it('orders by index, maps human→user, and takes the flat text field', () => {
    const convo = parseClaude(json, 'https://claude.ai/share/x')
    expect(convo.provider).toBe('claude')
    expect(convo.title).toBe('Migrating projects and conversations')
    // No model identifier in the payload — buildResult falls back to "Claude".
    expect(convo.model).toBe('')
    expect(convo.messages).toEqual([
      { role: 'user', text: 'Question 1' },
      { role: 'assistant', text: 'Answer 1' },
      { role: 'user', text: 'Question 2' },
      { role: 'assistant', text: 'Answer 2' },
    ])
    expect(convo.warnings).toEqual([])
  })

  it('prefers content[] text blocks and drops thinking / tool_use blocks', () => {
    const convo = parseClaude(
      {
        snapshot_name: 'T',
        chat_messages: [
          { index: 0, sender: 'human', text: 'ignored', content: [{ type: 'text', text: 'Q' }] },
          {
            index: 1,
            sender: 'assistant',
            text: 'ignored',
            content: [
              { type: 'thinking', thinking: 'internal reasoning' },
              { type: 'text', text: 'A part 1' },
              { type: 'tool_use', name: 'search' },
              { type: 'text', text: 'A part 2' },
            ],
          },
        ],
      },
      'https://claude.ai/share/x',
    )
    expect(convo.messages).toEqual([
      { role: 'user', text: 'Q' },
      { role: 'assistant', text: 'A part 1\n\nA part 2' },
    ])
  })

  it('skips unknown senders and empty messages, warning about each', () => {
    const convo = parseClaude(
      {
        snapshot_name: 'T',
        chat_messages: [
          { index: 0, sender: 'human', text: 'Q' },
          { index: 1, sender: 'system', text: 'nope' },
          { index: 2, sender: 'assistant', text: '   ', content: [] },
          { index: 3, sender: 'assistant', text: 'A' },
        ],
      },
      'https://claude.ai/share/x',
    )
    expect(convo.messages).toEqual([
      { role: 'user', text: 'Q' },
      { role: 'assistant', text: 'A' },
    ])
    expect(convo.warnings.some((w) => /unknown sender/i.test(w))).toBe(true)
    expect(convo.warnings.some((w) => /no text content/i.test(w))).toBe(true)
  })

  it('warns when the snapshot is out of date', () => {
    const convo = parseClaude({ ...json, up_to_date: false }, 'https://claude.ai/share/x')
    expect(convo.warnings.some((w) => /outdated snapshot/i.test(w))).toBe(true)
  })

  it('warns when the payload has no messages', () => {
    const convo = parseClaude({ snapshot_name: 'T' }, 'https://claude.ai/share/x')
    expect(convo.messages).toEqual([])
    expect(convo.warnings.some((w) => /no chat_messages/i.test(w))).toBe(true)
  })

  it('labels the model and source as Claude via buildResult', () => {
    const result = buildResult(parseClaude(json, 'https://claude.ai/share/x'))
    expect(result.model).toBe('Claude')
    expect(result.tags).toEqual(['claude'])
    expect(result.items[0].data.source).toBe('claude')
    expect(result.threadName).toBe('Migrating projects and conversations')
    expect(result.titleWasDerived).toBe(false)
  })
})

describe('htmlToMarkdown', () => {
  it('converts headings, emphasis, tables, and fenced code', () => {
    const md = htmlToMarkdown(
      '<h2>Title</h2><p>a <strong>b</strong> <em>c</em></p>' +
        '<table><thead><tr><th>X</th><th>Y</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>' +
        '<pre><code class="language-js">const x = 1</code></pre>',
    )
    expect(md).toContain('## Title')
    expect(md).toContain('**b**')
    expect(md).toContain('| X | Y |')
    expect(md).toContain('```js')
    expect(md).toContain('const x = 1')
  })

  it('returns empty string for blank input', () => {
    expect(htmlToMarkdown('')).toBe('')
    expect(htmlToMarkdown('   ')).toBe('')
  })
})

describe('pairMessages', () => {
  it('groups user→assistant runs into pairs', () => {
    const pairs = pairMessages([
      { role: 'user', text: 'Q1' },
      { role: 'assistant', text: 'A1a' },
      { role: 'assistant', text: 'A1b' },
      { role: 'user', text: 'Q2' },
      { role: 'assistant', text: 'A2' },
    ])
    expect(pairs).toHaveLength(2)
    expect(pairs[0]).toMatchObject({ question: 'Q1', answer: 'A1a\n\nA1b' })
    expect(pairs[1]).toMatchObject({ question: 'Q2', answer: 'A2' })
  })

  it('merges consecutive user messages into one question', () => {
    const pairs = pairMessages([
      { role: 'user', text: 'part a' },
      { role: 'user', text: 'part b' },
      { role: 'assistant', text: 'answer' },
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].question).toBe('part a\n\npart b')
  })

  it('warns on a leading assistant message with no question', () => {
    const pairs = pairMessages([
      { role: 'assistant', text: 'orphan answer' },
      { role: 'user', text: 'Q' },
      { role: 'assistant', text: 'A' },
    ])
    expect(pairs).toHaveLength(2)
    expect(pairs[0].question).toBe('')
    expect(pairs[0].warnings.length).toBeGreaterThan(0)
  })
})

describe('deriveTitle', () => {
  it('takes the first non-empty line, truncating long ones', () => {
    expect(deriveTitle('  \n\nHello there\nsecond')).toBe('Hello there')
    const long = 'a'.repeat(100)
    expect(deriveTitle(long).endsWith('…')).toBe(true)
  })
})

describe('buildResult', () => {
  function convo(overrides: Partial<ParsedConversation> = {}): ParsedConversation {
    return {
      provider: 'chatgpt',
      url: 'https://chatgpt.com/share/x',
      title: 'Real Title',
      model: 'gpt-5',
      messages: [
        { role: 'user', text: 'What is X?' },
        { role: 'assistant', text: 'X is a thing.' },
      ],
      warnings: [],
      ...overrides,
    }
  }

  it('applies provider + model tags to the thread and each QA', () => {
    const result = buildResult(convo())
    expect(result.tags).toEqual(['chatgpt', 'gpt-5'])
    expect(result.items[0].data.tags).toEqual(['chatgpt', 'gpt-5'])
    expect(result.items[0].data.source).toBe('chatgpt')
    expect(result.titleWasDerived).toBe(false)
    expect(result.threadName).toBe('Real Title')
  })

  it('derives a thread name and flags it when no real title exists', () => {
    const result = buildResult(convo({ title: '' }))
    expect(result.titleWasDerived).toBe(true)
    expect(result.threadName).toBe('What is X?')
    expect(result.warnings.some((w) => /rename/i.test(w))).toBe(true)
  })

  it('treats generic titles as derived', () => {
    const result = buildResult(convo({ title: 'New chat' }))
    expect(result.titleWasDerived).toBe(true)
  })

  it('falls back to the provider label when the model is unknown', () => {
    const result = buildResult(convo({ provider: 'copilot', model: '' }))
    expect(result.model).toBe('Copilot')
    expect(result.tags).toEqual(['copilot'])
  })
})
