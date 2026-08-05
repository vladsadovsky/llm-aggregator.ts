/**
 * Convert a value into a structured-clone-safe plain object for Electron IPC.
 *
 * Vue `ref` / `reactive` values are Proxies. `ipcRenderer.invoke` uses the
 * structured clone algorithm, which throws "Object could not be cloned" on
 * Proxies even when every leaf is a primitive. JSON round-trip is the same
 * strip used by thread saves and the settings draft composable.
 */
export function toIpcPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
