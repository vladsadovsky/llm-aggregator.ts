# Secrets Storage — Design and Implementation Specification

**Status:** V1 Steps 1–5 implemented. Step 6 (legacy migration) deferred.
**Last updated:** 2026-07-25
**Supersedes as source of truth:** [`Secrets_Storage_Resolution_and_Migration_Plan.md`](./Secrets_Storage_Resolution_and_Migration_Plan.md)
(kept for original intent and rationale; its divergence table lists what changed).

> **Maintenance contract.** This document describes what the code *does*, not what
> was once intended. Any change to `electron/services/secrets/**`, `secretsService.ts`,
> the `secrets:*` IPC channels, or the API-key portion of `SettingsDialog.vue` must
> update this file in the same commit. If the two disagree, the code is right and
> this file is a bug.

---

## 1. Problem statement

Before this work, API keys were written to `<userData>/secrets.json` in clear text by
`secretsService.ts`, loaded into the renderer on every Settings open, and held in Vue
refs for the dialog's lifetime. Three distinct problems:

1. **At rest** — any process or person with read access to the user profile could read
   the keys. Backup and sync tooling (OneDrive, Time Machine) copied them verbatim.
2. **In memory** — the values crossed the IPC boundary into the Chromium renderer,
   where they sat alongside markdown rendered from untrusted archive content.
3. **Advertised but absent** — commit `13535a1` shipped an `allowDevEnvSecrets` setting
   and a README paragraph claiming environment variables were consulted first. No code
   ever read `process.env`. Users could enable the toggle and observe nothing happen.

The goal of V1 is to close all three: encrypt at rest with an OS-held key, stop sending
key values to the renderer at all, and make the advertised env override real and safely
gated.

---

## 2. Design decisions and rationale

Each of these was an explicit choice with alternatives considered; they are recorded so
a future reader does not have to re-derive them.

### 2.1 Electron `safeStorage` instead of keytar or a keyring native module

The original plan called for a `keychain` backend ("keytar-style") plus a separately
encrypted file. Three problems: keytar is archived and unmaintained; any true keyring
binding is a **native module** that must be rebuilt per Electron version and complicates
the MSI packaging this project already ships; and every such binding is **async**.

Electron's built-in `safeStorage` gives OS-held key material — DPAPI on Windows,
Keychain on macOS, libsecret/kwallet on Linux — with no native dependency, and its API
is synchronous.

The synchronous property is load-bearing, not incidental. `loadSecrets()` is called by
`getProvider()`, which has **11 call sites** across `metadataService`, `embeddingService`
(3), `insightsService` (5), `annotationService`, and `handlers.ts`. An async backend
would have forced `getProvider()` async and cascaded through all of them. Choosing
`safeStorage` reduced the blast radius of this change to zero outside the secrets module.

**Consequence:** the plan's two storage tiers collapse into one. There is no separate
"encrypted file fallback" — if `safeStorage.isEncryptionAvailable()` is false, keys
cannot be stored at all, and the UI says so rather than silently downgrading to a
weaker scheme. This is deliberate: a fallback the user does not know is weaker is worse
than a refusal they can see.

### 2.2 Write-only renderer

Encrypting at rest achieves little if the plaintext is then shipped to the renderer on
every dialog open. `secrets:load` therefore returns a `SecretsStatus` — presence, a
masked preview, and provenance — and never a key value.

This forces per-field dirty tracking in the UI (§5.3): with no value to round-trip, an
untouched field must send *nothing* rather than sending back what it was given.

### 2.3 Env override requires setting **and** `!app.isPackaged`

`settings.json` lives in the user profile and travels with it. A user who enables the
dev override on a development machine and later installs a packaged build would
otherwise have the override silently active in production. Both conditions are checked,
in the main process — the renderer's `import.meta.env.DEV` gate only hides the UI.

### 2.4 Fixed `LLM_AGG_` prefix

