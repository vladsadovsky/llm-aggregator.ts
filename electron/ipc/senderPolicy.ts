/**
 * IPC sender/frame guard (`INV-IPC`).
 *
 * A privileged channel may be invoked only by the main window's top frame,
 * loaded from an approved origin. Any other webContents (e.g. the Gemini hidden
 * import window), any subframe/iframe, a destroyed sender, or an off-origin
 * frame is rejected before argument parsing or any service call.
 */
import type { WebContents } from 'electron'

export interface SenderPolicy {
  /** Current trusted main-window webContents; null before load / after close. */
  trusted: () => WebContents | null
  /** Allowed top-frame origins. Empty array skips the origin check. */
  allowedOrigins: () => readonly string[]
}

/**
 * Minimal structural shape of an `IpcMainInvokeEvent` for testing without a real
 * Electron event. Real events satisfy this.
 */
export interface SenderCheckEvent {
  readonly sender: {
    readonly mainFrame: unknown
    isDestroyed?: () => boolean
  }
  readonly senderFrame: { readonly url?: string } | null
}

export function isTrustedSender(event: SenderCheckEvent, policy: SenderPolicy): boolean {
  const trusted = policy.trusted()
  if (!trusted) return false
  // Identity: only the exact trusted webContents may invoke.
  if ((event.sender as unknown) !== (trusted as unknown)) return false
  if (event.sender.isDestroyed?.()) return false

  const frame = event.senderFrame
  if (!frame) return false
  // Top frame only — a subframe/iframe has a different WebFrameMain identity.
  if ((frame as unknown) !== event.sender.mainFrame) return false

  const origins = policy.allowedOrigins()
  if (origins.length > 0) {
    let origin: string
    try {
      origin = new URL(frame.url ?? '').origin
    } catch {
      return false
    }
    if (!origins.includes(origin)) return false
  }
  return true
}
