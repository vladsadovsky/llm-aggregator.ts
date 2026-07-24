# LLM Integration Tasks

Implementation plan derived from `LLM_Integration_Spec.md` gap analysis, 2026-03-19.

> **Offline-first principle:** Every phase must preserve full functionality when no LLM API key is configured or the network is unreachable. LLM features degrade gracefully; core QA workflow never blocks.

---

## Phase 0 — Tag Dictionary & Vocabulary Control (Offline Only)

**Goal:** Introduce a managed tag vocabulary so the archive stays consistent as it grows. No LLM dependency. This is the foundation that Phase 3 (LLM tag suggestion) and Phase 5 (batch retagging) will build on.

### 0.1 Tag Dictionary Service

**File:** `electron/services/tagDictionaryService.ts` (new)

Create a service that maintains a canonical tag dictionary stored alongside the archive data.

**Storage:** `<dataDirectory>/tag-dictionary.json`

```json
{
  "version": 1,
  "tags": {
    "typescript": { "created": "2026-03-19T10:00:00Z", "aliases": ["ts"] },
    "react":     { "created": "2026-03-19T10:00:00Z", "aliases": [] },
    "vue":       { "created": "2026-03-19T10:00:00Z", "aliases": ["vuejs", "vue3"] }
  }
}
```

**Functions to implement:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `loadDictionary` | `() => TagDictionary` | Load from disk; return empty dict if missing |
| `saveDictionary` | `(dict: TagDictionary) => void` | Persist to disk |
| `addTag` | `(tag: string, aliases?: string[]) => void` | Add a canonical tag |
| `removeTag` | `(tag: string) => void` | Remove tag from dictionary (does not retag QAs) |
| `renameTag` | `(oldTag: string, newTag: string) => void` | Rename canonical form; old name becomes alias |
| `addAlias` | `(tag: string, alias: string) => void` | Add alternate spelling |
| `resolveTag` | `(input: string) => string \| null` | Map any input (including aliases) to canonical form; `null` if unknown |
| `listTags` | `() => string[]` | All canonical tags, sorted alphabetically |
| `isKnownTag` | `(input: string) => boolean` | True if input matches a canonical tag or alias |
| `syncFromArchive` | `() => { added: string[] }` | Scan all QA pairs, add any tags not yet in dictionary |

**Type definitions** — add to `src/types/` or co-locate with service:

```typescript
interface TagEntry {
  created: string       // ISO timestamp
  aliases: string[]     // alternate spellings that resolve to this tag
}

interface TagDictionary {
  version: number
  tags: Record<string, TagEntry>
}
```

**Bootstrap logic:** On first load, if `tag-dictionary.json` does not exist, call `syncFromArchive()` to seed from existing QA tags. This ensures the dictionary is never empty for existing archives.

### 0.2 IPC Wiring

**Files:** `electron/ipc/handlers.ts`, `electron/preload.ts`, `src/global.d.ts`

Register these IPC channels:

| Channel | Handler | Renderer method |
|---------|---------|-----------------|
| `tags:load` | `loadDictionary()` | `window.api.tagsLoad()` |
| `tags:save` | `saveDictionary(dict)` | `window.api.tagsSave(dict)` |
| `tags:resolve` | `resolveTag(input)` | `window.api.tagsResolve(input)` |
| `tags:sync` | `syncFromArchive()` | `window.api.tagsSync()` |
| `tags:add` | `addTag(tag, aliases?)` | `window.api.tagsAdd(tag, aliases?)` |
| `tags:remove` | `removeTag(tag)` | `window.api.tagsRemove(tag)` |
| `tags:rename` | `renameTag(old, new)` | `window.api.tagsRename(old, new)` |

### 0.3 Tag Vocabulary Settings

**Files:** `electron/services/settingsService.ts`, `src/components/SettingsDialog.vue`

Add to `AppSettings`:

