/**
 * P0-J: one command registry drives menu, palette, and keyboard identically —
 * unique ids, dispatch parity, feature-gated visibility, disabled reasons, and
 * shortcut metadata for the palette filter.
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useCommandRegistry, type CommandDef } from '../../src/composables/useCommandRegistry'

function cmd(over: Partial<CommandDef> & { id: string }): CommandDef {
  return { label: over.id, run: () => {}, ...over }
}

describe('useCommandRegistry', () => {
  it('throws on a duplicate id', () => {
    const r = useCommandRegistry()
    r.register([cmd({ id: 'a' })])
    expect(() => r.register([cmd({ id: 'a' })])).toThrow(/duplicate command id: a/)
  })

  it('dispatch runs the command (menu/palette parity via one path)', () => {
    const run = vi.fn()
    const r = useCommandRegistry()
    r.register([cmd({ id: 'qa.new', run })])
    expect(r.dispatch('qa.new')).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('dispatch of an unknown id is a no-op returning false', () => {
    const r = useCommandRegistry()
    expect(r.dispatch('nope')).toBe(false)
  })

  it('hides and refuses to dispatch a feature-gated command', () => {
    const run = vi.fn()
    const lens = ref(false) // a real reactive gate, as lensEnabled is in the app
    const r = useCommandRegistry()
    r.register([cmd({ id: 'view.lens', run, isVisible: () => lens.value })])
    expect(r.isVisible('view.lens')).toBe(false)
    expect(r.dispatch('view.lens')).toBe(false)
    expect(run).not.toHaveBeenCalled()
    expect(r.commands.value.map((c) => c.id)).not.toContain('view.lens')

    lens.value = true
    expect(r.isVisible('view.lens')).toBe(true)
    expect(r.dispatch('view.lens')).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    expect(r.commands.value.map((c) => c.id)).toContain('view.lens')
  })

  it('does not run a disabled command and exposes its reason', () => {
    const run = vi.fn()
    const r = useCommandRegistry()
    r.register([cmd({ id: 'qa.save', run, disabledReason: () => 'no unsaved changes' })])
    expect(r.isEnabled('qa.save')).toBe(false)
    expect(r.disabledReason('qa.save')).toBe('no unsaved changes')
    expect(r.dispatch('qa.save')).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('filters visible commands by label and shortcut', () => {
    const r = useCommandRegistry()
    r.register([
      cmd({ id: 'qa.new', label: 'New Q&A', shortcut: 'Ctrl+N' }),
      cmd({ id: 'thread.new', label: 'New Thread', shortcut: 'Ctrl+T' }),
      cmd({ id: 'app.settings', label: 'Open Settings', shortcut: 'Ctrl+,' }),
    ])
    expect(r.filter('new').map((c) => c.id)).toEqual(['qa.new', 'thread.new'])
    expect(r.filter('ctrl+t').map((c) => c.id)).toEqual(['thread.new'])
    expect(r.filter('').map((c) => c.id)).toHaveLength(3)
  })

  it('filter excludes hidden commands', () => {
    const r = useCommandRegistry()
    r.register([
      cmd({ id: 'view.lens', label: 'Toggle LLM Lens', isVisible: () => false }),
      cmd({ id: 'qa.new', label: 'New Q&A' }),
    ])
    expect(r.filter('').map((c) => c.id)).toEqual(['qa.new'])
  })
})
