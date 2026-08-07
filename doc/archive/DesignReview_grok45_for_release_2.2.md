# Code & Design Review Feedback
## Scope: V2 roadmap items **2.1 / 2.2 / 2.5** (and required infra)
**Audience:** ChatGPT 5.6 Terra coding agent
**Mode:** Review only — no code was changed in this pass
**Reviewer model:** Grok 4.5
**Date:** 2026-08-04

---

## 1. Executive summary

You delivered a **credible first cut** of:

- **2.5** multi-provider Settings surfacing (Ollama, Azure OpenAI, self-hosted OpenAI-compatible) behind experimental flags
- **2.1** review-first title suggestion (QA + single-thread rename)
- **2.2** initial QA title+tag suggestion in one completion call

Infrastructure already present and partially reused:

- Capability-split providers (`CompletionProvider` / `EmbeddingProvider`)
- Endpoint policies (loopback / Azure host allowlist / self-hosted trusted hosts)
- `batchRunner`, `usageLedger`, feature flags

**Do not treat this as “done” against the roadmap.** Several **correctness, stability, performance, and modularity** gaps remain. The biggest theme: **Phase 2 features were bolted on as a thin one-shot `suggestionService` path that bypasses the batch/guardrail platform Phase 0 was built for**, and **local/self-hosted providers are not yet production-hardened** (timeouts, cancel, capability honesty, secrets/status completeness).

Roadmap intent (from `doc/plans/V2_Master_Roadmap.md`):

- Phase 2 **depends on 0.1 + 0.2** so features are not one-off integrations
- **2.1/2.2** should be review-first and vocabulary-aware
- **2.5** must surface providers **and** degrade gracefully when embed is unavailable
- Local model **bundling** is **2.6 spike only** — Ollama/self-hosted as “local server access” is the right 2.5 interpretation

---

## 2. What looks good (keep)

1. **Review-first persistence for suggestions**
   - QA: draft-only merge in `src/components/QAEditForm.vue`; Save is explicit approval
   - Thread: rename draft only in `src/components/ThreadsPanel.vue`
   Matches roadmap “suggest → user reviews → write”.

2. **Experimental gating for new providers**
   - Flags in `shared/featureFlags.ts`
   - Factory re-checks enabled + capability in `electron/services/llm/providerFactory.ts`
   - Self-hosted HTTPS + trusted-host allowlist + packaged HTTP reject is the right security posture.

3. **Endpoint policies are pure and tested**
   - `electron/services/llm/localEndpointPolicy.ts`
   - `electron/services/llm/azureEndpointPolicy.ts`
   - `electron/services/llm/selfHostedEndpointPolicy.ts`
   Good modular boundary.

4. **Structured output validation on suggestions**
   - zod schemas in `electron/services/llm/suggestionService.ts`
   Better than bare `JSON.parse` cast used by legacy `electron/services/metadataService.ts`.

5. **IPC contracts exist** for `ai:suggestQa` / `ai:suggestThreadTitle` via shared channels + zod args.

6. **Docs honesty in roadmap/build-notes** about deferred batch thread titles / thread tags / workflow metadata is good — keep that accuracy, but close the gaps below before calling 2.1/2.2/2.5 complete.

---

## 3. Blocking / high-severity issues (fix before calling this done)

### H1 — Performance: `suggestThreadTitle` does archive-scale work
**File:** `electron/services/llm/suggestionService.ts`

```ts
const pairs = listAllPairs()
const excerpts = thread.items.slice(0, 20).flatMap(...)
```

`listAllPairs()` materializes the **entire archive** to title one thread. That violates `doc/guides/PERFORMANCE_AND_SCALABILITY.md` and the app’s archive cache design.

**Required fix:** resolve only `thread.items` (capped) via `getPair(id)` / indexed lookup. Never call full-archive list for a single-thread suggestion.

---

### H2 — Local/server providers have no request timeout or cancellation
**Files:**
`electron/services/llm/ollamaProvider.ts`,
`electron/services/llm/azureOpenAiProvider.ts`,
`electron/services/llm/selfHostedOpenAiProvider.ts`,
`electron/services/llm/anthropicProvider.ts`,
suggestion IPC handlers