```typescript
tagSoftLimit: number   // default 50 — above this, warn on new tags
tagHardLimit: number   // default 100 — above this, block new tags entirely
tagEnforcement: 'off' | 'warn' | 'strict'  // default 'warn'
```

- `off` — no vocabulary enforcement, free-form tags as today
- `warn` — user can still add new tags but sees a visual warning
- `strict` — user can only pick from the dictionary (new tags blocked in the UI)

**SettingsDialog changes:**
- Add a "Tags" section after the existing LLM section
- Show current vocabulary size (e.g., "42 tags in dictionary")
- Dropdown for enforcement mode
- Number inputs for soft/hard limits (visible when enforcement != off)
- "Sync dictionary from archive" button (calls `tagsSync()`)
- "Manage tags..." button (opens the Tag Manager described in 0.5)

### 0.4 Tag Input Enforcement in Editors

**Files:** `src/components/QAEditor.vue`, `src/components/QAEditForm.vue`

Modify the AutoComplete tag input behavior based on `tagEnforcement` setting:

**When `enforcement = 'off'`:** No change from current behavior.

**When `enforcement = 'warn'`:**
- When user types a tag that is not in the dictionary:
  - Show the tag chip in **yellow/amber** background (vs. default for known tags)
  - Show a small warning icon or tooltip: "New tag — not in dictionary"
- When the total dictionary size exceeds `tagSoftLimit`:
  - Show a banner/message near the tag input: "Tag vocabulary is large ({count} tags). Consider reusing existing tags."
- User **can** still confirm and save the new tag

**When `enforcement = 'strict'`:**
- AutoComplete only shows dictionary tags (no free-form entry)
- If user types a string that doesn't match any dictionary tag, show: "No matching tag. Add it in Tag Manager first."
- Disable the ability to commit non-dictionary tags

**Implementation notes:**
- Load dictionary on component mount (via new `tagsLoad()` API or a Pinia store)
- Load settings to determine enforcement mode
- When a new (non-dictionary) tag is saved, auto-add it to the dictionary (in `warn` mode)
- Alias resolution: if user types an alias, silently resolve to the canonical form

### 0.5 Tag Manager Dialog

**File:** `src/components/TagManagerDialog.vue` (new)

A modal dialog for managing the tag dictionary. Opened from Settings or from a new toolbar button.

**Features:**
- Scrollable list of all dictionary tags with:
  - Tag name (editable inline)
  - Alias list (editable, comma-separated)
  - Usage count (how many QA pairs use this tag — computed from `qaStore.pairs`)
  - Delete button (with confirmation if usage > 0)
- "Add tag" row at top
- Search/filter input
- Sort by: name, usage count, created date
- Bulk actions: (stretch, can defer) merge two tags

**Constraints:**
- Renaming a tag in the manager should NOT automatically retag QA pairs — that is Phase 5 (batch retag). The manager only edits the dictionary itself. Show a note: "Renaming here updates the dictionary only. Use 'Retag archive' to update existing QA pairs."
- Deleting a tag removes it from the dictionary. Existing QA pairs keep their tags (orphaned tags will reappear on next sync).

### 0.6 Tests

**File:** `tests/tagDictionary.test.ts` (new)

Unit tests for the tag dictionary service (pure logic, no Electron):

| Test | Description |
|------|-------------|
| `loadDictionary returns empty on missing file` | Verifies bootstrap behavior |
| `addTag + listTags round-trip` | Add tags, verify listing |
| `resolveTag returns canonical for alias` | Alias resolution |
| `resolveTag returns null for unknown` | Unknown tag handling |
| `renameTag moves aliases` | Old name becomes alias |
| `removeTag` | Tag removal |
| `syncFromArchive seeds from pairs` | Integration with QA data |
| `addTag rejects duplicates` | Idempotent add |

**File:** `tests/tagEnforcement.test.ts` (new)

Tests for enforcement logic (can be unit tests against extracted validation functions):

