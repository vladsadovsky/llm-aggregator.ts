/**
 * Phase 0.J — canonical command registry (renderer core).
 *
 * Every end-user action is one entry `{ id, label, shortcut?, run, isVisible?,
 * disabledReason? }`. The native menu, the command palette, and the keyboard
 * handler all `dispatch(id)` through this single registry, so menu/palette
 * behaviour cannot drift and a feature-gated or disabled command is unavailable
 * everywhere at once. IDs are unique (registering a duplicate throws).
 *
 * This is the reusable core extracted from `App.vue`'s `appCommands`; wiring the
 * concrete commands + native menu into it is a renderer integration step.
 */
import { computed, type ComputedRef } from 'vue'

export interface CommandDef {
  id: string
  label: string
  /** Display-only accelerator hint; keyboard handling stays in one place. */
  shortcut?: string
  run: () => void
  /** Hidden from menu/palette (and non-dispatchable) when this returns false. */
  isVisible?: () => boolean
  /** A non-null string disables the command and explains why; it will not run. */
  disabledReason?: () => string | null
}

export interface CommandRegistry {
  register(commands: CommandDef[]): void
  /** All currently visible commands. */
  readonly commands: ComputedRef<CommandDef[]>
  get(id: string): CommandDef | undefined
  isVisible(id: string): boolean
  isEnabled(id: string): boolean
  disabledReason(id: string): string | null
  /** Run a command by id iff it exists, is visible, and is enabled. Returns whether it ran. */
  dispatch(id: string): boolean
  /** Visible commands filtered by a query over label + shortcut (palette). */
  filter(query: string): CommandDef[]
}

export function useCommandRegistry(): CommandRegistry {
  const map = new Map<string, CommandDef>()

  function register(commands: CommandDef[]) {
    for (const command of commands) {
      if (map.has(command.id)) throw new Error(`duplicate command id: ${command.id}`)
      map.set(command.id, command)
    }
  }

  const get = (id: string) => map.get(id)
  const isVisible = (id: string) => {
    const c = map.get(id)
    return c ? (c.isVisible ? c.isVisible() : true) : false
  }
  const disabledReason = (id: string) => {
    const c = map.get(id)
    return c && c.disabledReason ? c.disabledReason() : null
  }
  const isEnabled = (id: string) => isVisible(id) && disabledReason(id) === null

  function dispatch(id: string): boolean {
    const c = map.get(id)
    if (!c || !isVisible(id) || !isEnabled(id)) return false
    c.run()
    return true
  }

  const commands = computed(() => [...map.values()].filter((c) => (c.isVisible ? c.isVisible() : true)))

  function filter(query: string): CommandDef[] {
    const q = query.trim().toLowerCase()
    const visible = commands.value
    if (!q) return visible
    return visible.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.shortcut ?? '').toLowerCase().includes(q),
    )
  }

  return { register, commands, get, isVisible, isEnabled, disabledReason, dispatch, filter }
}
