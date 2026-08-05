import { describe, it, expect, beforeEach } from 'vitest'
import {
  beginSuggestionJob,
  cancelSuggestionJob,
  finishSuggestionJob,
  getSuggestionJobSignal,
  resetSuggestionJobsForTests,
} from '../../electron/services/llm/suggestionJobs'

beforeEach(() => resetSuggestionJobsForTests())

describe('suggestionJobs', () => {
  it('registers a live AbortSignal for a new job', () => {
    const id = beginSuggestionJob()
    const signal = getSuggestionJobSignal(id)
    expect(signal).toBeTruthy()
    expect(signal?.aborted).toBe(false)
  })

  it('cancel aborts and drops the job', () => {
    const id = beginSuggestionJob()
    const signal = getSuggestionJobSignal(id)!
    cancelSuggestionJob(id)
    expect(signal.aborted).toBe(true)
    expect(getSuggestionJobSignal(id)).toBeNull()
  })

  it('finish drops without aborting', () => {
    const id = beginSuggestionJob()
    const signal = getSuggestionJobSignal(id)!
    finishSuggestionJob(id)
    expect(signal.aborted).toBe(false)
    expect(getSuggestionJobSignal(id)).toBeNull()
  })

  it('cancel is safe for unknown ids', () => {
    expect(() => cancelSuggestionJob('missing')).not.toThrow()
  })
})
