/**
 * P0-H (renderer core): draft/original tracking, dirty fields, Cancel making no
 * writes, canSave gating during catalog load, discarding a superseded catalog
 * response, apply success/failure phase transitions, and double-submit guard.
 */
import { describe, it, expect, vi } from 'vitest'
import { useSettingsDraft, type ApplyOutcome } from '../../src/composables/useSettingsDraft'

interface DemoSettings {
  llmProvider: string
  llmModel: string
  lensEnabled: boolean
}

const base: DemoSettings = { llmProvider: 'openai', llmModel: 'gpt-4o', lensEnabled: false }

/** A deferred promise for controlling async ordering in tests. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('useSettingsDraft', () => {
  it('loads original + draft and starts editing, not dirty', () => {
    const s = useSettingsDraft<DemoSettings>()
    s.load(base)
    expect(s.phase.value).toBe('editing')
    expect(s.isDirty.value).toBe(false)
    expect(s.draft.value).toEqual(base)
  })

  it('tracks dirty fields as the draft diverges', () => {
    const s = useSettingsDraft<DemoSettings>()
    s.load(base)
    s.update({ llmModel: 'gpt-5' })
    expect(s.isDirty.value).toBe(true)
    expect(s.dirtyFields.value).toEqual(['llmModel'])
  })

  it('does not mutate the caller-provided object (deep clone)', () => {
    const s = useSettingsDraft<DemoSettings>()
    s.load(base)
    s.update({ lensEnabled: true })
    expect(base.lensEnabled).toBe(false)
  })

  it('Cancel restores the draft and writes nothing', () => {
    const s = useSettingsDraft<DemoSettings>()
    s.load(base)
    s.update({ llmModel: 'gpt-5' })
    s.cancel()
    expect(s.isDirty.value).toBe(false)
    expect(s.draft.value).toEqual(base)
    expect(s.phase.value).toBe('editing')
  })

  it('canSave requires an edit and is false while a catalog is loading', async () => {
    const s = useSettingsDraft<DemoSettings>()
    s.load(base)
    expect(s.canSave.value).toBe(false) // not dirty
    s.update({ llmModel: 'gpt-5' })
    expect(s.canSave.value).toBe(true)

    const d = deferred<string[]>()
    const p = s.loadCatalog('openai', () => d.promise)
    expect(s.catalogLoading.value).toBe(true)
    expect(s.canSave.value).toBe(false) // blocked during catalog load
    d.resolve(['gpt-5', 'gpt-4o'])
    await p
    expect(s.catalogLoading.value).toBe(false)
    expect(s.canSave.value).toBe(true)
    expect([...s.models.value]).toEqual(['gpt-5', 'gpt-4o'])
  })

  it('discards a superseded (older) catalog response', async () => {
    const s = useSettingsDraft<DemoSettings>()
    s.load(base)
    const slow = deferred<string[]>()
    const fast = deferred<string[]>()

    const pSlow = s.loadCatalog('openai', () => slow.promise) // request 1
    const pFast = s.loadCatalog('anthropic', () => fast.promise) // request 2 (newest)

    fast.resolve(['claude-opus'])
    await pFast
    expect([...s.models.value]).toEqual(['claude-opus'])

    slow.resolve(['gpt-4o']) // stale response arrives late
    await pSlow
    expect([...s.models.value]).toEqual(['claude-opus']) // NOT overwritten
  })

  it('apply success clears dirty and moves to done', async () => {
    const s = useSettingsDraft<DemoSettings>()
    s.load(base)
    s.update({ llmModel: 'gpt-5' })
    const effect = vi.fn(async (): Promise<ApplyOutcome> => ({ status: 'applied' }))
    const outcome = await s.apply(effect)
    expect(outcome).toEqual({ status: 'applied' })
    expect(s.phase.value).toBe('done')
    expect(s.isDirty.value).toBe(false) // original now equals draft
  })

  it('apply failure moves to error and keeps the draft dirty', async () => {
    const s = useSettingsDraft<DemoSettings>()
    s.load(base)
    s.update({ llmModel: 'gpt-5' })
    const outcome = await s.apply(async () => ({ status: 'write-failed', reason: 'secrets' }))
    expect(outcome).toMatchObject({ status: 'write-failed' })
    expect(s.phase.value).toBe('error')
    expect(s.isDirty.value).toBe(true)
  })

  it('prevents a double-submit while applying', async () => {
    const s = useSettingsDraft<DemoSettings>()
    s.load(base)
    s.update({ llmModel: 'gpt-5' })
    const gate = deferred<ApplyOutcome>()
    const effect = vi.fn(() => gate.promise)
    const first = s.apply(effect)
    const second = await s.apply(effect) // rejected by the guard
    expect(second).toBeNull()
    expect(effect).toHaveBeenCalledTimes(1)
    gate.resolve({ status: 'applied' })
    await first
  })
})
