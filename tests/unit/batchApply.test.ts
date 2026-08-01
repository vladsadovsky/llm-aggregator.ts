/**
 * INV-DATA / INV-LLM (0.2): applying batch proposals is a separate validated
 * command. It writes only to targets whose current content still matches the
 * hash captured at generation time — a changed target is skipped as stale, a
 * vanished one is reported, and per-item write failures never abort the batch.
 */
import { describe, it, expect, vi } from 'vitest'
import { applyBatchProposals, hashContent, type ApplyTarget } from '../../electron/services/llm/batchRunner'

function targets(...entries: Array<[string, string]>): ApplyTarget[] {
  return entries.map(([id, expectedHash]) => ({ id, expectedHash }))
}

describe('applyBatchProposals', () => {
  it('applies only targets whose current hash matches the captured hash', () => {
    const apply = vi.fn()
    const current = (id: string) => (id === 'a' ? 'h-a' : 'h-b')
    const result = applyBatchProposals(targets(['a', 'h-a'], ['b', 'h-b']), current, apply)

    expect(apply).toHaveBeenCalledTimes(2)
    expect(result.applied).toEqual(['a', 'b'])
    expect(result).toMatchObject({ skippedStale: [], vanished: [], failed: [] })
  })

  it('skips a target whose content changed since generation (stale-target)', () => {
    const apply = vi.fn()
    const result = applyBatchProposals(targets(['a', 'old-hash']), () => 'new-hash', apply)

    expect(apply).not.toHaveBeenCalled()
    expect(result.skippedStale).toEqual(['a'])
    expect(result.applied).toEqual([])
  })

  it('reports a vanished target (current hash null) without applying', () => {
    const apply = vi.fn()
    const result = applyBatchProposals(targets(['gone', 'h']), () => null, apply)

    expect(apply).not.toHaveBeenCalled()
    expect(result.vanished).toEqual(['gone'])
  })

  it('isolates a per-item write failure and still applies the rest', () => {
    const apply = vi.fn((id: string) => {
      if (id === 'b') throw new Error('disk full')
    })
    const current = () => 'h'
    const result = applyBatchProposals(targets(['a', 'h'], ['b', 'h'], ['c', 'h']), current, apply)

    expect(result.applied).toEqual(['a', 'c'])
    expect(result.failed).toEqual([{ id: 'b', message: 'disk full' }])
  })

  it('produces an accurate partial result across all four outcomes', () => {
    const hashes: Record<string, string | null> = {
      ok: 'h-ok',
      stale: 'now-different',
      gone: null,
      fail: 'h-fail',
    }
    const apply = vi.fn((id: string) => {
      if (id === 'fail') throw new Error('nope')
    })
    const result = applyBatchProposals(
      targets(['ok', 'h-ok'], ['stale', 'was-h-stale'], ['gone', 'h-gone'], ['fail', 'h-fail']),
      (id) => hashes[id],
      apply,
    )

    expect(result.applied).toEqual(['ok'])
    expect(result.skippedStale).toEqual(['stale'])
    expect(result.vanished).toEqual(['gone'])
    expect(result.failed).toEqual([{ id: 'fail', message: 'nope' }])
  })
})

describe('hashContent', () => {
  it('is deterministic for identical content', () => {
    expect(hashContent('hello world')).toBe(hashContent('hello world'))
  })

  it('differs when content changes (the basis of the staleness check)', () => {
    expect(hashContent('a')).not.toBe(hashContent('a '))
  })
})