A configurable prefix is concatenated into a `process.env[...]` lookup and must remain a
legal environment-variable name, which means validation, an error state, and a drift
risk between the "Expected keys: …" hint and the actual lookup. A constant removes all
of that for no loss of capability.

### 2.5 Legacy plaintext is orphaned, not migrated

The resolver never reads `secrets.json`. On startup it is renamed to
`secrets.json.orphaned.bak`; users re-enter their key once.

This is a product decision, not a technical constraint, and it has a real cost: users
lose their stored key with no in-app recovery. It was chosen over auto-migration to keep
Step 6's verification/reporting machinery out of this change. Two mitigations are in the
code: the rename preserves the value on disk so it *is* manually recoverable, and a
warning is surfaced in Settings for as long as the backup exists.

**Known residual risk:** the `.orphaned.bak` file is still clear text. Step 6 or a purge
action should close this. The warning exists so the user can close it themselves in the
meantime.

---

## 3. Architecture

```
                    ┌──────────────────── renderer ────────────────────┐
                    │  SettingsDialog.vue                              │
                    │    keyDrafts (typed values only, never loaded)   │
                    │    secretsStatus (presence / mask / provenance)  │
                    └───────────────────────┬──────────────────────────┘
                                            │ IPC — no key values inbound
   ┌────────────────────────────────────────┴─────────────────────────────┐
   │ handlers.ts:  secrets:load  secrets:save  secrets:recheck             │
   │               secrets:devEnvVarNames                                  │
   └────────────────────────────────────────┬─────────────────────────────┘
                                            │
                        ┌───────────────────┴────────────────────┐
                        │  secretsService.ts                     │
                        │    initSecretsStorage()  ← main.ts     │
                        │    loadSecrets()  → AppSecrets         │
                        │    getSecretsStatus() → SecretsStatus  │
                        │    saveSecrets(Partial<AppSecrets>)    │
                        │    recheckSecretsStorage()             │
                        └───────────────────┬────────────────────┘
                                            │ builds chain per call
                        ┌───────────────────┴────────────────────┐
                        │  secretResolver.ts (pure)              │
                        │    resolveSecrets / saveSecretsToChain │
                        │    findWriteTarget / buildSecretsStatus│
                        └───────────────────┬────────────────────┘
                                            │
            ┌───────────────────────────────┴──────────────────────────┐
            │                                                          │
   ┌────────┴─────────┐                                    ┌───────────┴──────────┐
   │ envSecretsBackend│  read-only, dev-only               │ safeStorageBackend   │  read/write
   │ LLM_AGG_*        │  precedence 1                      │ secrets.enc.json     │  precedence 2
   └──────────────────┘                                    └──────────────────────┘

   legacyCleanup.ts — runs once at startup, outside the chain
```

### 3.1 File inventory

| File | Responsibility |
|---|---|
| `electron/services/secrets/secretBackendTypes.ts` | `SecretBackend` contract, `AppSecrets`, error taxonomy, `SecretsStatus`, `maskSecret()` |
| `electron/services/secrets/backends/envSecretsBackend.ts` | Dev-only env overlay; owns `DEV_ENV_SECRET_PREFIX` |
| `electron/services/secrets/backends/safeStorageSecretsBackend.ts` | OS-encrypted envelope read/write |
| `electron/services/secrets/legacyCleanup.ts` | One-time rename of legacy plaintext |
| `electron/services/secrets/secretResolver.ts` | Precedence, partial save, status projection — **pure, no Electron imports** |
| `electron/services/secretsService.ts` | Composition root: builds the chain with real Electron deps, public API |

`secretResolver.ts` and the backends take their dependencies as parameters
(`env`, `isPackaged`, `crypto`, `filePath`). Only `secretsService.ts` imports `electron`.
This is what lets the whole chain be unit-tested in a Node environment with no Electron
runtime, matching the existing `defaultDataDirectory.test.ts` pattern.

