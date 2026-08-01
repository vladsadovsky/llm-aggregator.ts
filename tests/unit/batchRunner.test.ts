/**
 * INV-LLM / INV-COST (0.2): the generic batch runner is read-only, cancellable
 * between batches, calls the (already-metered) provider exactly once per batch,
 * strips only known fence wrappers, validates through the job's parser, and
 * rejects duplicate/unknown ids without trusting model text. Generation writes
 * nothing — application is a separate, staleness-checked command (batchApply).
 */
import { describe, it, expect, vi } from 'vitest'
import {
  runBatchJob,
  stripJsonFences,
  type BatchItem,
  type BatchJobSpec,
  type BatchProgress,
} from '../../electron/services/llm/batchRunner'
import type { CompletionProvider } from '../../electron/services/llm/types'

interface Rec {
  id: string
  value: string
}

/** A provider whose responses are scripted per call, with a spy on complete(). */
function fakeProvider(responder: (userPrompt: string, call: number) => string | Promise<string>) {
  let call = 0
  const complete = vi.fn((userPrompt: string) => Promise.resolve(responder(userPrompt, call++)))
  const provider: CompletionProvider = { complete, testConnection: () => Promise.resolve() }
  return { provider, complete }
}

/** Items with ids i1..iN. */
function items(n: number): BatchItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `i${i + 1}`,
    content: `content-${i + 1}`,
    contentHash: `h${i + 1}`,
  }))
}

/** Spec that echoes every batch item back as an accepted proposal. */
function echoSpec(batchSize: number): BatchJobSpec<Rec> {
  return {
    batchSize,
    systemPrompt: 'sys',
    buildPrompt: (batch) => JSON.stringify(batch.map((it) => it.id)),
    parseResponse: (text) => JSON.parse(text) as Array<{ id: string } & Record<string, unknown>>,
    toProposal: (record) => ({ id: record.id, value: String(record.value ?? 'ok') }),
  }
}

/** Given a batch prompt (a JSON array of ids), respond with a record per id. */
function echoResponse(userPrompt: string): string {
  const ids = JSON.parse(userPrompt) as string[]
  return JSON.stringify(ids.map((id) => ({ id, value: 'ok' })))
}

