# Import Formats — Technical Findings

**Date:** 2026-07-26
**Scope:** Shared-link import (Claude) and bulk account-export import (Claude, Gemini, Copilot; ChatGPT pending)

Everything below was verified against **real export files**, not documentation or web research. Where a claim came from research and later proved wrong, that is called out explicitly — those were the expensive mistakes.

---

## 1. Claude — shared links (`claude.ai/share/<id>`)

### The endpoint exists and is trivially reachable

`https://claude.ai/api/chat_snapshots/<id>` returns the full conversation as JSON.

The only thing standing in the way is a header:

```
no headers  -> 403
UA only     -> 200   <- this is all it takes
UA + Accept -> 200
Referer only-> 403
```

An initial probe without a User-Agent returned 403, which led to a wrong conclusion that the page needed a hidden `BrowserWindow` with an in-page fetch. **It does not.** `fetchJson` in `conversationFetcher.ts` already sends a browser UA, so Claude was the *easiest* provider to add, not the hardest.

**Lesson:** when probing a vendor endpoint, always probe with a realistic UA before concluding it is protected. A single missing header inverted the entire implementation plan.

### Payload shape

```jsonc
{
  "uuid": "...",                 // snapshot id
  "conversation_uuid": "...",    // the underlying conversation — prefer this for dedup
  "snapshot_name": "Title",
  "up_to_date": true,            // false => the live conversation moved on since sharing
  "chat_messages": [
    { "uuid": "...", "index": 0, "sender": "human", "text": "...", "content": null }
  ]
}
```

- Ordered by an explicit numeric `index`.
- `content` is **null**, so the flat `text` field is authoritative. (The account export inverts this — see §2.)
- **No model identifier anywhere.** Verified by grepping the raw 113 KB payload. Claude imports are therefore tagged `claude` only, unlike ChatGPT which exposes `default_model_slug`.
- `up_to_date: false` is surfaced as a user-visible warning — a snapshot is a point-in-time copy.

---

## 2. Claude — account export (`conversations.json`)

Delivered as a zip containing `conversations.json`, `projects/`, and `users.json`. Zip layout is **flat**.

```jsonc
[
  {
    "uuid": "...", "name": "Title", "summary": "...",
    "created_at": "...", "updated_at": "...", "account": {...},
    "chat_messages": [
      { "uuid": "...", "text": "...", "content": [...], "sender": "human|assistant",
        "created_at": "...", "attachments": [], "files": [], "parent_message_uuid": "..." }
    ]
  }
]
```

### The `text` field is poisoned — `content[]` is authoritative

This is the single most important finding for Claude exports. **33 of 224 messages** in a real export had a `text` field containing literal placeholder junk:

```
```
This block is not supported on your current device yet.
```
```

…inserted where thinking / tool blocks were stripped. The typed `content[]` text blocks are clean.

Content block types observed: `text` (271), `tool_use` (142), `tool_result` (141), `thinking` (2), `token_budget` (5).

**This is the exact opposite of the snapshot format**, where `content` is null and `text` is correct. `extractClaudeText` handles both by preferring `content[]` text blocks and falling back to `text` — one rule that happens to be right for both envelopes.

### Other differences from snapshots

| | Snapshot | Account export |
|---|---|---|
| Ordering | explicit `index` | no `index`; order by `created_at` |
| `content[]` | `null` | populated |
| Envelope | single object | array of conversations |
| Title field | `snapshot_name` | `name` |

