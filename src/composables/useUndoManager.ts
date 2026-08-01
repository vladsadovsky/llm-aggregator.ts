/**
 * Phase 0.4 — serialized undo/redo (command) infrastructure.
 *
 * "UndoableMutation" (deliberately distinct from the UI command registry) is a
 * single forward/`apply` + reverse/`revert` pair with an archive namespace and
 * optional entity signatures for staleness checks. The manager:
 *
 *  - runs one operation at a time and blocks re-entrancy/overlap (`busy`);
 *  - records history ONLY after a durable success, and clears the redo stack on
 *    any new command;
 *  - keeps a bounded, session-only history (default 100), evicting the oldest;
 *  - revalidates the archive namespace and the expected entity signature before
 *    undo/redo — a signature mismatch (external/manual edit) invalidates history
 *    (`history-stale`) and requires a reload;
 *  - on a compensation (revert/re-apply) failure marks itself `tainted`, refusing
 *    all further dispatch — it never pretends state rolled back.
 *
 * Vue-free so the core is unit-tested in Node; a thin reactive wrapper and the
 * per-mutation store wiring live in the renderer.
 */

export interface UndoableMutation {
  /** Human-readable label for undo/redo affordances. */
  readonly label: string
  /** The archive this mutation belongs to; the manager refuses foreign ones. */
  readonly archiveNamespace: string
  /** Apply the change forward; resolves only on durable success. */
  apply(): Promise<void>
  /** Revert the change; resolves only on durable success. */
  revert(): Promise<void>
  /** Live signature (version/hash) of the target entity, for staleness checks. */
  currentSignature?(): string | null
  /** Signature the manager expects before an undo (the post-apply state). */
  readonly appliedSignature?: string
  /** Signature the manager expects before a redo (the pre-apply / post-revert state). */
  readonly revertedSignature?: string
}

export type UndoErrorCode =
  | 'busy'
  | 'tainted'
  | 'wrong-archive'
  | 'history-stale'
  | 'nothing-to-undo'
  | 'nothing-to-redo'

export class UndoError extends Error {
  readonly code: UndoErrorCode
  constructor(code: UndoErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'UndoError'
    this.code = code
  }
}

export interface UndoManager {
  invoke(mutation: UndoableMutation): Promise<void>
  undo(): Promise<void>
  redo(): Promise<void>
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly isTainted: boolean
  readonly undoLabel: string | null
  readonly redoLabel: string | null
  readonly historyDepth: number
  /** Reset all history and taint (call on archive switch, reset, bulk import, reload). */
  clear(): void
}

export interface UndoManagerOptions {
  archiveNamespace: string
  /** Maximum committed entries retained; older entries are evicted. */
  limit?: number
}

const DEFAULT_LIMIT = 100

export function createUndoManager(options: UndoManagerOptions): UndoManager {
  const namespace = options.archiveNamespace
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT)

  const undoStack: UndoableMutation[] = []
  const redoStack: UndoableMutation[] = []
  let running = false
  let tainted = false

  function ensureUsable() {
    if (tainted) throw new UndoError('tainted', 'undo manager is tainted; reload required')
    if (running) throw new UndoError('busy', 'another mutation is in flight')
  }

  /** A signature mismatch means the entity changed outside our history — abandon it. */
  function isStale(mutation: UndoableMutation, expected: string | undefined): boolean {
    if (mutation.currentSignature === undefined || expected === undefined) return false
    return mutation.currentSignature() !== expected
  }

  async function invoke(mutation: UndoableMutation): Promise<void> {
    ensureUsable()
    if (mutation.archiveNamespace !== namespace) {
      throw new UndoError('wrong-archive', 'mutation belongs to a different archive')
    }
    running = true
    try {
      await mutation.apply()
    } finally {
      running = false
    }
    // Reached only on success — failed commands never enter history.
    undoStack.push(mutation)
    if (undoStack.length > limit) undoStack.shift()
    redoStack.length = 0
  }

  async function undo(): Promise<void> {
    ensureUsable()
    if (undoStack.length === 0) throw new UndoError('nothing-to-undo')
    const mutation = undoStack[undoStack.length - 1]
    if (isStale(mutation, mutation.appliedSignature)) {
      // The target moved under us; the whole history is now untrustworthy.
      undoStack.length = 0
      redoStack.length = 0
      throw new UndoError('history-stale', 'entity changed outside undo history; reload required')
    }
    running = true
    try {
      await mutation.revert()
    } catch (err) {
      tainted = true // never pretend the rollback happened
      throw new UndoError('tainted', `revert failed: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      running = false
    }
    undoStack.pop()
    redoStack.push(mutation)
  }

  async function redo(): Promise<void> {
    ensureUsable()
    if (redoStack.length === 0) throw new UndoError('nothing-to-redo')
    const mutation = redoStack[redoStack.length - 1]
    if (isStale(mutation, mutation.revertedSignature)) {
      undoStack.length = 0
      redoStack.length = 0
      throw new UndoError('history-stale', 'entity changed outside undo history; reload required')
    }
    running = true
    try {
      await mutation.apply()
    } catch (err) {
      tainted = true
      throw new UndoError('tainted', `re-apply failed: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      running = false
    }
    redoStack.pop()
    undoStack.push(mutation)
  }

  function clear() {
    undoStack.length = 0
    redoStack.length = 0
    tainted = false
  }

  return {
    invoke,
    undo,
    redo,
    get canUndo() {
      return !tainted && undoStack.length > 0
    },
    get canRedo() {
      return !tainted && redoStack.length > 0
    },
    get isTainted() {
      return tainted
    },
    get undoLabel() {
      return undoStack.length ? undoStack[undoStack.length - 1].label : null
    },
    get redoLabel() {
      return redoStack.length ? redoStack[redoStack.length - 1].label : null
    },
    get historyDepth() {
      return undoStack.length
    },
    clear,
  }
}