---

## 4. Contracts

### 4.1 `SecretBackend`

```ts
interface SecretBackend {
  readonly id: 'env' | 'safe-storage'
  readonly writable: boolean
  isAvailable(): boolean
  load(): { secrets: Partial<AppSecrets>; warnings: SecretWarning[] }
  save(secrets: AppSecrets): void   // only called when writable
}
```

**Invariants:**
- `load()` **never throws.** Failures are returned as warnings with empty secrets — a
  corrupt file must not prevent the other backend from being consulted.
- `load()` returns only keys the backend actually holds; absent keys are omitted, not
  set to `''`.
- `save()` on a non-writable backend throws. The resolver never calls it.
- All methods are synchronous.

### 4.2 Resolution order

Fixed, and evaluated **per key**:

| Order | Backend | Writable | Active when |
|---|---|---|---|
| 1 | `env` | No | `settings.allowDevEnvSecrets === true` **and** `!app.isPackaged` |
| 2 | `safe-storage` | Yes | `safeStorage.isEncryptionAvailable()` |

First non-empty value wins. Resolution is per key, not per backend: env may supply the
OpenAI key while the Anthropic key resolves from storage.

Every backend is consulted regardless of availability, because an *inactive* backend
still reports **why** it is inactive (`ENV_DISABLED`, `ENV_IGNORED_PACKAGED`,
`SAFE_STORAGE_UNAVAILABLE`). Availability gates values, not diagnostics.

### 4.3 Write semantics

`saveSecrets(updates: Partial<AppSecrets>)`:

1. Find the first writable **and available** backend. None → throw with a user-facing
   message.
2. Read that backend's **own** stored values as the merge base.
3. Overlay only the keys present in `updates`, trimmed.
4. Write the full merged set.

**Step 2 is the subtle one.** The merge base is the write target's own contents, *not*
the resolved chain. Using the resolved chain would copy an env-supplied key into
encrypted storage the first time the user saved any unrelated field — silently
converting a temporary dev override into a persisted secret. There is a regression test
for exactly this (`never persists an env-supplied value into storage`).

### 4.4 Error taxonomy

Stable string codes so the renderer maps to copy without parsing messages.

| Code | Meaning | Surfaced as |
|---|---|---|
| `ENV_DISABLED` | `LLM_AGG_*` set, override off in settings | Warning row |
| `ENV_IGNORED_PACKAGED` | Override on, but build is packaged | Warning row |
| `ENV_MALFORMED` | Env var present but blank/whitespace | Warning row |
| `SAFE_STORAGE_UNAVAILABLE` | OS encryption not available | Blocking warning; save refused |
| `SAFE_STORAGE_READ_FAIL` | File unreadable | Warning row |
| `SAFE_STORAGE_DECRYPT_FAIL` | Unparseable/undecryptable (usually copied from another machine or account) | Warning row |
| `SAFE_STORAGE_WRITE_FAIL` | Reserved; writes currently surface as a thrown error | Toast |
| `LEGACY_FILE_ORPHANED` | A clear-text `.orphaned.bak` exists | Warning row, persistent |
| `NO_SECRET_AVAILABLE` | No source supplied any key | Warning row |

`ENV_DISABLED` is emitted **only when a prefixed variable is actually set**, so a normal
run stays silent rather than nagging about a feature the user is not using.

### 4.5 On-disk format — `<userData>/secrets.enc.json`

```json
{
  "version": 1,
  "algorithm": "electron-safeStorage",
  "ciphertext": "<base64 of safeStorage.encryptString(JSON.stringify(AppSecrets))>",
  "updatedAt": "2026-07-25T17:24:27.392Z"
}
```

No `nonce`/`iv`/KDF fields (contrary to the original plan): `safeStorage` owns key
derivation and IV internally and exposes only opaque ciphertext. `algorithm` records the
mechanism so a future format change is detectable. Bump `version` when the envelope
shape changes.