Raw `fetch` with **no timeout**, **no AbortSignal**, **no response byte ceiling**. A hung Ollama/self-hosted server leaves “Suggest title & tags” spinning indefinitely and can stall main-side work depending on how the call is scheduled.

**Required fix:**

1. Shared LLM HTTP transport (see M1) with:
   - overall timeout (e.g. 20–60s, configurable later)
   - AbortSignal plumbing from IPC → provider
   - response size cap
2. Renderer cancel affordance (at least unmount/close edit cancels in-flight suggest)
3. Stable error: `timeout` / `cancelled` (no stack/body leakage)

This is **especially critical for 2.5 local server access** — the whole point of the task’s “infra first” ordering.

---

### H3 — INV-COST is incomplete for new call sites
**Files:** `electron/services/llm/usageLedger.ts`, `electron/services/llm/suggestionService.ts`, Phase 0 plan

Ledger **records after** success in adapters, but:

- no pre-call estimate / confirm for cost-bearing suggests
- no session hard limit / guard before fan-out
- `estimateBatchCost` exists and is unused by 2.1/2.2
- Application Status / Insights still show the thin token facade, not provider/model/cost completeness

Phase 0.7 exit condition was: *every* LLM call through one metered **guard**, with estimates before multi-call work. Single-shot suggests are still cost-bearing (especially Azure/OpenAI) and currently fire with one click / auto-open edit.

**Required fix (minimum for 2.1/2.2):**

1. Main-side `assertCanCallLlm({capability:'complete', estimatedTokens?})` used by suggestionService
2. Clear error when no provider/key/endpoint
3. Optional cheap local path (Ollama) should still count **calls** even at $0
4. Do **not** auto-fire LLM on `autoSuggest` without an explicit user gesture **or** a settings opt-in; current `startSuggestedEdit` → mount → auto call is aggressive

---

### H4 — Secrets / status path incomplete for new providers

1. **`electron/services/settingsDraftService.ts`**
   ```ts
   const KNOWN_SECRET_FIELDS = ['openaiApiKey', 'anthropicApiKey']
   ```
   Missing `azureApiKey`, `selfHostedApiKey`. Draft-apply path will drop/reject 2.5 keys when wired.

2. **`src/components/ApplicationStatusDialog.vue`**
   ```ts
   const key = provider === 'anthropic' ? 'anthropicApiKey' : 'openaiApiKey'
   ```
   Azure/self-hosted always look unconfigured. Status must use `provider.apiKeyField` / descriptor.

3. **`settingsSave` IPC** still bypasses `validateSettings` / draft apply (`electron/ipc/handlers.ts`).
   Draft validation also calls `getProviderDescriptor(settings.llmProvider)` **without** `experimentalFeatures`, so experimental providers always look disabled in that validator. Fix both when closing 2.5.

---

### H5 — Embed capability is advertised, not proven (2.5 incomplete)
Roadmap 2.5: *“including embed-capability detection so semantic search degrades gracefully.”*

Today registry hardcodes `embed: true` for Ollama/Azure/self-hosted. Reality:

- Ollama model may be chat-only
- Azure embed deployment may be unset/wrong
- Self-hosted may not implement `/embeddings`

UI only shows static `notes`; semantic search / embedding generation will fail at runtime with generic errors.

**Required fix:**

1. Capability matrix remains **declared**, but add **runtime readiness**:
   - connection test optionally probes embed when declared
   - or separate “Test embeddings”
   - or probe on first embed and cache `embedReady: false` with reason
2. Settings + Semantic search UI must show:
   “Selected provider cannot embed / embed not verified — semantic search unavailable”
   using capabilities **and** last probe, not provider-name switches.

---

### H6 — Two parallel AI-labeling pipelines still ship side-by-side
Roadmap Observation 4 / 2.2: one vocabulary-aware tagging path; don’t rebuild metadata labeling twice.

Still present:

| Path | Behavior | Problem |
|---|---|---|
| **Suggest title & tags** | review-first, tags[] | good direction |
| **AI Metadata** (`metadataService`) | immediate write of `aiTopic`/`aiConcepts`/status/confidence; weak JSON parse; uses `getProvider()` | parallel labeling; no review; no zod; overwrites without approval |

