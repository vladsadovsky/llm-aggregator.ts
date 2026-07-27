Here's the review of the three commits from Fri 21:25–21:41 on vlads-dev.

1. What was built
Three commits, two features and one research doc:

Commit	Scope
4baccdc	Provider catalog + Anthropic provider. New providerRegistry, modelCatalogService (506 lines), anthropicProvider, two IPC channels (ai:listProviders, ai:listModels), dynamic model picker in Settings with quality/cost/latency hints. Plus a 293-line secrets-storage plan doc.
13535a1	allowDevEnvSecrets + devEnvSecretPrefix settings, dev-only UI controls.
cb3840a	Export-targets feasibility research doc (Notion / OneNote / Apple Notes / Gemini Notebook).
The goal is coherent: replace the hardcoded provider/model dropdowns with a data-driven catalog so providers become an extension point, and finally make llmProvider: 'anthropic' do something other than throw 'not yet implemented'.

2. Architecture
What works well:

The registry → catalog → factory split is the right shape. providerRegistry.ts is a pure data table, providerFactory.ts:14-30 validates against it, and the openai-compatible kind is already carved out as the future extension point. Widening llmProvider from a union to string (with runtime validation at the factory) is correct for an open provider set.
Three-tier fallback (api → cache → static curated) with a user-visible warning string is a good degradation model — the picker keeps working offline.
Capability negotiation via supportsModelDiscovery / the embeddings-are-OpenAI-only note, surfaced in the UI and used to disable the embeddings button, is the correct way to handle asymmetric provider capabilities.
Where the design is wrong or incomplete:

modelCatalogService.ts is doing four jobs: provider dispatch, HTTP clients for two vendors, the curated-hints database, and cache persistence. The dispatch is a hardcoded if (providerId === 'openai') … if (providerId === 'anthropic') … chain — which is exactly the coupling the registry was introduced to remove. Adding a third provider means editing this file, not adding a row. The natural shape is a fetchModels function (or null) on the descriptor, or a per-provider *Catalog.ts module keyed off kind.

The Anthropic client is hand-rolled fetch when an official SDK exists. anthropicProvider.ts reimplements what @anthropic-ai/sdk provides. The OpenAI path gets automatic retry on 429/5xx, a 10-minute default timeout, and typed error classes from its SDK; the Anthropic path gets none of that. This isn't stylistic — it's the root cause of findings S1, S3, and S5 below. The project already takes an SDK dependency for OpenAI; the asymmetry has no justification.

The catalog is written to a mutable cache but the resolution order is cache-first, unconditionally. modelCatalogService.ts:416-418 returns the cache whenever it exists, with no TTL — despite fetchedAt being recorded on every entry. Once a user has a catalog, it never refreshes without a manual Refresh click. New models never appear.

The API key override through IPC (handlers.ts:165-178) is a pragmatic solution to a real UX problem (refresh before save), but it makes the IPC surface stateful-by-parameter. ai:listModels(providerId, forceRefresh, openaiKey, anthropicKey) grows one positional param per provider. An options object ({ forceRefresh, apiKeyOverride }) scoped to the requested provider would scale and would stop the renderer from sending both keys on every call.

3. Code review — stability and security
Ranked by severity.

S1 — max_tokens: 2000 will truncate or blank Claude responses ⚠️ correctness
anthropicProvider.ts:79 hardcodes max_tokens: 2000 with no thinking parameter. On the exact models this catalog offers, that's a live bug:

On claude-sonnet-5 (the factory default) and claude-opus-5, adaptive thinking is on by default when thinking is omitted. max_tokens caps thinking plus response text together.
So a metadata-generation call can spend its whole 2000-token budget thinking and return zero text blocks.
complete() then filters to type === 'text', joins nothing, and returns '' — silently. No error, no stop_reason check. The caller sees an empty completion and can't tell truncation from a real empty answer.
Fix: raise max_tokens (~16000 for non-streaming), and check stop_reason before trusting the content. Also handle stop_reason: 'refusal' — Opus 5 and Sonnet 5 both run safety classifiers that return HTTP 200 with an empty content array, which currently also degrades to a silent ''.