The decrypted payload is **not trusted**: only known keys with non-empty string values
are copied out (`safeStorageSecretsBackend.load()`), so a tampered or partially-written
file degrades to "no key" rather than injecting arbitrary values.

### 4.6 IPC surface

| Channel | Direction | Payload in | Payload out |
|---|---|---|---|
| `secrets:load` | R → M | — | `SecretsStatus` |
| `secrets:save` | R → M | `Partial<AppSecrets>` | `SecretsStatus` |
| `secrets:recheck` | R → M | — | `SecretsStatus` |
| `secrets:devEnvVarNames` | R → M | — | `string[]` |

`SecretsStatus` is the only secrets-shaped thing that crosses to the renderer:

```ts
interface SecretsStatus {
  keys: Record<SecretKey, {
    hasKey: boolean
    maskedPreview: string   // "sk-…a1b2"; "" when absent
    source: 'env' | 'safe-storage' | 'none'
    readOnly: boolean       // true for env — editing would appear to do nothing
  }>
  warnings: SecretWarning[]
  backends: Array<{ id: SecretBackendId; available: boolean; writable: boolean }>
}
```

**Masking** (`maskSecret`): ≤ 8 chars → fully bulleted; otherwise first 3 + `…` + last 4.
Enough to tell two keys apart, not enough to reconstruct one.

The type is declared three times — `secretBackendTypes.ts` (main), `preload.ts`
(bridge), `src/global.d.ts` (renderer). This duplication is the codebase's existing
convention for the IPC contract, not an oversight; all three must be edited together.

---

## 5. Behavior

### 5.1 Startup

`main.ts` → `app.whenReady()` → **`initSecretsStorage()`** before `registerIpcHandlers()`
and `createWindow()`. It runs `cleanupLegacyPlaintextSecrets(userData)` once and caches
the result for the process lifetime.

Ordering matters: the sweep must precede any secrets read. `legacyWarnings()` also calls
`initSecretsStorage()` defensively, so a missed wiring degrades to a late sweep rather
than a silent skip.

Rename target is `secrets.json.orphaned.bak`; if one already exists (the user re-created
a legacy file), a timestamped variant is used instead so an earlier backup is never
clobbered — the two copies may hold different keys.

The `LEGACY_FILE_ORPHANED` warning is emitted **while the backup exists**, not only on
the run that created it. Otherwise the notice is missed unless Settings happens to be
open at that moment, and the clear-text file lingers unnoticed.

### 5.2 Chain construction

`buildChain()` is called per operation rather than cached: `allowDevEnvSecrets` and the
process environment can both change between calls, and construction is trivial. A
failure reading settings is caught and degrades to `allowDevEnvSecrets = false` — a
broken settings file must not take down secret resolution, and failing *closed* on a
security-relevant flag is the right direction.

`loadSettings()` coerces with `merged.allowDevEnvSecrets === true` rather than
`Boolean(...)`, so a truthy-but-not-boolean value in a hand-edited file cannot enable it.

### 5.3 Settings dialog

- `keyDrafts: Record<SecretKey, string>` holds **only typed values**, initialized empty
  and cleared after a successful save. Empty draft = untouched = omitted from the update.
- One `Password` field, bound to the selected provider's key via
  `selectedProvider.apiKeyField`. Placeholder communicates state:
  - env-sourced → `Supplied by development environment variable — not editable here`, field disabled
  - stored → `Stored (sk-…a1b2) — type to replace`
  - absent → the provider key label
- A provenance line and a **Re-check secure storage** button sit under the key row.
- Warnings render as rows above the provider picker; `SAFE_STORAGE_UNAVAILABLE` also
  renders a blocking-styled row.
- `save()` writes settings first, then flushes secret updates. **If the secret save
  fails, the dialog stays open** and returns early, so the typed key is not lost to a
  dialog close. `testConnection()` and `generateEmbeddings()` flush first and abort on
  failure, so they never test a key that was not stored.

