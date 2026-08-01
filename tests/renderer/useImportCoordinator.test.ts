/**
 * P0-J: the import coordinator manages a bulk commit's lifecycle — progress
 * listener subscribe/unsubscribe, single active import, cancel, safe error
 * projection, reload after commit, and no stale progress after close.
 */
import { describe, it, expect, vi } from 'vitest'
import { useImportCoordinator, type ImportCoordinatorDeps } from '../../src/composables/useImportCoordinator'

interface Progress {
  processed: number
  total: number
}
interface Result {
  createdPairs: number
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Build deps with a controllable commit and a captured progress emitter. */
function makeDeps(over: Partial<ImportCoordinatorDeps<Progress, Result>> = {}) {
  let emit: ((p: Progress) => void) | null = null
  const unsubscribe = vi.fn()
  const deps: ImportCoordinatorDeps<Progress, Result> = {
    commit: vi.fn(async () => ({ createdPairs: 1 })),
    cancel: vi.fn(async () => {}),
    onProgress: vi.fn((cb) => {
      emit = cb
      return unsubscribe
    }),
    ...over,
  }
  return { deps, unsubscribe, emit: (p: Progress) => emit?.(p) }
}

describe('useImportCoordinator', () => {
  it('subscribes for the commit, reflects progress, and unsubscribes when done', async () => {
    const gate = deferred<Result>()
    const { deps, unsubscribe, emit } = makeDeps({ commit: vi.fn(() => gate.promise) })
    const c = useImportCoordinator(deps)

    const run = c.run('pv1', { threadSourceIds: ['a'] })
    expect(c.phase.value).toBe('committing')
    expect(deps.onProgress).toHaveBeenCalledTimes(1)

    emit({ processed: 2, total: 10 })
    expect(c.progress.value).toEqual({ processed: 2, total: 10 })

    gate.resolve({ createdPairs: 5 })
    const result = await run
    expect(result).toEqual({ createdPairs: 5 })
    expect(c.phase.value).toBe('done')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('refuses a second concurrent import', async () => {
    const gate = deferred<Result>()
    const { deps } = makeDeps({ commit: vi.fn(() => gate.promise) })
    const c = useImportCoordinator(deps)
    const first = c.run('pv1', {})
    const second = await c.run('pv2', {})
    expect(second).toBeNull()
    expect(deps.commit).toHaveBeenCalledTimes(1)
    gate.resolve({ createdPairs: 0 })
    await first
  })

  it('projects a thrown error to a safe message', async () => {
    const { deps } = makeDeps({ commit: vi.fn(async () => { throw new Error('write-failed: disk') }) })
    const c = useImportCoordinator(deps)
    const result = await c.run('pv1', {})
    expect(result).toBeNull()
    expect(c.phase.value).toBe('error')
    expect(c.errorMessage.value).toBe('write-failed: disk')
  })

  it('reloads the archive after a successful commit', async () => {
    const reload = vi.fn(async () => {})
    const { deps } = makeDeps({ reload })
    const c = useImportCoordinator(deps)
    await c.run('pv1', {})
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('cancel aborts an in-flight commit and clears state', async () => {
    const gate = deferred<Result>()
    const { deps, unsubscribe } = makeDeps({ commit: vi.fn(() => gate.promise) })
    const c = useImportCoordinator(deps)
    const run = c.run('pv1', {})
    await c.cancel('pv1')
    expect(deps.cancel).toHaveBeenCalledWith('pv1')
    expect(c.phase.value).toBe('idle')
    expect(c.progress.value).toBeNull()
    expect(unsubscribe).toHaveBeenCalled()
    gate.resolve({ createdPairs: 0 })
    await run
  })

  it('close() clears progress so a late event cannot resurrect stale state', async () => {
    const { deps, unsubscribe, emit } = makeDeps({ commit: vi.fn(async () => ({ createdPairs: 1 })) })
    const c = useImportCoordinator(deps)
    await c.run('pv1', {})
    c.close()
    expect(c.progress.value).toBeNull()
    expect(c.phase.value).toBe('idle')
    emit({ processed: 9, total: 9 }) // stray late event
    expect(c.progress.value).toBeNull() // still clear
    expect(unsubscribe).toHaveBeenCalled()
  })
})
