/**
 * Failed-load quarantine (`INV-LOAD`).
 *
 * Distinguishes *missing* (safe to initialize defaults) from *corrupt*,
 * *unreadable*, and *unsupported-version* (must NOT be silently replaced by a
 * default/empty projection). A failed load raises a write barrier for that
 * control file so a later save cannot overwrite the last readable state until an
 * explicit repair, reload, or user-confirmed replacement.
 */
import { existsSync, readFileSync } from 'fs'
import { ipcError } from '../../../shared/contracts/errorWire'

export type LoadStatus =
  | 'missing'
  | 'loaded'
  | 'corrupt'
  | 'unreadable'
  | 'unsupported-version'

export interface LoadState<T> {
  status: LoadStatus
  /** Present only when `status === 'loaded'`. */
  value?: T
  /** Safe, content-free description (path category + reason). */
  diagnostics?: string
}

/** Thrown by a validator to signal a recognized-but-unsupported schema version. */
export class UnsupportedVersionError extends Error {
  constructor(message = 'unsupported schema version') {
    super(message)
    this.name = 'UnsupportedVersionError'
  }
}

export interface LoadJsonOptions<T> {
  /** Validate/normalize the parsed value. Throw to mark corrupt. */
  validate?: (parsed: unknown) => T
  /** Injectable readers for tests. */
  io?: {
    existsSync(p: string): boolean
    readFileSync(p: string): string
  }
}

const defaultIo = {
  existsSync,
  readFileSync: (p: string) => readFileSync(p, 'utf-8'),
}

/**
 * Load and classify a JSON control file. Never throws — the caller decides what
 * to do with each state.
 */
export function loadJsonFile<T>(path: string, options: LoadJsonOptions<T> = {}): LoadState<T> {
  const io = options.io ?? defaultIo
  if (!io.existsSync(path)) {
    return { status: 'missing' }
  }

  let raw: string
  try {
    raw = io.readFileSync(path)
  } catch {
    return { status: 'unreadable', diagnostics: 'read failed' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'corrupt', diagnostics: 'invalid JSON' }
  }

  if (!options.validate) {
    return { status: 'loaded', value: parsed as T }
  }

  try {
    return { status: 'loaded', value: options.validate(parsed) }
  } catch (err) {
    if (err instanceof UnsupportedVersionError) {
      return { status: 'unsupported-version', diagnostics: err.message }
    }
    return { status: 'corrupt', diagnostics: 'failed validation' }
  }
}

// ─── Write barrier registry ──────────────────────────────────────────────────

const barriers = new Map<string, LoadStatus>()

/** Raise the barrier for a control-file key after a failed load. */
export function raiseBarrier(key: string, status: LoadStatus): void {
  barriers.set(key, status)
}

/** Clear the barrier after an explicit repair / successful reload / replacement. */
export function clearBarrier(key: string): void {
  barriers.delete(key)
}

export function barrierStatus(key: string): LoadStatus | undefined {
  return barriers.get(key)
}

/**
 * Throw a stable coded error if `key` is barriered. Call before any save so a
 * corrupt-then-edit sequence cannot promote a default/empty projection over the
 * unread original.
 */
export function assertWritable(key: string): void {
  const status = barriers.get(key)
  if (status) {
    throw ipcError('needs-repair', `"${key}" cannot be saved until its corrupt data is repaired or reloaded.`)
  }
}

/** Test-only: drop all barriers. */
export function _resetBarriers(): void {
  barriers.clear()
}
