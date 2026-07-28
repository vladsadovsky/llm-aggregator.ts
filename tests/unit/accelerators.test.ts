/**
 * Keeps the four places a keyboard shortcut is described from drifting apart
 * (issue #8). They drifted before: the usage dialog advertised bare `E`/`D` for
 * edit/duplicate long after those became Ctrl+E/Ctrl+D, and `Alt+N` was wired
 * into the handler but documented nowhere.
 *
 * `shared/accelerators.ts` is the source of truth for display; the palette,
 * menu, Shortcuts dialog, and usage text all read from it at runtime, so they
 * cannot disagree by construction. The two things that *can* still drift are
 * checked here by reading the files:
 *
 *   - `src/App.vue`'s `handleGlobalKeydown`, which owns behaviour and is
 *     deliberately hand-written — each branch carries an `// @accel <id>` marker.
 *   - `README.md`'s table, which is static markdown and cannot be generated.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ACCELERATORS,
  acceleratorRows,
  hintFor,
  renderChord,
  renderKeys,
  styleForPlatform,
} from '../../shared/accelerators'

const repoRoot = join(__dirname, '../..')
const appVue = readFileSync(join(repoRoot, 'src/App.vue'), 'utf-8')
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf-8')
const mainTs = readFileSync(join(repoRoot, 'electron/main.ts'), 'utf-8')

/** Ids tagged on branches of handleGlobalKeydown. */
function handlerMarkers(): string[] {
  const start = appVue.indexOf('function handleGlobalKeydown')
  expect(start, 'handleGlobalKeydown not found in src/App.vue').toBeGreaterThan(-1)
  const body = appVue.slice(start)
  return [...body.matchAll(/\/\/ @accel ([\w.]+)/g)].map((m) => m[1])
}