`orderMessages` checks for `index` first, then `created_at`, then falls back to array order (V8's sort is stable).

### Verified results

11 conversations → **109 pairs**, all with unique origin ids, zero placeholder junk reaching the archive. 3 messages were tool-only (no text in either field) and were skipped with a warning.

`projects/` and `users.json` are deliberately ignored.

---

## 3. Gemini — Google Takeout

### It is an activity log, not conversations

**There is no conversation grouping and no way to recover one.** Every record is a standalone prompt + response; nothing links a follow-up to what preceded it. There are no conversation ids, no parent pointers, no session markers.

Rather than invent threads, records are grouped by **UTC calendar day**. This is documented in the UI and the docs as a stand-in, not a reconstruction.

### Not every record is a conversation

Verb distribution in a real export of 875 records — **identical in both the HTML and JSON variants**, which is a useful cross-check that the two are the same data:

| Verb | Count | Conversation? |
|---|---|---|
| `Prompted` | 783 | yes |
| `Branched` | 37 | yes |
| `Answered` | 2 | yes |
| `Created` | 22 | no — Canvas |
| `Added` | 15 | no |
| `Used` | 8 | no |
| `Gave` | 8 | no — feedback |

822 are prompt-like; the other 53 are skipped and reported.

### Two variants, both must be supported

Takeout offers HTML or JSON at export time, and the user gets whichever they picked — so both are handled behind one `parseGeminiTakeout` that sniffs the input itself.

**JSON** (preferred):
```jsonc
{ "header": "Gemini Apps", "title": "Prompted <text>", "time": "2026-07-26T06:07:57.773Z",
  "products": ["Gemini Apps"], "safeHtmlItem": [{ "html": "<p>…</p>" }],
  "subtitles": [...], "imageFile": [...], "attachedFiles": [...] }
```

- **6 records carried multiple `safeHtmlItem` entries** — they must be joined, not `[0]`.
- `subtitles` holds satisfaction-survey answers; noise, ignored.

**HTML**: the same records as Material-Design `outer-cell` blocks, `Prompted <prompt><br><timestamp><br><response HTML>`, product name in the header cell. Response HTML goes through the existing Turndown `htmlToMarkdown` (already a dependency for Gemini share links).

### The two variants do not yield identical counts

JSON produced **814** pairs, HTML **822**. Cause, confirmed rather than assumed: **8 records have an empty prompt after stripping the verb** — image-only prompts, where the JSON leaves `title` bare (`"Prompted "`) and the HTML carries filename text. These are now skipped and reported *separately* from non-conversation records, because "Canvas record" and "image-only prompt" are different things to a user.

### A Takeout archive is multi-product — this caused a real bug

A single Takeout zip holds `My Activity/<Product>/MyActivity.json` for **every** Google product:

```
Takeout/My Activity/YouTube/MyActivity.json       14,663 records
Takeout/My Activity/Chrome/MyActivity.json         7,291 records
Takeout/My Activity/Search/MyActivity.json         1,718 records
Takeout/My Activity/Gemini Apps/MyActivity.json      875 records   <- the only one wanted
... Maps, Google News, AI Mode, Hotels, Translate, Image Search, Video Search
```

The first implementation matched candidates by **basename** and took the first hit — which would have imported browser history as Q&A pairs. See §5 for the fix.

Discrimination is clean because **only Gemini Apps has both `header: "Gemini Apps"` and `safeHtmlItem`**; every other product has neither. For the HTML variant the header-cell product must be compared **exactly** — a substring test accepts a YouTube page whose *content* mentions Gemini, which was verified with a deliberately adversarial fixture.

### Dedup keys

No message ids exist, and **timestamps are not unique**: 13 collisions in the JSON variant, 28 in the HTML. Keys therefore mix timestamp with a djb2 hash of the prompt.

Keys are normalized to **whole-second UTC** so that importing the JSON export *and* the HTML export of the same history de-duplicates against itself — the JSON carries milliseconds and is UTC, the HTML does not and is local. Changing either to local time silently breaks cross-variant dedup; there is a test pinning it.

---

## 4. Copilot — privacy-dashboard CSV

### Correcting a research-based error

Earlier notes (and the first version of GitHub issue #10) stated Copilot exports "CSV activity rows, not conversations" and was not importable. **That was wrong.** It came from web search rather than a real file. A real export is full conversations:

```
Conversation,Time,Author,Message
"Git Flag Explained",2026-07-26T23:20:56,AI,"**Short answer:** … full Markdown …"
"Git Flag Explained",2026-07-26T23:20:56,Human,"what does --no-git-tag-version do?"
```

**Lesson:** the same one as §1 — do not conclude a format is unusable without looking at a real file. Two of the four providers were initially mis-assessed from research alone, in opposite directions.

Source: Microsoft privacy dashboard → Copilot → *Export all activity history*.

### It is genuinely threaded — better than Takeout

The `Conversation` column carries a real title, so actual threads are reconstructed rather than grouped by date. Message bodies are already Markdown, so no HTML conversion is needed.

### Ordering: reverse, never sort

Two facts that interact badly:

1. Rows are **newest-first**, globally and within a conversation.
2. **An AI row and the Human prompt that produced it share an identical timestamp** — 1290 of 2613 rows tie with a sibling.

A stable ascending sort by time preserves the file's AI-before-Human order *inside each tie*, putting every answer before its question. The rows must be **reversed**. A test pins this, and `CLAUDE.md` warns against "optimizing" it into a sort.

### A line-split would corrupt the file

Message bodies are multi-line Markdown containing commas, quotes, and blank lines, so `parseCsvRows` is a real RFC 4180 reader. The file is UTF-8 **with a BOM**, CRLF row separators, LF inside quoted fields.

> Implementation note: the literal U+FEFF character in a regex trips ESLint's `no-irregular-whitespace`. Use the `\uFEFF` escape.

### Verified results

2613 rows → **375 threads → 1286 pairs**, every pair with a unique origin id.

5 pairs had no question. Checked rather than assumed: those conversations lose their opening Human row to an empty-message skip, so the earliest surviving message is an AI reply. All 5 carry warnings — no silent loss.

Keys are `csv:<hash(title)>` + `<isoSeconds>#<hash(message)>`. There are no ids, and the title is the only stable conversation handle — so a renamed conversation will not dedup on re-import. Accepted limitation.

---

## 5. Cross-cutting architecture findings

### Detection must key on structure, never on filename

**Claude, ChatGPT, and Gemini all ship a file literally named `conversations.json`** with three unrelated shapes. Extension and filename carry no information.

`formatRegistry.ts` therefore receives the **raw entry text** — not parsed JSON — because Copilot is CSV and Takeout can be HTML. Committing to a JSON-shaped contract early would have required rework twice.

### A basename match is not identification

Consequence of §3. `archiveReader` takes an `accept` predicate (structural detection) and keeps trying candidates until one is recognized, with `pathHints` (`gemini apps`) as a probe-*ordering* optimization only. Correctness comes from detection, so the reader survives Google renaming a folder.

### yauzl reads sequentially — handles cannot be deferred

In `lazyEntries` mode an `Entry` is only valid for `openReadStream` **during its own `entry` event**. The first implementation collected handles during iteration and read them afterwards, which throws at `yauzl/index.js:485`.

Reading is now two passes — `listZipCandidates` then `fetchZipEntry` — each costing only a central-directory read. This is an inviting thing to "optimize" back into one pass; don't.

`yauzl` is now an explicit dependency (it was previously only transitive via `electron` → `extract-zip`), with the lockfile synced.

### Cardinality drove the whole design

`ImportResult` has a **singular** `threadName`. An account export is N threads. This is why "just detect JSON early in the existing handler" does not work, and why `importFromFile()` returns a discriminated `FileImportOutcome` instead.

**One menu entry, two pipelines.** Users should not have to classify their own file before choosing a menu item; the fork happens on content, in `fileImportService.ts`.

### Writes belong in main, not the renderer

The existing file-import path loops `createPair` from the renderer — one IPC round-trip per pair. That is fine for 2 pairs and unacceptable for 1286. `commitArchiveImport` writes in the main process and streams progress back, and per-pair failures are isolated so one unwritable file cannot abandon a 500-conversation import.

### Only counts cross the IPC bridge

A full preview holds every question and answer body — megabytes. `summarizePreview` strips them; the full preview stays in a main-side map keyed by `previewId`, released on commit or cancel.

### File-dialog filters behave differently on Linux

On GTK, a file whose extension is not in any filter is **hidden**, not merely de-emphasized — unlike Windows, where the user can usually still type a path. Because vendors rename exports freely (and Linux downloads often arrive extensionless), the dialog carries an explicit `All files (*)` entry.

Extension is only a routing *hint*. Unknown or absent extensions fall through to a content probe:

- ZIP magic bytes (`PK`) → archive, covering renamed or extensionless downloads.
- Otherwise the archive registry inspects the text.

The probe reads the **whole** file, not a prefix: a truncated slice of a large JSON export will not parse, so a prefix-only probe would reject valid exports. Guarded by a size ceiling.

Directories route to the archive pipeline unconditionally — an unzipped export folder is the only thing a directory can be. Note the dialog itself still uses `properties: ['openFile']`; combining `openFile` and `openDirectory` is macOS-only in Electron, so selecting a *folder* is not yet possible from the dialog even though the reader supports it.

### Dedup key design

`origin_id` = `<provider>:<conversationId>:<anchorMessageId>`, persisted in QA frontmatter.

- The anchor is the pair's **first** message id, so the key survives later turns being appended to the same conversation and re-exported.
- A **share link and an account export of the same Claude conversation produce identical keys** (the snapshot parser prefers `conversation_uuid` over the snapshot's own `uuid`). Pinned by test.
- `updatePair()` must carry `origin_id` through every edit — it is immutable identity, never regenerated.
- Where no ids exist (Gemini, Copilot), synthesized keys use timestamp + content hash. Less robust but stable across re-exports.
- The archive-wide sweep falls back to a normalized content fingerprint for pairs predating the key.

---

## 6. Bugs found, and what found them

| Bug | Found by | Reachable by unit tests? |
|---|---|---|
| Claude endpoint "requires BrowserWindow" | Re-probing with a UA | No |
| Wrong product picked from multi-product Takeout | Pointing the reader at a real Takeout zip | **No** — container layer |
| yauzl deferred `openReadStream` throws | The adversarial mixed-archive test | **No** — container layer |
| Loose HTML product matching | A deliberately adversarial fixture | Yes, once written |
| Copilot assessed as unimportable | Reading a real CSV | No |

**The pattern is stark: the highest-severity bugs were all in the container / selection layer, which pure-parser tests cannot reach.** This is the entire argument behind GitHub issue #10 (synthesized archive fixtures).

Three assertion failures during development turned out to be **wrong assertions, not wrong code** — HTML tags inside fenced code blocks, a literal `<br>` spacer, and prompt-less image records. Each was investigated before being explained away.

---

## 7. Open items

- **ChatGPT account export is the only unverified format.** Implemented by reusing the share-link `mapping` tree walker (the export is an array of the same structure), flagged `validated: false` so the UI warns before importing. Awaiting a real export file — planned for 2026-07-27.
- **Gemini Takeout JSON→thread grouping** remains day-based. If Google ever adds a conversation id, this should switch.
- **Copilot conversation renames** break dedup, since the title is the only handle.
- **Fixtures** — see issue #10.
