/**
 * Validated IPC handler registrar (`INV-IPC`, `INV-OBS`).
 *
 * Every privileged channel is registered through `createRegistrar(...).handle`,
 * which, before any service code runs:
 *   1. rejects untrusted senders/frames (zero side effects),
 *   2. parses the argument tuple against the canonical schema, and
 *   3. maps thrown errors to stable, redacted codes — no stack, path, secret,
 *      or provider body ever crosses the bridge.
 *
 * Success values pass through unchanged (the renderer keeps its existing return
 * shapes); only failures are coerced into the coded wire format.
 */
import { ipcMain, type IpcMainInvokeEvent, type IpcMain } from 'electron'
import {
  channelArgs,
  summarizeIssues,
  IpcError,
  ipcError,
  encodeIpcErrorMessage,
  type Channel,
  type ArgsOf,
} from '../../shared/contracts'
import { debugError } from '../services/logger'
import { isTrustedSender, type SenderPolicy } from './senderPolicy'

/** Build a fresh Error whose message carries only the safe code + text. */
function toWireError(err: IpcError): Error {
  return new Error(encodeIpcErrorMessage(err.code, err.message))
}

/** Map any thrown value to a redacted wire error. */
function handlerError(channel: Channel, err: unknown): Error {
  if (err instanceof IpcError) return toWireError(err)
  // Unexpected: log the real detail main-side only, surface a generic code.
  debugError(`[ipc] ${channel} failed:`, err)
  return toWireError(ipcError('internal', 'An unexpected error occurred.'))
}

export interface HandlerRegistrar {
  handle<C extends Channel>(
    channel: C,
    handler: (event: IpcMainInvokeEvent, ...args: ArgsOf<C>) => unknown,
  ): void
  /** Channels registered so far — used by the parity test. */
  registered(): Channel[]
}

export function createRegistrar(policy: SenderPolicy, ipc: IpcMain = ipcMain): HandlerRegistrar {
  const seen = new Set<Channel>()
  return {
    handle(channel, handler) {
      if (seen.has(channel)) {
        throw new Error(`IPC channel registered twice: ${channel}`)
      }
      seen.add(channel)
      const schema = channelArgs[channel]
      ipc.handle(channel, async (event: IpcMainInvokeEvent, ...raw: unknown[]) => {
        if (!isTrustedSender(event, policy)) {
          throw toWireError(ipcError('invalid-sender', 'Rejected untrusted IPC sender.'))
        }
        const parsed = schema.safeParse(raw)
        if (!parsed.success) {
          throw toWireError(ipcError('invalid-payload', summarizeIssues(parsed.error)))
        }
        try {
          return await handler(event, ...(parsed.data as ArgsOf<typeof channel>))
        } catch (err) {
          throw handlerError(channel, err)
        }
      })
    },
    registered() {
      return [...seen]
    },
  }
}