S2 — Anthropic usage is invisible to the token tracker
openaiProvider.ts:57-59 calls addLlmTokens(...) on every completion. AnthropicProvider.complete() does not — it discards the usage block entirely. The app has a token-stats surface (aiGetTokenStats, ai:getTokenStats) that will report 0 tokens for all Claude traffic. Users will believe AI features are free. Parse response.usage.input_tokens / output_tokens and feed the tracker.

S3 — No timeout or cancellation on any Anthropic HTTP call
Neither anthropicProvider.ts:41 nor modelCatalogService.ts:331 passes an AbortSignal. Node's fetch has no default timeout. A hung TCP connection blocks the IPC handler forever; in Settings, loadingModelCatalog stays true, the spinner never stops, and there's no cancel path. AbortSignal.timeout(30_000) on both, minimum.

S4 — saveCatalogCache can turn a successful fetch into a user-facing failure
modelCatalogService.ts:194-201 does an unguarded writeFileSync. It's called at line 433 after a successful API fetch. A read-only userData dir or a full disk throws, the exception escapes listProviderModels, and the user sees "Model list unavailable" despite the network call having succeeded. Every sibling service (secretsService.ts:33, settingsService) wraps its I/O in try/catch; this one doesn't. Cache-write failure should be a logged warning, not a thrown error.

S5 — Network-error detection by substring matching
anthropicProvider.ts:15-21 classifies errors with message.includes('network') || message.includes('fetch') || message.includes('timeout'). This works today only because undici happens to throw TypeError: fetch failed — the actual cause lives in err.cause.code. It's locale- and runtime-fragile, and it will also swallow any API error whose response body happens to contain the word "timeout". Compare openaiProvider.ts:8-33, which checks NodeJS.ErrnoException.code against a set — the correct pattern, already in the repo, not reused here.

S6 — Unvalidated cache deserialization
modelCatalogService.ts:187 does JSON.parse(raw) as CatalogCache — a cast, not a validation. A truncated or hand-edited model-catalog-cache.json produces an object whose models may be undefined; that value is then spread into a result and returned to the renderer, where result.models.find(...) throws. Low blast radius (local file, no privilege boundary crossed), but the shape should be checked before it's trusted, and the warning string it feeds is rendered directly into the Settings UI.

S7 — Error response bodies flow into UI text
modelCatalogService.ts:339-347 and anthropicProvider.ts:46-54 append the full HTTP response body to the thrown message, which reaches modelCatalogWarning and is rendered in Settings (SettingsDialog.vue) plus logged via debugError. Provider error bodies don't echo API keys today, so this isn't an active leak — but it's unbounded third-party text rendered in the app chrome, and it directly contradicts the rule the author wrote in their own plan doc the same evening: "No secrets in UI or logs". Truncate, and keep the raw body in main-process logs only.

S8 — Cross-provider model mismatch can be persisted (race)
The watch(llmProvider, …) handler (SettingsDialog.vue) only resets llmModel if the new provider's catalog is already loaded; otherwise it fires an async loadModelCatalog(). Save is not gated on that promise. Switch to Anthropic and hit Save fast enough and you persist llmProvider: 'anthropic' with llmModel: 'gpt-4o'. providerFactory.ts:26 uses settings.llmModel || 'claude-sonnet-5' — 'gpt-4o' is truthy, so it goes straight to the Anthropic API and 404s. Guard save on catalog load, or validate model-belongs-to-provider in the factory.

S9 — Dead branch and loose model filter
modelCatalogService.ts:500: providerId === 'anthropic' ? ANTHROPIC_STATIC : [] is unreachable — the anthropic branch returned at line 454.
modelCatalogService.ts:233: id.startsWith('o') matches omni-moderation-latest and anything else beginning with "o". The exclusion list is a blocklist where an allowlist is wanted.
handlers.ts:174: const secrets = loadSecrets() is misindented inside the handler.
Model IDs themselves are correct — claude-opus-5, claude-sonnet-5, claude-haiku-4-5 are all valid current IDs, no bogus date suffixes, and the required x-api-key + anthropic-version: 2023-06-01 headers are right. The tier metadata (Opus premium / Sonnet balanced / Haiku budget) matches actual pricing. Notably, 13535a1 also fixed a latent bug: the old hardcoded list had claude-haiku-4-5-20251001 and claude-opus-4-6, now correctly replaced.

4. Documentation
The README documents a feature that does not exist. This is the most important doc finding.

README.md says:

When enabled, the app checks prefixed environment variables first (for example, LLM_AGG_OPENAI_API_KEY …) before local secret storage.