### 5.4 Model discovery interaction

`aiListModels(providerId, forceRefresh, apiKeyOverride)` previously took *both*
providers' keys. It now takes one scoped override, and the renderer passes it **only**
when the user has typed an unsaved key. When the field is untouched the main process
resolves the stored key itself — so the renderer never needs to hold a key to make
discovery work before Save.

---

## 6. Testing

`tests/unit/secretResolver.test.ts` (18) and
`tests/unit/safeStorageSecretsBackend.test.ts` (10). Node environment, no Electron.

Resolver coverage is the precedence matrix the original plan asked for: env-over-storage,
per-key fall-through, override disabled, packaged build, silence when no vars are set,
blank env value, nothing-available. Plus write semantics: omitted keys preserved,
**env value never persisted**, trimming, no writable backend, env not selectable as a
write target. Plus status projection: presence/provenance without value, env marked
read-only, backend availability — including an assertion that the serialized status does
not contain the key value.

Backend coverage: envelope round-trip, **plaintext absent from the written file**,
corrupt file, unavailable crypto, tampered non-string payload, missing file. Legacy
cleanup: rename + warning, no-op, warning persists while backup exists, existing backup
not clobbered.

A reversible fake stands in for `safeStorage` (`enc:` prefix). It is not encryption and
is not meant to be — it verifies the envelope and the no-plaintext-on-disk property.

**Not covered:** real `safeStorage` behavior, the Vue dialog, and the IPC round-trip.
Those need the Playwright/Electron harness.

---

## 7. Deferred work

| # | Item | Notes |
|---|---|---|
| 1 | **V1 Step 6 — legacy migration** | Currently orphaned, not migrated. Consider a "Delete legacy file" purge action in Settings to close the clear-text residual. |
| 2 | **Anthropic SDK migration** | Replace the hand-rolled `fetch` client with `@anthropic-ai/sdk`; fixes hardcoded `max_tokens: 2000` (adaptive thinking is on by default on Opus 5 / Sonnet 5, so thinking + text share the budget and responses can come back empty), missing `stop_reason` / refusal handling, absent timeouts, and token-tracker blindness on the Anthropic path. |
| 3 | **V2 — key lifecycle** | Rotate / clear / per-provider revoke, last-updated timestamps, stale-key reminders. |
| 4 | **V2 — guided recovery** | Repair wizard for decrypt failures; one-click reset preserving non-secret settings. |
| 5 | **V2 — multi-provider namespace** | `AppSecrets` is a fixed two-field interface. Arbitrary provider keys require a map, and `SECRET_KEYS`/`SecretKey` become dynamic. |
| 6 | **Diagnostics export** | Redacted bundle; backend health counters. |

---

## 8. Security properties and limits

**Holds:**
- Key values are never written in clear text by current code.
- Key values never cross to the renderer.
- Encryption key is held by the OS and scoped to the user account; copying
  `secrets.enc.json` to another machine or account yields `SAFE_STORAGE_DECRYPT_FAIL`.
- The env override cannot activate in a packaged build.
- An env-supplied key cannot be persisted into storage as a side effect of saving.
- Warning messages carry no secret values; the corrupt-file path deliberately does not
  log file contents.

**Does not hold — known limits:**
- `secrets.json.orphaned.bak` is clear text until the user deletes it.
- `safeStorage` protects against *offline* access to the file, not against code running
  as the same user — anything that can call `safeStorage.decryptString` can read the key.
- On Linux, `safeStorage` falls back to weaker protection when no keyring daemon is
  present; `isEncryptionAvailable()` reports usability, not strength.
- Provider HTTP error bodies are still interpolated into user-visible warning text in
  `modelCatalogService`; they do not currently contain keys, but the text is unbounded
  third-party content. Tracked with the Anthropic SDK work.
