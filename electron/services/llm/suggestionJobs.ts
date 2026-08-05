/**
 * In-flight suggestion job registry (design-review P0 / H2 cancel).
 *
 * One AbortController per job id. The renderer starts a job (gets an id), the
 * main handler races the work against that signal, and cancel aborts it. Jobs
 * auto-expire so a crashed renderer cannot pin controllers forever.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000

interface JobEntry {
  controller: AbortController
  timer: ReturnType<typeof setTimeout>
}

const jobs = new Map<string, JobEntry>()

function clearJob(id: string): void {
  const entry = jobs.get(id)
  if (!entry) return
  clearTimeout(entry.timer)
  jobs.delete(id)
}

/** Register a new abortable job and return its id. */
export function beginSuggestionJob(ttlMs: number = DEFAULT_TTL_MS): string {
  const id = crypto.randomUUID()
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
    jobs.delete(id)
  }, ttlMs)
  // Do not keep the process alive solely for job TTLs.
  if (typeof timer === 'object' && 'unref' in timer) {
    ;(timer as NodeJS.Timeout).unref()
  }
  jobs.set(id, { controller, timer })
  return id
}

export function getSuggestionJobSignal(jobId: string): AbortSignal | null {
  return jobs.get(jobId)?.controller.signal ?? null
}

/** Abort and drop a job. Safe if the id is unknown or already finished. */
export function cancelSuggestionJob(jobId: string): void {
  const entry = jobs.get(jobId)
  if (!entry) return
  entry.controller.abort()
  clearJob(jobId)
}

/** Drop a finished job without aborting (success or handled failure). */
export function finishSuggestionJob(jobId: string): void {
  clearJob(jobId)
}

/** Test helper. */
export function resetSuggestionJobsForTests(): void {
  for (const id of [...jobs.keys()]) clearJob(id)
}