It does not. I grepped the whole electron/ tree: devEnvSecretPrefix is read in settingsService.ts:69-75 purely to normalize and persist it, and loadSecrets() (secretsService.ts:22-37) never touches process.env. The author knew this — build-notes.md correctly says "This is plumbing only… without changing existing secrets backend behavior yet." The README makes the opposite claim to end users, who will set the env var, watch it be ignored, and have no way to tell why. Either mark it "not yet active" in the README or don't ship the checkbox.

Related: the claim "ignored in packaged production builds" is currently true only because nothing reads it. The renderer gate is import.meta.env.DEV, a Vite compile-time constant — that hides the UI, but the setting persists in settings.json regardless and would be honored by a future main-process reader. The plan doc's §Resolution order correctly requires !app.isPackaged; that guard must land in the main process, not just the renderer, or the README's promise becomes false the moment the feature is implemented. Also: devEnvSecretPrefix is free-form text that will be concatenated into an env var lookup — it needs /^[A-Z0-9_]*$/ validation before that happens.

Other doc gaps:

USAGE.md was not updated at all. It still says "enter your OpenAI API key" (line 11), "Provider | AI provider (currently OpenAI; Anthropic coming)" (line 158), and lists only GPT models (line 159). USAGE.md is the end-user document; a user reading it has no idea Anthropic shipped. README got the update, USAGE.md didn't.
CLAUDE.md is stale — "Anthropic provider implementation" is still listed under Planned Enhancements (Future Work), and the IPC table doesn't include ai:listProviders / ai:listModels.
No tests. tests/unit/ has three files; nothing covers the catalog fallback chain, the cache, or the provider factory's new validation — despite the plan doc specifying a resolver precedence matrix as required unit tests. The pure functions here (sortModels, hintFor*, modelLooksLikeTextCompletionModel, the fallback branches) are trivially testable.
The README changes that were made are good: the numbered LLM Lens setup flow, the explicit OpenAI-vs-Anthropic split, and calling out model-catalog-cache.json by name are all the right level of detail.

5. Critique — cb3840a (Export Targets Feasibility Research)
Strengths: genuinely useful, correctly scoped ("research only, no design"), every claim carries a source URL, and it records the negative result (no public Gemini Notebook write API) with the method used to establish it. Recording what you looked for and didn't find is the part most feasibility docs skip.

Problems, roughly by impact:

It ignores the repo's own existing work on this exact problem. doc/plans/OneNote_Export_Agent_Spec.md and doc/plans/Export to file_Spec.md already exist (added in 192571c), and build-notes explicitly records that export was built as a format/transport split — qaExportFormatService + fileExportService — "so future non-file targets (OneNote, etc.) can reuse the formatter/parser." The new doc mentions none of it and reads as greenfield research. This isn't a cosmetic omission: the Gemini Notebook "indirect" path the doc recommends (emit Markdown/DOCX/PDF → upload to Drive) maps almost exactly onto the existing file exporter plus one new transport. Grounding the research in that seam would materially lower the effort estimate for the doc's own top recommendation.

The headline verdict is an average that hides the answer. Executive summary: "Gemini Notebook: medium feasibility overall." The matrix: Low (direct) / High (indirect). There is no "medium" case — direct is off the table, indirect is strong. Averaging two very different numbers into one produces the least actionable of the three.

Feasibility is assessed against no product context. Apple Notes gets "Low to medium… local/macOS automation." This app ships MSI packaging with Windows-specific archive defaults. For this product Apple Notes is not low-feasibility, it's not applicable on the primary platform — a different statement that would change how much space it deserves.

No auth or secret-storage dimension. Notion and OneNote are both "High," but both require OAuth app registration, a consent flow, and refresh-token storage. This app stores API keys in plaintext secrets.json — and the author wrote a 293-line plan to fix that sixteen minutes earlier in the same session. The two commits are coupled and the doc doesn't say so. Rating an integration "high feasibility" while omitting that it's blocked on unfinished credential infrastructure overstates readiness.

A feasibility study with no recommendation. There's no "what we do next" — no proposed first target, no phasing, no decision. The reader has to re-derive the conclusion the author already reached. One paragraph ("Phase 1: X, because Y; defer Z until W") would make this actionable.