**Required direction for this task (even if full 0.8 migration stays deferred):**

1. Do **not** leave “AI Metadata” as an unsupervised write of open-vocabulary labels that duplicate tags.
2. Either:
   - gate/hide AI Metadata behind “legacy” until 2.3/0.8, **or**
   - make it review-first and stop writing `aiTopic`/`aiConcepts` as the primary classification path
3. Share one structured-completion helper (see M2).

Leaving both buttons equally prominent is a product/design defect, not just debt.

---

## 4. Medium issues (correctness, UX, stability)

### M1 — No shared OpenAI-compatible transport
Ollama / Azure / Self-hosted each reimplement post/json/error mapping.
Anthropic still hand-rolled `fetch` (Phase 0 still wanted SDK migration).

**Refactor target:**

```text
llm/
  transport/
    httpJson.ts          # timeout, abort, byte cap, injectable fetch
    errors.ts            # stable coded errors
  openaiCompatible/
    chatCompletions.ts
    embeddings.ts
  providers/
    ollama.ts            # thin config + policy + paths
    azureOpenAi.ts
    selfHostedOpenAi.ts
```

This is the main modularity win for 2.5 and future local servers.

---

### M2 — Duplicated structured-output parsing
Fence strip + JSON parse exists in:

- `suggestionService`
- `batchRunner.stripJsonFences`
- `metadataService`

**Refactor:** one `parseModelJson(schema, raw)` used by suggestions, batch jobs, metadata.

---

### M3 — 2.1/2.2 ignore batch runner (0.2) for the multi-item future
Single QA/thread one-shot is OK as MVP, but:

- no job id / progress / cancel registry
- no stale contentHash apply path (renderer draft is fine for single edit; batch will need runner)
- annotation already uses `runBatchJob`; suggestions reinvent a weaker path

**Required design:**

- Keep interactive single-item suggest as a thin wrapper:
  `generateStructured(provider, schema, prompts)`
- Multi-select / multi-thread titles **must** go through `batchRunner` + feature flag `batchLlmJobs` + estimate
- Do not invent a third batch implementation later under “2.2.1”

Also: roadmap does not define “2.2.1”; if batch multi-thread is deferred, record it as an explicit backlog ID in build-notes/roadmap, not a phantom subsection.

---

### M4 — Tag suggestion UX does not match LLM Ch.2 / roadmap 2.2

Spec/roadmap expect:

- prefer existing vocabulary
- soft/hard limits
- **approval chips**: existing vs new (blue/yellow)
- only approved tags written

Current behavior:

- main returns normalized tags
- renderer merges into draft
- **strict**: silently drops unknown (no user-visible “rejected N new tags”)
- **warn**: on Save, auto-`tagsAdd` for new tags (side effect, not an explicit approval step)
- no distinct suggestion-origin chip styling
- main does not re-enforce dictionary/hard limit (renderer-only)

**Required improvements:**

1. Return structured suggestion:
   `{ title, tags: [{tag, status:'existing'|'new'|'rejected', reason?}] }`
2. Enforce vocabulary policy **in main** (single authority)
3. UI: show new vs existing; require explicit accept for new in warn/strict
4. Never auto-add dictionary entries as a silent Save side effect of AI merge without user intent

---

### M5 — `local: true` conflates billing and trust boundary
Self-hosted LAN DGX is marked `local: true` → usage cost always $0.

That may be monetarily true, but:

- it is **not** loopback-only
- treating it like Ollama hides “remote machine dependency” in status/metrics

**Split concepts:**

- `deployment: 'loopback' | 'lan' | 'cloud'`
- `billsTokens: boolean`
Don’t overload `capabilities.local`.

---

### M6 — Provider factory / settings validation gaps

1. `validateSettings` ignores `experimentalFeatures` → experimental providers always “disabled”.
2. No validation that required connection fields exist when provider is selected:
   - Azure: endpoint, apiVersion, deployment (model), key
   - Ollama: reachable endpoint optional at save-time, but model required
   - Self-hosted: endpoint + trusted host if non-loopback
