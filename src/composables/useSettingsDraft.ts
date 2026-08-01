/**
 * Phase 0.H — settings draft state machine (renderer core).
 *
 * Owns `original` vs `draft`, dirty tracking, the edit/validate/apply phases, and
 * the model-catalog request race, so Settings tabs become dumb views over typed
 * draft slices. Cancel restores the draft and performs no writes; a slow catalog
 * response for a provider the user has since changed away from is discarded; and
 * apply is guarded against double-submit. The actual IPC apply call (with the
 * secret updates and optimistic revision) is injected, so this is unit-tested in
 * jsdom without a real bridge.
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'

export type DraftPhase = 'loading' | 'editing' | 'validating' | 'applying' | 'error' | 'done'

export interface ApplyOutcome {
  status: 'applied' | 'invalid' | 'stale-revision' | 'write-failed' | 'needs-repair'
  reason?: string
}

export interface SettingsDraft<T extends object> {
  readonly phase: Ref<DraftPhase>
  readonly draft: Ref<T | null>
  readonly models: Ref<readonly string[]>
  readonly catalogLoading: ComputedRef<boolean>
  readonly isDirty: ComputedRef<boolean>
  readonly dirtyFields: ComputedRef<ReadonlyArray<keyof T>>
  readonly canSave: ComputedRef<boolean>
  load(settings: T): void
  update(patch: Partial<T>): void
  cancel(): void
  /** Load a provider's model catalog, discarding any superseded (older) response. */
  loadCatalog(providerId: string, loader: (providerId: string) => Promise<string[]>): Promise<void>
  /** Apply the draft via the injected effect; guarded against double-submit. */
  apply(effect: (draft: T) => Promise<ApplyOutcome>): Promise<ApplyOutcome | null>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function useSettingsDraft<T extends object>(): SettingsDraft<T> {
  const phase = ref<DraftPhase>('loading') as Ref<DraftPhase>
  const original = ref<T | null>(null) as Ref<T | null>
  const draft = ref<T | null>(null) as Ref<T | null>
  const models = ref<string[]>([]) as Ref<string[]>

  // Monotonic catalog request tracking, to discard superseded responses.
  let latestCatalogRequest = 0
  let pendingCatalogRequest = 0
  const catalogLoading = ref(false)

  const isDirty = computed(() => {
    if (!original.value || !draft.value) return false
    return JSON.stringify(original.value) !== JSON.stringify(draft.value)
  })

  const dirtyFields = computed<ReadonlyArray<keyof T>>(() => {
    if (!original.value || !draft.value) return []
    const o = original.value as Record<string, unknown>
    const d = draft.value as Record<string, unknown>
    return (Object.keys(d) as Array<keyof T>).filter(
      (k) => JSON.stringify(o[k as string]) !== JSON.stringify(d[k as string]),
    )
  })

  const canSave = computed(
    () => phase.value === 'editing' && isDirty.value && !catalogLoading.value,
  )

  function load(settings: T) {
    original.value = clone(settings)
    draft.value = clone(settings)
    phase.value = 'editing'
  }

  function update(patch: Partial<T>) {
    if (!draft.value) return
    draft.value = { ...draft.value, ...patch }
  }

  function cancel() {
    // Restore the draft; never writes.
    if (original.value) draft.value = clone(original.value)
    phase.value = original.value ? 'editing' : 'loading'
  }

  async function loadCatalog(providerId: string, loader: (providerId: string) => Promise<string[]>) {
    const requestId = (latestCatalogRequest += 1)
    pendingCatalogRequest = requestId
    catalogLoading.value = true
    try {
      const result = await loader(providerId)
      // Apply only if this is still the newest request (provider not changed away).
      if (requestId === latestCatalogRequest) models.value = [...result]
    } finally {
      // Clear the spinner only when the response that finished is the pending one.
      if (requestId === pendingCatalogRequest) catalogLoading.value = false
    }
  }

  async function apply(effect: (draft: T) => Promise<ApplyOutcome>): Promise<ApplyOutcome | null> {
    if (phase.value === 'applying' || !draft.value) return null // double-submit guard
    phase.value = 'applying'
    try {
      const outcome = await effect(draft.value)
      if (outcome.status === 'applied') {
        original.value = clone(draft.value)
        phase.value = 'done'
      } else {
        phase.value = 'error'
      }
      return outcome
    } catch (err) {
      phase.value = 'error'
      return { status: 'write-failed', reason: err instanceof Error ? err.message : 'unknown' }
    }
  }

  return {
    phase,
    draft,
    models,
    catalogLoading: computed(() => catalogLoading.value),
    isDirty,
    dirtyFields,
    canSave,
    load,
    update,
    cancel,
    loadCatalog,
    apply,
  }
}