| Test | Description |
|------|-------------|
| `warn mode: unknown tag flagged but accepted` | Returns warning metadata |
| `strict mode: unknown tag rejected` | Returns rejection |
| `off mode: all tags accepted` | No enforcement |
| `alias resolves to canonical` | Input normalization |
| `soft limit warning triggers at threshold` | Count-based warning |

---

## Phase 1 — Auto Titles (LLM)

**Goal:** Add a "Generate title" button to QAEditor and QAEditForm. Works only when an API key is configured; otherwise the button is disabled.

### 1.1 Title Generation Service

**File:** `electron/services/titleService.ts` (new)

```typescript
export async function generateTitle(id: string): Promise<string>
```

**Prompt design:**
- System prompt: `"Summarize the following Q&A exchange as a concise title. Maximum 80 characters. Return only the title text, no quotes, no punctuation at the end unless it's a question."`
- User prompt: `"Question:\n{question}\n\nAnswer (first 500 chars):\n{answer_truncated}"`

**Behavior:**
- Calls `getProvider().complete(userPrompt, systemPrompt)`
- Strips quotes/trailing punctuation from response
- Truncates to 80 chars if LLM exceeds limit
- Updates the QA pair via `updatePair(id, { title })` and returns the new title

**Fallback:** If provider throws (network, auth, rate limit), re-throw with a user-friendly message. The caller (renderer) shows a toast and keeps the existing title.

### 1.2 IPC Wiring

| Channel | Handler | Renderer method |
|---------|---------|-----------------|
| `ai:generateTitle` | `generateTitle(id)` | `window.api.aiGenerateTitle(id)` |

**Files:** `electron/ipc/handlers.ts`, `electron/preload.ts`, `src/global.d.ts`

### 1.3 UI — Generate Title Button

**Files:** `src/components/QAEditor.vue`, `src/components/QAEditForm.vue`

Add a button next to the title input field:

- Icon: `pi pi-sparkles` (consistent with existing AI icon usage in QAMetadataBar)
- Tooltip: "Generate title with AI"
- **Disabled when:** no API key is configured (check via a reactive `hasApiKey` flag — see 1.4)
- **Loading state:** spinner replaces icon while request is in flight
- **On success:** populate/overwrite the title input; user can further edit before saving
- **On error:** show error toast; title input unchanged

In **QAEditor** (create mode): button appears next to the title field. The pair must be saved first (the LLM needs the full Q&A), OR the button sends question+answer from the form directly without requiring a saved pair. Prefer the latter for better UX (no extra save step). This means `generateTitle` should also accept raw `{ question, answer }` as an alternative to an `id`.

Update `titleService.ts` signature:
```typescript
export async function generateTitle(input: { id: string } | { question: string; answer: string }): Promise<string>
```

In **QAEditForm** (edit mode): button uses the saved pair's ID.

### 1.4 API Key Availability Flag

**Files:** `src/stores/uiStore.ts` (or a new `src/stores/aiStore.ts`)

Add a reactive boolean `hasApiKey` that is set on app startup and whenever settings/secrets change. Components can use this to disable AI buttons without loading secrets into the renderer.

**Implementation option:** Add an IPC channel `ai:hasApiKey` → `boolean` that checks `loadSecrets()` on the main process side and returns only true/false (never the key itself).

### 1.5 Tests

**File:** `tests/titleService.test.ts` (new)

| Test | Description |
|------|-------------|
| `generates title from QA pair` | Mock provider, verify prompt and result |
| `truncates to 80 chars` | Long LLM response truncated |
| `strips quotes from response` | Cleanup logic |
| `throws on missing pair` | Error path |
| `accepts raw question+answer` | Alternate input mode |

---

## Phase 2 — Auto Tags (LLM)

**Goal:** LLM-powered tag suggestion integrated with the Phase 0 tag dictionary. Respects vocabulary limits.

### 2.1 Tag Suggestion Service

**File:** `electron/services/tagSuggestionService.ts` (new)

