# Secrets Storage Resolution and Migration Plan

> **Status (2026-07-25): V1 Steps 1–5 implemented; Step 6 deferred.**
> This document is the original plan and is kept for intent and rationale. It is
> **not** an accurate description of the shipped code — several decisions changed
> during implementation. For what actually exists, read
> [`Secrets_Storage_Design_and_Implementation.md`](./Secrets_Storage_Design_and_Implementation.md),
> which is the maintained specification.
>
> Decisions that diverged from this plan:
>
> | This plan says | What shipped | Why |
> |---|---|---|
> | Separate `keychain` and `encrypted-file` backends, keytar-style | One `safe-storage` backend using Electron `safeStorage` | keytar is archived; `safeStorage` needs no native module, survives MSI packaging, and is synchronous |
> | Async `SecretBackend` interface | Synchronous | `safeStorage` and `process.env` are both sync; keeps `loadSecrets()` sync and leaves 11 `getProvider()` call sites untouched |
> | Encrypted file records `nonce/iv` + KDF metadata | Records `algorithm` only | `safeStorage` owns key derivation and IV internally and exposes only opaque ciphertext |
> | `devEnvSecretPrefix` configurable setting (Step 1) | Removed; prefix fixed at `LLM_AGG_` | A free-form prefix feeds a `process.env` lookup and needs validation to stay a legal variable name, for no benefit over a constant |
> | Legacy plaintext read during migration (Step 6) | Never read; renamed to `.orphaned.bak` on startup | Explicit product decision; users re-enter keys once |
> | `secretsLoad()` returns secrets, optionally with metadata (Step 4) | Returns metadata **only** — raw values never reach the renderer | Encrypting at rest is undone if the values round-trip through the Chromium process |

## Objective

Implement a deterministic secret resolution chain for API keys:

1. Dev-only environment overrides (when explicitly enabled in settings)
2. OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service)
3. Encrypted local fallback file colocated with app settings data

This plan also defines migration from current plaintext `secrets.json` and a complete user error communication strategy.

## Current State (Baseline)

- API keys are stored in plaintext via `electron/services/secretsService.ts` in userData `secrets.json`.
- Settings UI states: keys are editable, saved via `window.api.secretsSave`, and used by provider test/model refresh.
- No keychain integration, no encrypted fallback layer, and no storage-layer diagnostics surfaced to user.

## Design Principles

- Deterministic precedence: the same input state always resolves to the same secret source.
- Safe by default: dev env override must be explicit, never accidental in production packaging.
- Backward compatible migration: existing users should not lose keys.
- Graceful degradation: if a higher layer fails, continue through fallback chain when safe.
- Explainable UX: users should always know why an operation failed and what to do next.

## Storage Resolution Contract (V1)

### Resolution order

1. `env` source, only when both conditions are true:
   - `settings.allowDevEnvSecrets === true`
   - app is in development mode (`!app.isPackaged`) or explicit debug guard enabled
2. `keychain` source when available and readable
3. `encrypted-file` source in user data/settings directory as last resort

### Source of truth semantics

- Reads use first successful source by precedence.
- Writes target selected primary storage:
  - dev mode with env override enabled: do not write to env; write to keychain (or encrypted fallback) and display read-source as `env`.
  - normal mode: write to keychain first; if unavailable write encrypted file.
- `env` is treated as read-only overlay.

### New service abstraction

Introduce a provider-based secret backend abstraction:

- `SecretBackend` interface:
  - `id(): 'env' | 'keychain' | 'encrypted-file'`
  - `isAvailable(): Promise<boolean>`
  - `load(): Promise<Partial<AppSecrets>>`
  - `save(secrets: AppSecrets): Promise<void>`
  - `delete(keys?: Array<keyof AppSecrets>): Promise<void>`
- `SecretResolutionResult`:
  - `secrets: AppSecrets`
  - `readSourceByKey: Record<string, 'env' | 'keychain' | 'encrypted-file' | 'none'>`
  - `warnings: string[]`

## Step-by-Step Implementation Plan (V1)

