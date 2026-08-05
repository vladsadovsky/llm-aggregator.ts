/**
 * Shared LLM HTTP JSON transport (design-review P0 / H2).
 *
 * Bounded wall-clock timeout, AbortSignal support, and a decoded-body ceiling.
 * Injectable fetch keeps unit tests free of the network. Errors are stable codes
 * with safe messages - never response bodies, stacks, or secrets.
 */

export type LlmTransportErrorCode =
  | 'timeout'
  | 'cancelled'
  | 'network'
  | 'http-error'
  | 'response-too-large'
  | 'malformed-json'

export class LlmTransportError extends Error {
  readonly code: LlmTransportErrorCode
  readonly status?: number

  constructor(code: LlmTransportErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'LlmTransportError'
    this.code = code
    this.status = status
  }
}

/** Default wall-clock budget for one LLM HTTP call. */
export const LLM_FETCH_TIMEOUT_MS = 45_000
/** Decoded response body ceiling (16 MiB) - enough for chat/embed JSON, not streams of archive text. */
export const LLM_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

export interface HttpJsonInit {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes?: number
}

/**
 * Minimal fetch surface used by providers and tests. Matches what the bounded
 * transport needs without depending on the full DOM Response type.
 */
export interface HttpFetch {
  (input: string, init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  }): Promise<{
    ok: boolean
    status: number
    headers?: { get(name: string): string | null }
    arrayBuffer(): Promise<ArrayBuffer>
    json(): Promise<unknown>
    text(): Promise<string>
  }>
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  return name === 'AbortError' || name === 'TimeoutError'
}

function abortError(timedOut: boolean, outerAborted: boolean): LlmTransportError {
  if (outerAborted || !timedOut) {
    return new LlmTransportError('cancelled', 'The request was cancelled.')
  }
  return new LlmTransportError('timeout', 'The model endpoint took too long to respond.')
}

/**
 * GET/POST JSON with timeout + optional caller AbortSignal + byte ceiling.
 * Throws `LlmTransportError` only.
 */
export async function fetchJsonBounded(
  url: string,
  init: HttpJsonInit = {},
  fetchImpl: HttpFetch = globalThis.fetch as unknown as HttpFetch,
): Promise<unknown> {
  const timeoutMs = init.timeoutMs ?? LLM_FETCH_TIMEOUT_MS
  const maxBytes = init.maxBytes ?? LLM_MAX_RESPONSE_BYTES
  const outer = init.signal

  if (outer?.aborted) {
    throw new LlmTransportError('cancelled', 'The request was cancelled.')
  }

  const controller = new AbortController()
  let timedOut = false
  const onOuterAbort = () => controller.abort()
  outer?.addEventListener('abort', onOuterAbort, { once: true })

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    let response
    try {
      response = await fetchImpl(url, {
        method: init.method ?? 'GET',
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
      })
    } catch (err) {
      if (outer?.aborted || timedOut || isAbortError(err)) {
        throw abortError(timedOut, outer?.aborted === true)
      }
      throw new LlmTransportError('network', 'Cannot reach the model endpoint. Check the server and your network.')
    }

    let buffer: ArrayBuffer
    try {
      if (typeof response.arrayBuffer === 'function') {
        buffer = await response.arrayBuffer()
      } else {
        const text = await response.text()
        buffer = new TextEncoder().encode(text).buffer
      }
    } catch (err) {
      if (outer?.aborted || timedOut || isAbortError(err)) {
        throw abortError(timedOut, outer?.aborted === true)
      }
      throw new LlmTransportError('network', 'Cannot reach the model endpoint. Check the server and your network.')
    }

    if (buffer.byteLength > maxBytes) {
      throw new LlmTransportError('response-too-large', 'The model response exceeded the size limit.')
    }

    if (!response.ok) {
      throw new LlmTransportError(
        'http-error',
        `Model endpoint failed (HTTP ${response.status}).`,
        response.status,
      )
    }

    if (buffer.byteLength === 0) return null
    try {
      const text = new TextDecoder('utf-8').decode(buffer)
      return JSON.parse(text) as unknown
    } catch {
      throw new LlmTransportError('malformed-json', 'The model endpoint returned malformed JSON.')
    }
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', onOuterAbort)
  }
}

/** Map a transport error to a short user-facing message (no codes required by callers). */
export function transportErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof LlmTransportError) return err.message
  if (err instanceof Error && err.message) return err.message
  return fallback
}