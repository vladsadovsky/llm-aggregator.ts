/**
 * Dependency-free IPC error taxonomy and wire encoding.
 *
 * Zod-free on purpose so the sandboxed preload can decode coded errors without
 * pulling a validation library into the renderer. Main-side code gets the same
 * symbols re-exported from `common.ts`.
 */

export const IPC_ERROR_CODES = [
  'invalid-sender',
  'invalid-payload',
  'not-found',
  'load-corrupt',
  'write-failed',
  'cancelled',
  'limit-exceeded',
  'needs-repair',
  'internal',
] as const

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[number]

function isIpcErrorCode(value: string): value is IpcErrorCode {
  return (IPC_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * An intentional, renderer-safe error. The IPC wrapper serializes `code` and
 * `message` and rethrows a fresh Error so no main-process stack (which can
 * contain absolute paths) ever crosses the bridge (`INV-OBS`).
 */
export class IpcError extends Error {
  readonly code: IpcErrorCode
  constructor(code: IpcErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'IpcError'
    this.code = code
  }
}

export function ipcError(code: IpcErrorCode, message?: string): IpcError {
  return new IpcError(code, message)
}

/** Prefix marking a coded error inside a serialized Error message. */
export const IPC_ERROR_PREFIX = 'IPCERR:'

/** Encode a coded error into one serializable message string. */
export function encodeIpcErrorMessage(code: IpcErrorCode, message: string): string {
  // Newlines would let a trailing stack blend into the message on decode.
  return `${IPC_ERROR_PREFIX}${code}:${message.replace(/\s+/g, ' ').trim()}`
}

/**
 * Extract `{code, message}` from a serialized IPC-error string. Electron wraps
 * the remote message ("Error invoking remote method '…': Error: <msg>"), so we
 * scan for the prefix anywhere and stop the message at the first newline.
 */
export function extractWireError(
  raw: string,
): { code: IpcErrorCode; message: string } | null {
  const at = raw.indexOf(IPC_ERROR_PREFIX)
  if (at < 0) return null
  const body = raw.slice(at + IPC_ERROR_PREFIX.length)
  const sep = body.indexOf(':')
  if (sep < 0) return null
  const code = body.slice(0, sep)
  if (!isIpcErrorCode(code)) return null
  const message = body.slice(sep + 1).split('\n')[0].trim()
  return { code, message }
}