### Step 1: Types and settings flags

Files:

- `electron/services/settingsService.ts`
- `electron/preload.ts`
- `src/global.d.ts`
- `src/components/SettingsDialog.vue`

Changes:

- Add settings flags:
  - `allowDevEnvSecrets: boolean` (default `false`)
  - `devEnvSecretPrefix: string` (default `LLM_AGG_`)
- In Settings UI, show these controls only in dev mode.
- Add brief warning text: env override is for development only and never persisted to packaged runtime.

### Step 2: Secret backend modules

Files:

- Add `electron/services/secrets/backends/envSecretsBackend.ts`
- Add `electron/services/secrets/backends/keychainSecretsBackend.ts`
- Add `electron/services/secrets/backends/encryptedFileSecretsBackend.ts`
- Add `electron/services/secrets/secretBackendTypes.ts`

Changes:

- Implement each backend independently with identical interface.
- Keychain backend should use keytar-style storage keyed by app service name and secret key name.
- Encrypted fallback file format should include:
  - `version`
  - `ciphertext`
  - `nonce/iv`
  - `kdf metadata`
  - `updatedAt`

### Step 3: Orchestrator and resolution logic

Files:

- Add `electron/services/secrets/secretResolver.ts`
- Refactor `electron/services/secretsService.ts`

Changes:

- Build backend chain according to settings and runtime.
- Implement:
  - `loadSecretsResolved(): Promise<SecretResolutionResult>`
  - `saveSecretsResolved(secrets: AppSecrets): Promise<{ writeTarget: string; warnings: string[] }>`
  - `migrateLegacySecretsIfNeeded(): Promise<MigrationReport>`
- Keep existing `loadSecrets` and `saveSecrets` signatures for IPC compatibility, backed by the new resolver.

### Step 4: IPC diagnostics surface

Files:

- `electron/ipc/handlers.ts`
- `electron/preload.ts`
- `src/global.d.ts`

Changes:

- Extend secrets APIs:
  - `secretsLoad()` optionally returns metadata `{ sourceByKey, warnings }`
  - `secretsDiagnostics()` returns backend availability and last migration status
- Keep old callers functional by preserving base fields.

### Step 5: Settings UI and interaction behavior

Files:

- `src/components/SettingsDialog.vue`

Changes:

- Add storage status row in AI settings:
  - Active source per key (`env`, `keychain`, `encrypted fallback`)
  - Warning icon with actionable message when downgraded to fallback
- Add "Re-check secure storage" button to rerun availability probes.
- During save/test connection, display precise error copy mapped from resolver error codes.

### Step 6: Legacy plaintext migration

Files:

- `electron/services/secretsService.ts`
- Add `electron/services/secrets/migration.ts`

Changes:

- On first load after upgrade:
  - If legacy `secrets.json` exists and has non-empty keys, migrate to preferred writable backend.
  - Verify roundtrip read after write.
  - If successful, rewrite legacy file to redacted tombstone or rename to `.migrated.bak`.
  - Record migration report with timestamp and result for diagnostics.

## Migration Plan from Current secrets.json

### Phase M1: Safe introduction

1. Ship resolver + backends with migration disabled behind internal feature flag.
2. Collect diagnostics in dev builds.
3. Validate no regression in `ai:testConnection`, metadata generation, embeddings path.

### Phase M2: Auto-migration enabled

1. Enable migration by default.
2. Run migration at app startup before first secrets read.
3. If keychain write fails, auto-fallback to encrypted file and continue.
4. Never delete plaintext until a successful write + read verification.

### Phase M3: Legacy retirement

1. Stop writing plaintext `secrets.json` entirely.
2. Keep one-time reader for backward compatibility across at least one major release.
3. Add optional "Purge legacy plaintext secret file" action in diagnostics.

### Migration rollback behavior

- If all secure writes fail, keep current plaintext operational and show blocking warning.
- Provide explicit guidance to user: permissions, keychain unlock, or directory access fix.
- Log technical details only in main-process logs, never in UI text with secrets.

## User Error Communication Plan (All Flavors)