```typescript
export async function suggestTags(
  input: { id: string } | { question: string; answer: string },
  existingTags: string[]
): Promise<TagSuggestion[]>

interface TagSuggestion {
  tag: string
  isNew: boolean    // true if not in dictionary
  confidence: number // 0-1, from LLM (optional, best-effort parse)
}
```

**Prompt design:**
- System prompt: `"Suggest 3–5 tags for the following Q&A pair. Prefer tags from the provided vocabulary. Return a JSON array of strings. Only suggest tags that genuinely describe the content."`
- User prompt includes:
  - Question + answer (answer truncated to ~1000 chars)
  - Current tag vocabulary (from dictionary): `"Available tags: [typescript, react, vue, ...]"`
  - Already-assigned tags (to avoid duplicating): `"Already tagged: [react]"`

**Vocabulary-aware logic** (uses tag dictionary from Phase 0):
- Load dictionary via `loadDictionary()`
- If dictionary size < `tagSoftLimit`: include full vocabulary, allow LLM to suggest new tags
- If dictionary size >= `tagHardLimit`: include vocabulary and add to system prompt: `"You MUST only use tags from the provided vocabulary. Do not suggest new tags."`
- For each suggested tag, call `resolveTag()` to check dictionary membership and resolve aliases
- Mark each suggestion as `isNew: true/false`

**Response parsing:**
- Parse JSON array from LLM response
- Strip markdown fences if present (same pattern as metadataService)
- Normalize: trim, lowercase
- Deduplicate against already-assigned tags
- Resolve aliases to canonical forms

### 2.2 IPC Wiring

| Channel | Handler | Renderer method |
|---------|---------|-----------------|
| `ai:suggestTags` | `suggestTags(input, existingTags)` | `window.api.aiSuggestTags(input, existingTags)` |

### 2.3 UI — Suggest Tags Button & Approval Flow

**Files:** `src/components/QAEditor.vue`, `src/components/QAEditForm.vue`

**Button:**
- Icon: `pi pi-sparkles`
- Label: "Suggest tags" (or just the icon for consistency with title button)
- Placed next to the tag AutoComplete input
- Disabled when no API key configured (same `hasApiKey` flag from Phase 1)
- Spinner during generation

**Suggestion display (approval flow):**

When suggestions arrive, show them as chips below the tag input:

- **Known tags** (in dictionary): rendered with default chip style (same as existing tags)
- **New tags** (not in dictionary): rendered with amber/yellow chip style + "NEW" badge
- Each suggestion chip has:
  - Click to accept → moves tag to the tag input (added to the QA pair)
  - "Accept all" button to add all suggestions at once
  - Dismiss (x) to reject individual suggestions

When a **new** tag is accepted:
- If enforcement is `strict`: show a confirmation dialog "Add '{tag}' to dictionary?" — if yes, add to dictionary and accept; if no, reject
- If enforcement is `warn`: accept the tag, auto-add to dictionary, show brief info toast
- If enforcement is `off`: accept the tag, auto-add to dictionary silently

### 2.4 Tests

**File:** `tests/tagSuggestionService.test.ts` (new)

| Test | Description |
|------|-------------|
| `suggests tags from vocabulary` | Mock provider returns known tags |
| `marks new tags as isNew` | Tags not in dictionary flagged |
| `respects hard limit (no new tags)` | Prompt enforces vocabulary-only |
| `resolves aliases` | Suggested alias maps to canonical |
| `deduplicates against existing` | Already-tagged items excluded |
| `parses JSON with markdown fences` | Cleanup logic |
| `handles LLM returning invalid JSON` | Error path, empty result |
| `handles empty vocabulary` | Works with no dictionary |

---

## Phase 3 — Semantic Search Completion

**Goal:** Close the one remaining gap: auto-generate embeddings on QA create/update so semantic search stays current without manual "Generate all embeddings" clicks.

### 3.1 Auto-Embed on Create/Update