3. Saving a half-configured experimental provider should fail closed with a field-level reason, not later at first Suggest click.
4. Stale file comments still say Ollama/Azure “not wired into factory/UI yet” — update or delete.

---

### M7 — Prompt/context bounds are weak

- QA suggest sends **full** question+answer (archive-scale bodies possible)
- Thread suggest truncates question to 600 chars but still can send 20 large titles + slices
- No token estimate; no truncation strategy shared with batch annotation

**Required:** shared `buildBoundedQaContext(pair, limits)` used by suggest, metadata, batch jobs.

---

### M8 — Discoverability vs cost surprise
Roadmap wants inline suggestions without hidden menus — good that buttons exist.

But:

- Content-panel button opens editor **and** immediately spends an API call
- No disabled state when provider/key/endpoint missing (fails only after click)
- No indication of active provider/model on the button tooltip

**Required UX:**

- Disable + tooltip when completion provider not ready
- Show provider/model in tooltip
- Prefer explicit click inside editor over auto-invoke on open, unless user enabled “auto-suggest on edit”

---

### M9 — Tests are thinner than the claim surface

Present: adapter policy tests, factory capability tests, batch runner tests.

Missing / insufficient:

- `suggestionService` unit tests (vocab strict/hard limit, zod reject, thread uses getPair not listAll, title clamp)
- factory construction tests for ollama/azure/self-hosted with mocked settings/secrets/flags
- settings save validation for providerConnections
- secrets field ownership for azure/selfHosted
- Application Status key field mapping
- no timeout/abort tests on transport
- no renderer test that suggest merges draft and does not call update until Save

Build-notes “56 passed focused” is not a substitute for these.

---

### M10 — QA creation path
LLM Integration Spec Ch.1/2 mention **QAEditor** generate affordance. Current work is edit-form centric.

If new-QA create is in scope for 2.1/2.2, add the same review-first control there; if out of scope, say so explicitly in build-notes/roadmap status (not silent omission).

---

## 5. Lower-priority / cleanup

1. **Registry `supportsModelDiscovery: false` for Ollama** — many Ollama installs support `/api/tags`; optional discovery would improve 2.5 UX.
2. **Azure `testConnection` does a real completion** — wasteful; prefer deployments list or minimal embeddings/models probe.
3. **Pricing table** only knows a few OpenAI models; Azure deployment names will always show cost unavailable — OK if UI says so, bad if it pretends completeness.
4. **Feature flag UI** hides `batchLlmJobs` in Settings experimental list while other flags show — inconsistent; either expose all experimental flags in one section or document why batch is hidden.
5. **Default Anthropic model string** `claude-sonnet-5` / catalog fantasy IDs — pre-existing, but 2.x should not make model ownership worse; validate model ids where catalogs exist.
6. **README / in-app help** — AGENTS checklist requires user-facing docs when features ship; verify README shortcuts/workflows mention Suggest + experimental providers.

---

## 6. Design review vs roadmap sequencing

### What the prompt asked
> Implement 2.1, 2.2, 2.5, but first ensure infrastructural elements are done (2.5, local server model access).

### Correct sequencing interpretation
1. **Infra / local server access (2.5 + 0.1 wiring)**
   - adapters
   - factory
   - settings
   - secrets
   - test connection
   - capability/readiness
   - timeouts/guards
2. **Then** product features 2.1/2.2 on top of shared completion + structured output + review UX
3. **Reuse 0.2 batch runner** for any multi-target path
4. **Do not** implement 2.6 model bundling

### What actually happened (assessment)
| Area | Status | Grade |
|---|---|---|
| 0.1 adapters exist | Done earlier | Good |
| 2.5 Settings surfacing | Mostly done | B |
| 2.5 hardened local access (timeout/cancel/readiness) | Incomplete | D |
| 2.5 secrets/status completeness | Incomplete | C- |
| 2.1 single QA/thread title | MVP done | B- |
| 2.2 unified tagging UX/policy | Partial MVP | C |
| Reuse of 0.2/0.7 platform | Weak | C- |
| Parallel metadata path cleaned up | Not done | D |

**Verdict:** Acceptable as an **initial spike/MVP branch**, **not** as a closed Phase 2.1/2.2/2.5 delivery.

