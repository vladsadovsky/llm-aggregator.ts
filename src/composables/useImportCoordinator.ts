/**
 * Phase 0.J — bulk-import coordinator (renderer core).
 *
 * Owns the account-export commit lifecycle so `App.vue` doesn't: it subscribes to
 * the main-side progress stream for exactly the duration of a commit, enforces a
 * single active import, projects thrown errors to a safe message (never a raw
 * object/stack), optionally reloads the archive after a successful commit, and
 * clears progress on close so a late event cannot resurrect stale state.
 *
 * The api surface is injected so the lifecycle is unit-tested in jsdom without a
 * real IPC bridge.
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'

export type ImportPhase = 'idle' | 'committing' | 'cancelling' | 'done' | 'error'

export interface ImportCoordinatorDeps<P, R> {
  commit(previewId: string, selection: unknown): Promise<R>
  cancel(previewId: string): Promise<void>
  /** Subscribe to progress; returns an unsubscribe function. */
  onProgress(cb: (progress: P) => void): () => void
  /** Optional archive reload after a successful commit. */
  reload?: () => Promise<void> | void
}

export interface ImportCoordinator<P, R> {
  readonly phase: Ref<ImportPhase>
  readonly progress: Ref<P | null>
  readonly errorMessage: Ref<string | null>
  readonly isActive: ComputedRef<boolean>
  run(previewId: string, selection: unknown): Promise<R | null>
  cancel(previewId: string): Promise<void>
  /** Tear down: unsubscribe and clear progress/error so no stale state lingers. */
  close(): void
}

export function useImportCoordinator<P = unknown, R = unknown>(
  deps: ImportCoordinatorDeps<P, R>,
): ImportCoordinator<P, R> {
  const phase = ref<ImportPhase>('idle') as Ref<ImportPhase>
  const progress = ref<P | null>(null) as Ref<P | null>
  const errorMessage = ref<string | null>(null)
  let dispose: (() => void) | null = null

  const isActive = computed(() => phase.value === 'committing' || phase.value === 'cancelling')

  function unsubscribe() {
    dispose?.()
    dispose = null
  }

  async function run(previewId: string, selection: unknown): Promise<R | null> {
    if (isActive.value) return null // single active import
    errorMessage.value = null
    progress.value = null
    phase.value = 'committing'
    // Subscribe only for the duration of the commit.
    dispose = deps.onProgress((p) => {
      // Ignore progress that arrives after we've stopped committing.
      if (phase.value === 'committing') progress.value = p
    })
    try {
      const result = await deps.commit(previewId, selection)
      phase.value = 'done'
      if (deps.reload) await deps.reload()
      return result
    } catch (err) {
      phase.value = 'error'
      errorMessage.value = err instanceof Error ? err.message : 'Import failed'
      return null
    } finally {
      unsubscribe()
    }
  }

  async function cancel(previewId: string): Promise<void> {
    if (phase.value !== 'committing') return
    phase.value = 'cancelling'
    try {
      await deps.cancel(previewId)
    } finally {
      unsubscribe()
      phase.value = 'idle'
      progress.value = null
    }
  }

  function close() {
    unsubscribe()
    progress.value = null
    errorMessage.value = null
    phase.value = 'idle'
  }

  return { phase, progress, errorMessage, isActive, run, cancel, close }
}
