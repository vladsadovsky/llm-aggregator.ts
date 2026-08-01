/**
 * INV-UNDO (0.4): history records only successfully committed mutations; a
 * compensation failure taints the manager instead of pretending state rolled
 * back; undo/redo revalidate archive + entity signature; overlap/re-entrancy is
 * blocked; history is bounded and session-only.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createUndoManager, type UndoableMutation, type UndoManager } from '../../src/composables/useUndoManager'

let log: string[]
let mgr: UndoManager

beforeEach(() => {
  log = []
  mgr = createUndoManager({ archiveNamespace: 'arch1' })
})

function mut(id: string, over: Partial<UndoableMutation> = {}): UndoableMutation {
  return {
    label: id,
    archiveNamespace: 'arch1',
    apply: async () => {
      log.push(`apply:${id}`)
    },
    revert: async () => {
      log.push(`revert:${id}`)
    },
    ...over,
  }
}

describe('invoke / history', () => {
  it('records a successful mutation and exposes it as undoable', async () => {
    await mgr.invoke(mut('A'))
    expect(log).toEqual(['apply:A'])
    expect(mgr.canUndo).toBe(true)
    expect(mgr.undoLabel).toBe('A')
    expect(mgr.historyDepth).toBe(1)
  })

  it('does NOT record a mutation whose apply throws', async () => {
    await expect(
      mgr.invoke(mut('F', { apply: async () => { throw new Error('nope') } })),
    ).rejects.toThrow('nope')
    expect(mgr.canUndo).toBe(false)
    expect(mgr.historyDepth).toBe(0)
  })

  it('rejects a mutation from a different archive', async () => {
    await expect(mgr.invoke(mut('Z', { archiveNamespace: 'other' }))).rejects.toMatchObject({
      code: 'wrong-archive',
    })
    expect(mgr.historyDepth).toBe(0)
  })

  it('evicts the oldest entry beyond the history limit', async () => {
    const small = createUndoManager({ archiveNamespace: 'arch1', limit: 2 })
    for (const id of ['A', 'B', 'C']) await small.invoke(mut(id))
    expect(small.historyDepth).toBe(2)
    await small.undo() // C
    await small.undo() // B
    await expect(small.undo()).rejects.toMatchObject({ code: 'nothing-to-undo' }) // A was evicted
    expect(log).toEqual(['apply:A', 'apply:B', 'apply:C', 'revert:C', 'revert:B'])
  })
})

describe('undo / redo', () => {
  it('reverts in LIFO order and supports redo', async () => {
    await mgr.invoke(mut('A'))
    await mgr.invoke(mut('B'))
    expect(mgr.undoLabel).toBe('B')

    await mgr.undo()
    expect(log).toContain('revert:B')
    expect(mgr.canRedo).toBe(true)
    expect(mgr.redoLabel).toBe('B')

    await mgr.redo()
    expect(log.filter((l) => l === 'apply:B')).toHaveLength(2) // applied again
    expect(mgr.canRedo).toBe(false)
  })

  it('a new command clears the redo stack', async () => {
    await mgr.invoke(mut('A'))
    await mgr.undo()
    expect(mgr.canRedo).toBe(true)
    await mgr.invoke(mut('B'))
    expect(mgr.canRedo).toBe(false)
  })

  it('errors on nothing to undo / redo', async () => {
    await expect(mgr.undo()).rejects.toMatchObject({ code: 'nothing-to-undo' })
    await expect(mgr.redo()).rejects.toMatchObject({ code: 'nothing-to-redo' })
  })
})

describe('staleness', () => {
  it('undo of an externally-changed entity is history-stale and clears history', async () => {
    let sig = 'v2'
    await mgr.invoke(mut('S', { appliedSignature: 'v2', currentSignature: () => sig }))
    sig = 'v3' // external/manual edit moved the entity
    await expect(mgr.undo()).rejects.toMatchObject({ code: 'history-stale' })
    expect(mgr.canUndo).toBe(false)
    expect(mgr.canRedo).toBe(false)
    expect(log).toEqual(['apply:S']) // revert never ran
  })

  it('redo of an externally-changed entity is history-stale', async () => {
    let sig = 'v1'
    await mgr.invoke(mut('S', { revertedSignature: 'v1', currentSignature: () => sig }))
    await mgr.undo()
    sig = 'v9'
    await expect(mgr.redo()).rejects.toMatchObject({ code: 'history-stale' })
  })
})

describe('taint on compensation failure', () => {
  it('a failed revert taints the manager and disables all further dispatch', async () => {
    await mgr.invoke(mut('X', { revert: async () => { throw new Error('disk full') } }))
    await expect(mgr.undo()).rejects.toMatchObject({ code: 'tainted' })
    expect(mgr.isTainted).toBe(true)
    expect(mgr.canUndo).toBe(false)
    expect(mgr.canRedo).toBe(false)
    await expect(mgr.invoke(mut('Y'))).rejects.toMatchObject({ code: 'tainted' })
    await expect(mgr.undo()).rejects.toMatchObject({ code: 'tainted' })
  })

  it('a failed re-apply during redo also taints', async () => {
    let fail = false
    await mgr.invoke(mut('R', { apply: async () => { if (fail) throw new Error('boom'); log.push('apply:R') } }))
    await mgr.undo()
    fail = true
    await expect(mgr.redo()).rejects.toMatchObject({ code: 'tainted' })
    expect(mgr.isTainted).toBe(true)
  })

  it('clear() recovers from taint (reload)', async () => {
    await mgr.invoke(mut('X', { revert: async () => { throw new Error('x') } }))
    await mgr.undo().catch(() => {})
    expect(mgr.isTainted).toBe(true)
    mgr.clear()
    expect(mgr.isTainted).toBe(false)
    expect(mgr.canUndo).toBe(false)
    await mgr.invoke(mut('Z')) // usable again
    expect(mgr.canUndo).toBe(true)
  })
})

describe('serialization / re-entrancy', () => {
  it('blocks a concurrent invoke while one is in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const first = mgr.invoke(mut('A', { apply: () => gate }))
    await expect(mgr.invoke(mut('B'))).rejects.toMatchObject({ code: 'busy' })
    release()
    await first
    expect(mgr.historyDepth).toBe(1)
  })

  it('blocks re-entrant undo called from within a mutation', async () => {
    const reentrant = mut('R', { apply: async () => { await mgr.undo() } })
    await expect(mgr.invoke(reentrant)).rejects.toMatchObject({ code: 'busy' })
  })
})

describe('clear', () => {
  it('empties history (archive switch / reload)', async () => {
    await mgr.invoke(mut('A'))
    await mgr.invoke(mut('B'))
    mgr.clear()
    expect(mgr.canUndo).toBe(false)
    expect(mgr.canRedo).toBe(false)
    expect(mgr.historyDepth).toBe(0)
  })
})
