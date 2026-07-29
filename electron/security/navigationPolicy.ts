/**
 * electron/security/navigationPolicy.ts
 * Pure navigation / external-link policy (SEC-01), free of Electron so it can be
 * unit-tested directly. `main.ts` and `ipc/handlers.ts` are thin wrappers.
 */

export interface AppOriginPolicy {
  /** The Vite dev-server URL when running in dev; undefined in a packaged build. */
  devUrl?: string
  /** The app's own origin — the dev-server origin, or '' for a packaged file: document. */
  appOrigin: string
}

/**
 * True when `target` is a navigation within the app itself (the only navigation
 * the main window is allowed). Dev: same origin as the Vite server. Prod: the
 * packaged `file:` document. Anything else — a remote page reached via an
 * imported link — is denied by the caller.
 */
export function isSameAppNavigation(target: string, policy: AppOriginPolicy): boolean {
  try {
    const u = new URL(target)
    return policy.devUrl ? u.origin === policy.appOrigin : u.protocol === 'file:'
  } catch {
    return false
  }
}

/** Renderer-created windows are always denied (SEC-01). */
export function windowOpenAction(): { action: 'deny' } {
  return { action: 'deny' }
}

/**
 * True when a rendered-content link may be handed to the OS browser. Only
 * `https:` and `mailto:` — `http:` (plaintext) and everything else are refused,
 * so a link is opened only when it is safe to.
 */
export function isExternallyOpenable(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'mailto:'
  } catch {
    return false
  }
}