describe('accelerator table', () => {
  it('has unique ids', () => {
    const ids = ACCELERATORS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('binds no chord to two different actions', () => {
    const seen = new Map<string, string>()
    for (const accelerator of ACCELERATORS) {
      for (const chord of accelerator.keys) {
        const existing = seen.get(chord)
        expect(existing, `"${chord}" is bound to both ${existing} and ${accelerator.id}`).toBeUndefined()
        seen.set(chord, accelerator.id)
      }
    }
  })

  it('never leaves a chord or description empty', () => {
    for (const accelerator of ACCELERATORS) {
      expect(accelerator.keys.length, `${accelerator.id} has no chord`).toBeGreaterThan(0)
      expect(accelerator.description.trim(), `${accelerator.id} has no description`).not.toBe('')
      expect(accelerator.context.trim(), `${accelerator.id} has no context`).not.toBe('')
    }
  })

  it('reserves Mod for the platform modifier so Cmd/Ctrl stay in sync', () => {
    // A literal "Ctrl" or "Cmd" in the table would render wrong on one platform.
    for (const accelerator of ACCELERATORS) {
      for (const chord of accelerator.keys) {
        expect(chord, `${accelerator.id} hardcodes a platform modifier`).not.toMatch(/Ctrl|Cmd|Meta|Option/)
      }
    }
  })
})

describe('chord rendering', () => {
  it('maps Mod and Alt per platform', () => {
    expect(renderChord('Mod+Shift+E', 'win')).toBe('Ctrl+Shift+E')
    expect(renderChord('Mod+Shift+E', 'mac')).toBe('Cmd+Shift+E')
    expect(renderChord('Mod+Shift+E', 'both')).toBe('Ctrl/Cmd+Shift+E')
    expect(renderChord('Alt+Up', 'win')).toBe('Alt+Up')
    expect(renderChord('Alt+Up', 'mac')).toBe('Option+Up')
  })

  it('leaves named keys alone', () => {
    expect(renderChord('F2', 'mac')).toBe('F2')
    expect(renderChord('Escape', 'win')).toBe('Escape')
    expect(renderChord('?', 'both')).toBe('?')
  })

  it('joins alternatives with "or"', () => {
    expect(renderKeys(['Mod+F', '/'], 'win')).toBe('Ctrl+F or /')
  })

  it('picks the style from the platform flag', () => {
    expect(styleForPlatform(true)).toBe('mac')
    expect(styleForPlatform(false)).toBe('win')
  })

  it('returns an empty hint for a command with no binding', () => {
    // Most commands (Show All Q&As, Find Duplicates, …) are deliberately unbound.
    expect(hintFor('view.showAll', 'win')).toBe('')
    expect(hintFor('qa.edit', 'win')).toBe('Ctrl+E')
  })
})

describe('handler parity with src/App.vue', () => {
  const markers = handlerMarkers()
  const globalIds = ACCELERATORS.filter((a) => a.scope === 'global').map((a) => a.id)

  it('implements every global accelerator', () => {
    const missing = globalIds.filter((id) => !markers.includes(id))
    expect(
      missing,
      `Declared in shared/accelerators.ts with scope "global" but no "// @accel <id>" branch ` +
        `in handleGlobalKeydown: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('declares every implemented branch', () => {
    const undeclared = markers.filter((id) => !globalIds.includes(id))
    expect(
      undeclared,
      `Handled in handleGlobalKeydown but missing a scope:"global" row in ` +
        `shared/accelerators.ts: ${undeclared.join(', ')}. An undocumented shortcut is how ` +
        `Alt+N survived unnoticed.`,
    ).toEqual([])
  })

  it('marks each branch exactly once', () => {
    const duplicated = markers.filter((id, i) => markers.indexOf(id) !== i)
    expect(duplicated, `Duplicate @accel markers: ${duplicated.join(', ')}`).toEqual([])
  })

  it('does not reintroduce the removed Alt+N binding', () => {
    const start = appVue.indexOf('function handleGlobalKeydown')
    const body = appVue.slice(start)
    expect(body).not.toMatch(/event\.altKey && key === 'n'/)
  })

  it('leaves component-scoped accelerators out of the global handler', () => {
    for (const accelerator of ACCELERATORS.filter((a) => a.scope === 'component')) {
      expect(markers).not.toContain(accelerator.id)
    }
  })
})

describe('palette and menu read the table rather than hardcoding hints', () => {
  it('builds every appCommands entry through the cmd() lookup helper', () => {
    // A literal `shortcut:` string in App.vue means someone bypassed hintFor().
    const registry = appVue.slice(appVue.indexOf('const appCommands'), appVue.indexOf('function handleMenuAction'))
    expect(registry).not.toMatch(/shortcut:\s*['"`]/)
  })

  it('builds every menu item through mi() without a hand-passed hint', () => {
    // mi() takes exactly (label, action); a third argument is a hand-typed hint.
    const threeArgCalls = [...mainTs.matchAll(/\bmi\((?:[^()]|\([^()]*\))*\)/g)]
      .map((m) => m[0])
      .filter((call) => call.split(',').length > 2)
    expect(threeArgCalls, `mi() calls passing a hardcoded hint: ${threeArgCalls.join(' | ')}`).toEqual([])
  })

  it('exposes every command that has an accelerator in the palette registry', () => {
    for (const accelerator of ACCELERATORS) {
      if (!accelerator.commandId) continue
      expect(appVue, `${accelerator.commandId} has an accelerator but no appCommands entry`).toContain(
        `cmd('${accelerator.commandId}'`,
      )
    }
  })
})

describe('README table matches the accelerator table', () => {
  /** Parse the pipe table under "## Keyboard Shortcuts". */
  function readmeRows(): Array<{ keys: string; description: string; context: string }> {
    const section = readme.slice(readme.indexOf('## Keyboard Shortcuts'))
    const lines = section.split('\n')
    const rows: Array<{ keys: string; description: string; context: string }> = []
    for (const line of lines) {
      if (!line.startsWith('|')) {
        if (rows.length > 0) break // table ended
        continue
      }
      const cells = line.split('|').slice(1, -1).map((c) => c.trim())
      if (cells.length !== 3) continue
      if (cells[0] === 'Shortcut' || cells[0].startsWith('---')) continue
      rows.push({ keys: cells[0], description: cells[1], context: cells[2] })
    }
    return rows
  }

  it('lists exactly the same rows, in the same order', () => {
    const expected = acceleratorRows('both')
    const actual = readmeRows()
    expect(
      actual,
      'README.md is out of date. Replace the Keyboard Shortcuts table with:\n' +
        expected.map((r) => `| ${r.keys} | ${r.description} | ${r.context} |`).join('\n'),
    ).toEqual(expected)
  })
})