**File:** `electron/ipc/handlers.ts`

Modify `qa:create` and `qa:update` handlers:

```typescript
ipcMain.handle('qa:create', async (_event, data: QACreateData) => {
  const pair = createPair(data)
  scheduleEmbedding(pair.id)  // fire-and-forget
  return pair
})

ipcMain.handle('qa:update', async (_event, id: string, data: QAUpdateData) => {
  const pair = updatePair(id, data)
  scheduleEmbedding(id)  // fire-and-forget
  return pair
})
```

**`scheduleEmbedding(id)`** — a helper that:
1. Checks if an API key is configured (via `loadSecrets()`) — if not, silently skips (offline-safe)
2. Calls `generateEmbedding(id)` in a `Promise` that is **not awaited** (background, non-blocking)
3. Logs errors but does not propagate them — embedding failure never breaks QA save

### 3.2 Tests

**File:** `tests/embeddingAutoGenerate.test.ts` (new)

| Test | Description |
|------|-------------|
| `create triggers background embedding` | Verify `generateEmbedding` called after create |
| `update triggers background embedding` | Verify called after update |
| `no API key: embedding skipped silently` | Offline-safe path |
| `embedding failure does not reject create` | Error isolation |

---

## Phase 4 — Legacy Retagging & Batch Tag Operations

**Goal:** Provide tools for normalizing existing tags across the archive — renaming legacy tags, merging duplicates, and handling tags that arrive via import.

### 4.1 Batch Retag Service

**File:** `electron/services/batchRetagService.ts` (new)

```typescript
export interface RetagOperation {
  type: 'rename' | 'merge' | 'delete'
  fromTag: string       // the tag to change
  toTag?: string        // target for rename/merge (not needed for delete)
}

export interface RetagResult {
  operation: RetagOperation
  pairsAffected: number
  pairIds: string[]
}

export async function batchRetag(operations: RetagOperation[]): Promise<RetagResult[]>
export async function previewRetag(operations: RetagOperation[]): Promise<RetagResult[]>
```

**`batchRetag` behavior:**
- For each operation, iterate all QA pairs:
  - `rename`: replace `fromTag` with `toTag` in `pair.tags`
  - `merge`: same as rename (merge two tags into one)
  - `delete`: remove `fromTag` from `pair.tags`
- Save modified pairs via `updatePair()`
- Update the tag dictionary accordingly (rename/remove entries)
- Return counts of affected pairs

**`previewRetag` behavior:**
- Same logic but read-only: returns what *would* change without writing

### 4.2 Import Tag Normalization

**File:** `electron/services/qaImportFormatService.ts` (modify)

When importing QA pairs, normalize tags against the dictionary:

- After parsing each imported QA block's tags:
  1. For each tag, call `resolveTag(tag)` from the dictionary
  2. If resolved (alias or exact match): use the canonical form
  3. If unresolved: keep as-is but flag it

**File:** `electron/services/fileImportService.ts` (modify)

After import parsing completes, add a `newTags` field to `ImportResult`:

```typescript
export interface ImportResult {
  // ... existing fields ...
  newTags: string[]  // tags found in import that are not in dictionary
}
```

The renderer can then prompt the user: "These imported tags are new: [foo, bar]. Add them to the dictionary?" This enables the user to approve or remap before saving.

### 4.3 IPC Wiring

| Channel | Handler | Renderer method |
|---------|---------|-----------------|
| `tags:batchRetag` | `batchRetag(ops)` | `window.api.tagsBatchRetag(ops)` |
| `tags:previewRetag` | `previewRetag(ops)` | `window.api.tagsPreviewRetag(ops)` |

### 4.4 Retag UI

**File:** `src/components/TagManagerDialog.vue` (extend from Phase 0)

Add a "Retag archive" section/tab to the Tag Manager:

- **Rename workflow:** Select a tag → type new name → "Preview" shows affected pair count → "Apply"
- **Merge workflow:** Select two tags → choose which to keep → Preview → Apply
- **Delete workflow:** Select tag → Preview shows affected pairs → "Remove from all pairs" or "Remove from dictionary only"
- **Import review:** After an import with new tags, show a dialog listing new tags with options per tag:
  - "Add to dictionary" (accept as new)
  - "Map to existing tag" (dropdown of dictionary tags)
  - "Ignore" (keep on imported pairs but don't add to dictionary)

### 4.5 LLM-Assisted Retagging (Optional Enhancement)

If an API key is available, offer a "Suggest remapping" button that:
- Sends the list of orphaned/legacy tags + current dictionary to the LLM
- LLM suggests mappings (e.g., "ts" → "typescript", "JS" → "javascript")
- User reviews and approves/rejects each suggestion

This is a nice-to-have within this phase; implement only if the core batch retag is solid.

### 4.6 Tests

**File:** `tests/batchRetag.test.ts` (new)

| Test | Description |
|------|-------------|
| `rename replaces tag across pairs` | Core rename |
| `rename updates dictionary` | Dictionary consistency |
| `merge combines two tags` | Merge behavior |
| `delete removes tag from pairs` | Deletion |
| `preview returns counts without writing` | Dry-run |
| `no-op when tag not found in any pair` | Edge case |
| `case-insensitive matching` | Normalization |

**File:** `tests/importTagNormalization.test.ts` (new)

| Test | Description |
|------|-------------|
| `import resolves known aliases` | Alias normalization |
| `import flags unknown tags as new` | New tag detection |
| `import preserves tags when dictionary missing` | Offline/bootstrap |

---

## Cross-Cutting Concerns

### Offline Safety Checklist

Every phase must pass this checklist before merging:

- [ ] No API key configured → all non-LLM features work identically to today
- [ ] LLM buttons show disabled state with clear tooltip ("Configure API key in Settings")
- [ ] LLM network error → toast with message, no data loss, no broken UI state
- [ ] Tag dictionary features work fully offline (Phases 0, 4)
- [ ] Embedding auto-generate silently skips when offline (Phase 3)

### Error Handling Pattern

All LLM service calls follow this pattern:
1. Service function throws on failure (with user-readable message)
2. IPC handler propagates the error
3. Renderer catches in try/catch, shows toast with `severity: 'error'`
4. UI element returns to idle state (spinner stops, button re-enabled)

### File Change Summary by Phase

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 0 | `electron/services/tagDictionaryService.ts`, `src/components/TagManagerDialog.vue`, `tests/tagDictionary.test.ts`, `tests/tagEnforcement.test.ts` | `electron/ipc/handlers.ts`, `electron/preload.ts`, `src/global.d.ts`, `electron/services/settingsService.ts`, `src/components/SettingsDialog.vue`, `src/components/QAEditor.vue`, `src/components/QAEditForm.vue` |
| 1 | `electron/services/titleService.ts`, `tests/titleService.test.ts` | `electron/ipc/handlers.ts`, `electron/preload.ts`, `src/global.d.ts`, `src/components/QAEditor.vue`, `src/components/QAEditForm.vue`, `src/stores/uiStore.ts` (or new `aiStore.ts`) |
| 2 | `electron/services/tagSuggestionService.ts`, `tests/tagSuggestionService.test.ts` | `electron/ipc/handlers.ts`, `electron/preload.ts`, `src/global.d.ts`, `src/components/QAEditor.vue`, `src/components/QAEditForm.vue` |
| 3 | `tests/embeddingAutoGenerate.test.ts` | `electron/ipc/handlers.ts` |
| 4 | `electron/services/batchRetagService.ts`, `tests/batchRetag.test.ts`, `tests/importTagNormalization.test.ts` | `electron/ipc/handlers.ts`, `electron/preload.ts`, `src/global.d.ts`, `electron/services/qaImportFormatService.ts`, `electron/services/fileImportService.ts`, `src/components/TagManagerDialog.vue` |
