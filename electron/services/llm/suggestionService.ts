import { z } from 'zod'
import { getCompletionProvider } from './providerFactory'
import { getPair } from '../qaPairService'
import { loadThreads } from '../threadService'
import { loadDictionary } from '../tagDictionaryService'
import { loadSettings } from '../settingsService'
import { assertCanCallLlm } from './llmCallGuard'
import {
  beginSuggestionJob,
  cancelSuggestionJob,
  finishSuggestionJob,
  getSuggestionJobSignal,
} from './suggestionJobs'

export interface QaSuggestion {
  title: string
  tags: string[]
}

export interface SuggestionJobStart {
  jobId: string
}

const QaSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  tags: z.array(z.string().trim().min(1).max(64)).min(1).max(8),
}).strict()
const TitleSchema = z.object({ title: z.string().trim().min(1).max(160) }).strict()

function parseJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) } catch { throw new Error('The model returned invalid structured output. Try again or edit manually.') }
}

function normalizedTags(tags: string[]): string[] {
  const seen = new Set<string>()
  return tags.map(tag => tag.trim().toLowerCase()).filter((tag) => {
    if (!tag || seen.has(tag)) return false
    seen.add(tag)
    return true
  })
}

function vocabPrompt(): string {
  const dictionary = Object.keys(loadDictionary().tags).sort().slice(0, 300)
  const settings = loadSettings()
  const hardReached = settings.tagEnforcement === 'strict' || dictionary.length >= settings.tagHardLimit
  return `Existing tag vocabulary (prefer these): ${JSON.stringify(dictionary)}\n` +
    (hardReached ? 'Only return tags from the existing vocabulary.' : 'You may propose concise new tags when needed.')
}

function resolveJobSignal(jobId?: string): AbortSignal | undefined {
  if (!jobId) return undefined
  const signal = getSuggestionJobSignal(jobId)
  if (!signal) throw new Error('Suggestion job is not active or has expired. Try again.')
  return signal
}

export function startSuggestionJob(): SuggestionJobStart {
  return { jobId: beginSuggestionJob() }
}

export function abortSuggestionJob(jobId: string): void {
  cancelSuggestionJob(jobId)
}

export async function suggestQa(id: string, jobId?: string): Promise<QaSuggestion> {
  assertCanCallLlm({ capability: 'complete' })
  const pair = getPair(id)
  if (!pair) throw new Error('Q&A not found.')
  const signal = resolveJobSignal(jobId)
  try {
    const provider = getCompletionProvider()
    const raw = await provider.complete(
      `${vocabPrompt()}\n\nQ&A title: ${pair.title}\nQuestion:\n${pair.question}\n\nAnswer:\n${pair.answer}`,
      'Return JSON only: {"title":"concise title, max 80 characters","tags":["3 to 5 concise tags"]}. Do not write or alter archive data.',
      { signal },
    )
    if (signal?.aborted) throw new Error('The request was cancelled.')
    const parsed = QaSuggestionSchema.safeParse(parseJson(raw))
    if (!parsed.success) throw new Error('The model response did not match the title/tag suggestion format.')
    return { title: parsed.data.title.trim().slice(0, 80), tags: normalizedTags(parsed.data.tags).slice(0, 5) }
  } finally {
    if (jobId) finishSuggestionJob(jobId)
  }
}

/** Build a bounded representative context; selected-thread title generation is never archive-scale. */
export async function suggestThreadTitle(threadId: string, jobId?: string): Promise<string> {
  assertCanCallLlm({ capability: 'complete' })
  const thread = loadThreads()[threadId]
  if (!thread) throw new Error('Thread not found.')
  const excerpts = thread.items.slice(0, 20).flatMap((id) => {
    const pair = getPair(id)
    return pair ? [`Title: ${pair.title}`, `Question: ${pair.question.slice(0, 600)}`] : []
  }).join('\n')
  if (!excerpts) throw new Error('The selected thread has no readable Q&As.')
  const signal = resolveJobSignal(jobId)
  try {
    const provider = getCompletionProvider()
    const raw = await provider.complete(
      `Current thread name: ${thread.name}\n\nRepresentative Q&As:\n${excerpts}`,
      'Return JSON only: {"title":"concise thread title, max 80 characters"}. Do not write or alter archive data.',
      { signal },
    )
    if (signal?.aborted) throw new Error('The request was cancelled.')
    const parsed = TitleSchema.safeParse(parseJson(raw))
    if (!parsed.success) throw new Error('The model response did not match the thread-title format.')
    return parsed.data.title.trim().slice(0, 80)
  } finally {
    if (jobId) finishSuggestionJob(jobId)
  }
}