---

## 7. Required remediation plan (for the coding agent)

Work in this order. Do not expand into 2.3/2.4/2.6.

### P0 — correctness & stability (must)
1. Fix `suggestThreadTitle` to avoid `listAllPairs()`; use per-id reads only.
2. Introduce shared LLM HTTP transport with timeout + AbortSignal + size cap; use it for Ollama/Azure/self-hosted (and ideally Anthropic until SDK lands).
3. Plumb cancel from suggestion IPC/UI.
4. Complete secrets ownership: `azureApiKey`, `selfHostedApiKey` everywhere (draft service, status UI, tests).
5. Fix `validateSettings` to pass `experimentalFeatures` and validate provider connection required fields; stop saving unusable provider configs silently.
6. Add main-side readiness check before suggest (provider enabled, complete capability, key/endpoint present).
7. Add unit tests listed in M9 for the above.

### P1 — 2.5 completion
1. Embed readiness probe + UI degradation for semantic search / generate embeddings.
2. Connection test behavior matrix per provider (no unnecessary paid completion if avoidable).
3. Refresh stale adapter comments; document experimental setup in README.
4. Split `local` vs loopback vs billable in usage/status if self-hosted LAN remains supported.

### P2 — 2.1/2.2 product quality
1. Shared `parseModelJson` + bounded context builder.
2. Structured tag suggestion result with existing/new/rejected; main enforces vocabulary policy.
3. Chip/approval UX in editor; no silent dictionary mutation.
4. Disable/tooltip when AI not configured; remove or gate auto-invoke-on-open.
5. Decide explicit fate of **AI Metadata** button for this release (hide, legacy, or convert to review-first non-tag fields only).
6. Define multi-target title/tag jobs on `batchRunner` + `batchLlmJobs` (even if UI bulk entry is a fast-follow, the service API should not be a third path).

### P3 — modularity cleanup (same PR series if small; else follow-up)
1. OpenAI-compatible provider core.
2. Single suggestion application module used by QA + thread UIs.
3. One Settings “Provider connection” subform component parameterized by provider id (Ollama/Azure/Self-hosted fields are copy-pasted).

---

## 8. Acceptance criteria (definition of done)

Do not mark 2.1/2.2/2.5 done until all are true:

1. **Local server path:** With only Ollama experimental flag + local server, user can Test connection, Suggest title/tags, and fail fast with clear errors if server down/model missing; hung server times out; UI can cancel.
2. **No archive-scale work** on single suggest/title action (verified by test or code review of call graph).
3. **Suggestions never write archive data** without explicit Save.
4. **Tag policy enforced in main**, with visible handling of new vs existing tags.
5. **Azure/self-hosted keys** save/load/status/test correctly end-to-end.
6. **Embed-incapable or embed-unready providers** disable/degrade semantic embedding flows with explicit messaging.
7. **No second unsupervised labeling write path** competing with Suggest for open-vocabulary labels (AI Metadata resolved per P2.5).
8. **Tests:** new unit coverage for suggestionService, factory experimental providers, secrets fields, transport timeout/abort; `npm run build` green.
9. **Docs:** README + build-notes + roadmap status lines match actual behavior and explicit deferrals.

---

## 9. Out-of-scope reminders (do not silently absorb)

- 2.3 workflow typing / learn-from-marking
- 2.4 thread compression
- 2.6 bundled local model
- Full Phase 0.8 AI metadata migration program (unless a **narrow**, separately approved slice is required to stop dual-write of `aiTopic`/`aiConcepts`)
- Multi-select batch title generation UI (OK as fast-follow, but must use batchRunner)

---

## 10. Bottom line for the agent

You built the right **shape** of MVP: experimental local/remote providers in Settings + review-first suggest actions.

You under-built the **platform obligations** that make those features safe at archive scale and with real local servers:

- bounded/cancellable network I/O
- no full-archive reads for one thread
- complete secrets/status/validation for new providers
- honest embed readiness
- one structured-completion + policy path instead of parallel metadata/suggest stacks
- real reuse of batch/usage guardrails for anything beyond a single click

**Revise along the P0→P2 plan above; re-request review after P0+P1 are green.**
