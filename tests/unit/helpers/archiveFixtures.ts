/**
 * tests/unit/helpers/archiveFixtures.ts
 * Synthetic account-export payloads, fabricated to match the documented format
 * rules (issue #10).
 *
 * These are *not* redacted real exports. Real exports carry account UUIDs, full
 * names, and complete prompt histories and must never enter the repository —
 * see the opt-in `LLM_AGG_TEST_EXPORT_DIR` tests for verifying against those.
 *
 * The decoy products matter as much as the real one: a Google Takeout archive
 * ships `My Activity/<Product>/MyActivity.json` for *every* product you have
 * used, all with the identical basename. A reader that takes the first basename
 * match imports browser history.
 */

const GEMINI_HEADER = 'Gemini Apps'

/** U+FEFF. Built rather than pasted so no editor or lint rule can eat it. */
const BOM = String.fromCharCode(0xfeff)

// ─── Gemini Takeout, JSON variant ────────────────────────────────────────────

/** One `Prompted` activity record as Takeout writes them. */
export function takeoutJsonRecord(prompt: string, response: string, time: string) {
  return {
    header: GEMINI_HEADER,
    title: `Prompted ${prompt}`,
    titleUrl: 'https://gemini.google.com/app',
    time,
    products: [GEMINI_HEADER],
    safeHtmlItem: [{ html: `<p>${response}</p>` }],
  }
}

export function geminiTakeoutJson(
  records: Array<{ prompt: string; response: string; time: string }>,
): string {
  return JSON.stringify(records.map((r) => takeoutJsonRecord(r.prompt, r.response, r.time)))
}

/**
 * A MyActivity.json for some other Google product. Structurally identical
 * envelope, different `header` — which is the only thing distinguishing it.
 */
export function otherProductJson(product: string, count = 3): string {
  return JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      header: product,
      title: `Watched video ${i}`,
      titleUrl: 'https://www.youtube.com/watch?v=x',
      time: `2026-07-2${i}T10:00:00.000Z`,
      products: [product],
    })),
  )
}

// ─── Gemini Takeout, HTML variant ────────────────────────────────────────────

function outerCell(product: string, body: string): string {
  return (
    '<div class="outer-cell mdl-cell mdl-cell--12-col"><div class="mdl-grid">' +
    `<div class="header-cell mdl-cell mdl-cell--12-col"><p class="mdl-typography--title">${product}<br></p></div>` +
    '<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">' +
    body +
    '</div></div></div>'
  )
}

export function geminiTakeoutHtml(
  records: Array<{ prompt: string; response: string; stamp: string }>,
): string {
  const cells = records
    .map((r) => outerCell(GEMINI_HEADER, `Prompted ${r.prompt}<br>${r.stamp}<br><p>${r.response}</p>`))
    .join('')
  return `<html><body>${cells}</body></html>`
}

/**
 * A decoy activity page for another product whose *content* mentions
 * "Gemini Apps". The original detection used a loose substring test, which this
 * page would have passed — the product must be read from the header cell and
 * compared exactly.
 */
export function decoyHtml(product: string): string {
  return (
    '<html><body>' +
    outerCell(
      product,
      'Watched Everything announced for Gemini Apps at I/O<br>Jul 20, 2026, 9:00:00 AM PDT<br>' +
        '<p>A video review of Gemini Apps and Google Gemini Apps features.</p>',
    ) +
    '</body></html>'
  )
}

// ─── Claude account export ───────────────────────────────────────────────────

export function claudeConversationsJson(
  conversations: Array<{ uuid: string; name: string; turns: Array<{ q: string; a: string }> }>,
): string {
  return JSON.stringify(
    conversations.map((c) => ({
      uuid: c.uuid,
      name: c.name,
      summary: '',
      created_at: '2026-07-20T10:00:00.000000Z',
      updated_at: '2026-07-20T11:00:00.000000Z',
      account: { uuid: 'acct-0000' },
      chat_messages: c.turns.flatMap((t, i) => [
        {
          uuid: `${c.uuid}-h${i}`,
          sender: 'human',
          text: t.q,
          content: [{ type: 'text', text: t.q }],
          created_at: `2026-07-20T10:0${i}:00.000000Z`,
        },
        {
          uuid: `${c.uuid}-a${i}`,
          sender: 'assistant',
          text: t.a,
          content: [{ type: 'text', text: t.a }],
          created_at: `2026-07-20T10:0${i}:30.000000Z`,
        },
      ]),
    })),
  )
}

// ─── ChatGPT account export ──────────────────────────────────────────────────

/**
 * One conversation object in the shape a REAL account export uses: the `mapping`
 * tree's `children` arrays are EMPTY, and the branch is expressed only through
 * `parent` pointers plus `current_node`. (The share API, by contrast, populates
 * `children`.) A parser that walks forward via `children` extracts nothing from
 * this shape — which is exactly the bug these fixtures pin.
 */
export function chatgptExportConversation(opts: {
  id: string
  title: string
  turns: Array<{ q: string; a: string }>
  createTime?: number
}) {
  const mapping: Record<string, unknown> = {}
  const rootId = `${opts.id}-root`
  mapping[rootId] = { id: rootId, message: null, parent: null, children: [] }

  let parent = rootId
  let last = rootId
  let t = opts.createTime ?? 1_700_000_000
  opts.turns.forEach((turn, i) => {
    const uId = `${opts.id}-u${i}`
    mapping[uId] = {
      id: uId,
      parent,
      children: [], // deliberately empty — the export shape
      message: { id: uId, author: { role: 'user' }, create_time: t++, content: { content_type: 'text', parts: [turn.q] } },
    }
    parent = uId
    const aId = `${opts.id}-a${i}`
    mapping[aId] = {
      id: aId,
      parent,
      children: [],
      message: {
        id: aId,
        author: { role: 'assistant' },
        create_time: t++,
        metadata: { model_slug: 'gpt-4o' },
        content: { content_type: 'text', parts: [turn.a] },
      },
    }
    parent = aId
    last = aId
  })

  return {
    conversation_id: opts.id,
    id: opts.id,
    title: opts.title,
    create_time: opts.createTime ?? 1_700_000_000,
    default_model_slug: 'gpt-4o',
    current_node: last,
    mapping,
  }
}

/** A ChatGPT `conversations.json` (or one shard of it): an array of the above. */
export function chatgptConversationsJson(
  conversations: Array<{ id: string; title: string; turns: Array<{ q: string; a: string }>; createTime?: number }>,
): string {
  return JSON.stringify(conversations.map((c) => chatgptExportConversation(c)))
}

// ─── Copilot privacy-dashboard CSV ───────────────────────────────────────────

/** Rows are newest-first, as the dashboard exports them, and the file has a BOM. */
export function copilotCsv(rows: Array<{ conversation: string; time: string; author: 'AI' | 'Human'; message: string }>): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const body = rows
    .map((r) => `${escape(r.conversation)},${r.time},${r.author},${escape(r.message)}`)
    .join('\r\n')
  // The real export is UTF-8 *with* a BOM and the reader has to cope with it,
  // so the fixture must carry one too.
  return `${BOM}Conversation,Time,Author,Message\r\n${body}\r\n`
}