### Error taxonomy

- `ENV_DISABLED`: env variables present but dev-env setting disabled.
- `ENV_MALFORMED`: env value empty/invalid format.
- `KEYCHAIN_UNAVAILABLE`: platform service missing/locked.
- `KEYCHAIN_ACCESS_DENIED`: OS credential read/write denied.
- `KEYCHAIN_IO_ERROR`: transient OS keychain error.
- `ENC_FILE_READ_FAIL`: encrypted file unreadable.
- `ENC_FILE_DECRYPT_FAIL`: decryption failed (tampered/corrupt/key mismatch).
- `ENC_FILE_WRITE_FAIL`: cannot write encrypted file.
- `MIGRATION_PARTIAL`: one key migrated, another failed.
- `MIGRATION_FAILED`: no secure backend accepted migration.
- `NO_SECRET_AVAILABLE`: no source has valid key.

### UI channels and when to use them

1. Inline field message (non-blocking, immediate)
   - Invalid env format, empty key, unsupported prefix.
2. Toast warning/error (operation scoped)
   - Test connection failed due to source-specific issue.
3. Modal dialog (blocking, requires decision)
   - Migration failure, decrypt failure with data-loss risk.
4. Persistent banner in Settings (until resolved)
   - Running on encrypted fallback because keychain unavailable.
5. Diagnostics panel details (advanced)
   - Backend probes, last migration status, error codes, timestamps.
6. Developer logs (non-UI)
   - Stack traces and low-level OS error reasons, with redaction.

### Message style rules

- No secrets in UI or logs.
- User text should contain:
  - what failed
  - current fallback behavior
  - next action
- Provide retry action where possible.

### Example communication mapping

- `KEYCHAIN_UNAVAILABLE`
  - Banner: "Secure keychain is unavailable. Keys are currently stored in encrypted local fallback."
  - CTA: "Retry keychain" and "Learn how to fix"
- `ENC_FILE_DECRYPT_FAIL`
  - Modal: "Encrypted secrets file could not be decrypted. You can re-enter keys to continue."
  - CTA: "Open Settings", "Export diagnostics"
- `NO_SECRET_AVAILABLE`
  - Inline under key field: "No API key found in dev env, keychain, or encrypted fallback."

## V2 Future Plan (Steps 3, 4, 5, 6)

These steps are intentionally deferred to V2 after V1 is stable.

### V2 Step 3: Key lifecycle controls

- Add explicit rotate, clear, and per-provider revoke flows.
- Add last-updated timestamps per key and stale-key reminders.

### V2 Step 4: Secure recovery workflow

- Add guided repair wizard when decryption/keychain issues occur.
- Add one-click reset for encrypted fallback while preserving non-secret settings.

### V2 Step 5: Multi-provider namespace and policy

- Support arbitrary provider keys in map form, not fixed fields only.
- Add policy rules: required key by selected provider, per-feature capabilities.

### V2 Step 6: Observability and supportability

- Add "Security diagnostics" export bundle (redacted).
- Track secret backend health counters (success/failure rates) locally.
- Add optional user-consented telemetry hooks for aggregated backend failure stats.

## Validation and Test Plan

### Unit tests

- Resolver precedence matrix:
  - env on/off
  - keychain available/unavailable
  - encrypted file available/unavailable
- Migration idempotency and rollback safety.
- Error code mapping correctness.

### Integration tests (Electron main + renderer)

- Settings save/load with each backend mode.
- Connection test behavior when backend downgrades.
- Corrupted encrypted file handling and user guidance path.

### Manual QA checklist

1. Fresh install with no keys.
2. Upgrade from plaintext secrets file.
3. Dev env override enabled and disabled.
4. Keychain unavailable simulation.
5. Fallback encrypted file permission denied simulation.

## Acceptance Criteria

- Secret resolution follows exact precedence chain and is deterministic.
- Existing users are migrated without key loss.
- Plaintext storage is retired for writes.
- Users receive clear, actionable error communication for all major failure classes.
- No secret values appear in logs, toasts, dialogs, or diagnostics exports.