No expiry or re-verification trigger. The doc itself flags product-evolution risk and a mid-flight NotebookLM→Gemini Notebook rename, then gives the findings no shelf life. "Re-verify before implementation if >90 days old" costs one line.

Minor: every heading is ##, including subsections like "High confidence" that belong under "Confidence and Unknowns" — the outline is flat and TOC generators will mangle it. And the "Appendix: API Discovery Verification Snippet" contains no snippet, just a prose summary of one; nobody can reproduce the query from what's written.

Suggested priority
#	Item	Why
1	S1 — max_tokens + stop_reason handling	Silent wrong answers on the default Claude model
2	README env-secrets claim	Documents non-existent behavior to users
3	S2 — token tracking	Users under-count real spend
4	S3/S4 — timeouts, cache-write guard	Hangs and false failures
5	USAGE.md + CLAUDE.md	Feature is invisible in the user-facing doc
6	Move to @anthropic-ai/sdk	Retires S3, S5, and half of S1 in one change
I haven't changed anything — say which of these you want me to take on.




==================================

Done. All six decisions implemented; typecheck clean, lint 0 errors, 82 tests pass (28 new).

One thing to look at before you commit: doc/plans/UX_ImprovementPlan.md shows as modified, but it isn't mine. It's a pre-existing working-tree change that strips leftover <<<<<<< Updated upstream / >>>>>>> Stashed changes conflict markers (from the WIP on master stash in your log), plus a line-ending normalization. I left it alone — you'll want to commit it separately from the secrets work.

What changed
New — electron/services/secrets/

File	Role
secretBackendTypes.ts	SecretBackend contract, error taxonomy, SecretsStatus, maskSecret()
backends/envSecretsBackend.ts	Dev-only read-only overlay; owns the fixed LLM_AGG_ prefix
backends/safeStorageSecretsBackend.ts	OS-encrypted envelope → secrets.enc.json
legacyCleanup.ts	Startup rename of legacy plaintext → .orphaned.bak
secretResolver.ts	Precedence, partial save, status projection — pure, no Electron imports
secretsService.ts became the composition root and is the only file importing electron. That's what keeps the chain unit-testable in Node, matching your existing defaultDataDirectory.test.ts pattern.

Two design points worth your attention:

loadSecrets() stayed synchronous, so all 11 getProvider() call sites are untouched. That was the main payoff of choosing safeStorage over a keyring module.

The save merge base is the write target's own contents, not the resolved chain. Using the chain would have copied an env-supplied key into encrypted storage the first time a user saved any unrelated setting — silently converting a temporary dev override into a persisted secret. There's a dedicated regression test (never persists an env-supplied value into storage).

Also fixed in passing (from the review, since I was in the files): the unguarded catalog-cache write that turned a successful fetch into "model list unavailable", the unreachable anthropic branch, and the dual-key discovery override collapsed to one scoped apiKeyOverride.

Documentation
README — the section claiming env vars were consulted is now true, plus a storage/precedence table and an upgrade note.
USAGE.md — had never been updated for Anthropic at all; now covers the provider picker, write-only key field, and the upgrade path.
CLAUDE.md — IPC table, file map, and "Anthropic provider implementation" moved out of Future Work into a sequenced in-flight list.
doc/plans/Secrets_Storage_Design_and_Implementation.md — the spec you asked for. Includes a maintenance contract ("if the two disagree, the code is right and this file is a bug"), rationale for each decision with alternatives considered, contracts and invariants, the on-disk format, and an explicit security properties and limits section listing what does not hold — the .orphaned.bak clear-text residual, safeStorage's same-user limitation, and Linux keyring fallback.
The original plan doc now carries a status banner and a divergence table rather than silently misdescribing the code.
What I have not verified
I ran typecheck, lint, and unit tests — I did not run the app. Unverified at runtime: the Settings dialog rendering and dirty-tracking, the IPC round-trip, real safeStorage encryption, and the startup legacy sweep against a real userData directory. The unit tests use a reversible fake for safeStorage (it proves the envelope round-trips and that plaintext isn't on disk — it is not encryption).

Worth doing before you trust the migration path: put a dummy secrets.json in userData, launch, and confirm the rename plus the Settings warning.

Next in the sequence you set is the Anthropic SDK migration — that's where the max_tokens: 2000 truncation and the token-tracker blind spot get fixed. Say the word and I'll start.