describe('runBatchJob', () => {
  it('chunks items by batchSize and calls the provider once per batch', async () => {
    const { provider, complete } = fakeProvider(echoResponse)
    const result = await runBatchJob(echoSpec(2), items(5), provider)

    expect(complete).toHaveBeenCalledTimes(3) // 2 + 2 + 1
    expect(result.proposals.map((p) => p.id)).toEqual(['i1', 'i2', 'i3', 'i4', 'i5'])
    expect(result.errors).toEqual([])
    expect(result.cancelled).toBe(false)
  })

  it('passes the system prompt to the provider on every batch', async () => {
    const { provider, complete } = fakeProvider(echoResponse)
    await runBatchJob(echoSpec(2), items(3), provider)
    for (const callArgs of complete.mock.calls) {
      expect(callArgs[1]).toBe('sys')
    }
  })

  it('does nothing for zero targets and never calls the provider', async () => {
    const { provider, complete } = fakeProvider(echoResponse)
    const result = await runBatchJob(echoSpec(2), [], provider)
    expect(complete).not.toHaveBeenCalled()
    expect(result).toEqual({ proposals: [], errors: [], cancelled: false })
  })

  it('emits progress once per batch with cumulative counts', async () => {
    const { provider } = fakeProvider(echoResponse)
    const progress: BatchProgress[] = []
    await runBatchJob(echoSpec(2), items(5), provider, { onProgress: (p) => progress.push({ ...p }) })

    expect(progress).toEqual([
      { processed: 2, total: 5, batchesDone: 1, batchesTotal: 3 },
      { processed: 4, total: 5, batchesDone: 2, batchesTotal: 3 },
      { processed: 5, total: 5, batchesDone: 3, batchesTotal: 3 },
    ])
  })

  it('does no work when the signal is already aborted (cancel before first batch)', async () => {
    const { provider, complete } = fakeProvider(echoResponse)
    const controller = new AbortController()
    controller.abort()
    const result = await runBatchJob(echoSpec(2), items(4), provider, { signal: controller.signal })

    expect(complete).not.toHaveBeenCalled()
    expect(result.cancelled).toBe(true)
    expect(result.proposals).toEqual([])
  })

  it('stops before the next batch when cancelled mid-run', async () => {
    const controller = new AbortController()
    const { provider, complete } = fakeProvider((userPrompt, call) => {
      if (call === 0) controller.abort() // abort during the first batch
      return echoResponse(userPrompt)
    })
    const result = await runBatchJob(echoSpec(2), items(6), provider, { signal: controller.signal })

    expect(complete).toHaveBeenCalledTimes(1) // first batch ran, second was not started
    expect(result.cancelled).toBe(true)
    expect(result.proposals.map((p) => p.id)).toEqual(['i1', 'i2'])
  })

  it('isolates a provider failure to its batch and continues (partial success)', async () => {
    const { provider } = fakeProvider((userPrompt, call) => {
      if (call === 1) throw new Error('boom')
      return echoResponse(userPrompt)
    })
    const result = await runBatchJob(echoSpec(2), items(6), provider)

    expect(result.errors).toEqual([{ scope: 'batch 2', message: 'boom' }])
    // batches 1 and 3 still produced proposals
    expect(result.proposals.map((p) => p.id)).toEqual(['i1', 'i2', 'i5', 'i6'])
    expect(result.cancelled).toBe(false)
  })

  it('records an error and skips the batch on unparseable/invalid response', async () => {
    const { provider } = fakeProvider((userPrompt, call) =>
      call === 0 ? 'not json at all' : echoResponse(userPrompt),
    )
    const result = await runBatchJob(echoSpec(2), items(4), provider)

    expect(result.errors).toEqual([{ scope: 'batch 1', message: 'unparseable or invalid response' }])
    expect(result.proposals.map((p) => p.id)).toEqual(['i3', 'i4'])
  })

  it('strips a known JSON code fence before parsing', async () => {
    const { provider } = fakeProvider(
      (userPrompt) => '```json\n' + echoResponse(userPrompt) + '\n```',
    )
    const result = await runBatchJob(echoSpec(2), items(2), provider)
    expect(result.errors).toEqual([])
    expect(result.proposals.map((p) => p.id)).toEqual(['i1', 'i2'])
  })

  it('rejects a record whose id was not in the batch (unknown-id)', async () => {
    const { provider } = fakeProvider(() =>
      JSON.stringify([
        { id: 'i1', value: 'ok' },
        { id: 'ghost', value: 'x' },
      ]),
    )
    const result = await runBatchJob(echoSpec(2), items(2), provider)

    expect(result.errors).toContainEqual({ scope: 'ghost', message: 'unknown-id' })
    expect(result.proposals.map((p) => p.id)).toEqual(['i1'])
  })

  it('rejects a second record for the same id (duplicate-id)', async () => {
    const { provider } = fakeProvider(() =>
      JSON.stringify([
        { id: 'i1', value: 'first' },
        { id: 'i1', value: 'second' },
      ]),
    )
    const result = await runBatchJob(echoSpec(2), items(2), provider)

    expect(result.errors).toContainEqual({ scope: 'i1', message: 'duplicate-id' })
    expect(result.proposals).toEqual([{ id: 'i1', value: 'first' }])
  })

  it('drops a record the spec maps to null (e.g. invalid enum) without erroring', async () => {
    const spec: BatchJobSpec<Rec> = {
      ...echoSpec(2),
      toProposal: (record) => (record.value === 'bad' ? null : { id: record.id, value: String(record.value) }),
    }
    const { provider } = fakeProvider(() =>
      JSON.stringify([
        { id: 'i1', value: 'good' },
        { id: 'i2', value: 'bad' },
      ]),
    )
    const result = await runBatchJob(spec, items(2), provider)

    expect(result.errors).toEqual([])
    expect(result.proposals).toEqual([{ id: 'i1', value: 'good' }])
  })
})

describe('stripJsonFences', () => {
  it('strips a ```json fence', () => {
    expect(stripJsonFences('```json\n[1,2]\n```')).toBe('[1,2]')
  })
  it('strips a bare ``` fence', () => {
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('leaves unfenced text untouched (trimmed)', () => {
    expect(stripJsonFences('  [1]  ')).toBe('[1]')
  })
})
