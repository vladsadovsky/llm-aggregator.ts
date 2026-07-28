/**
 * shared/accelerators.ts
 * The single source of truth for every keyboard accelerator's *display*.
 *
 * Before this table the same shortcut was written out by hand in four places —
 * the palette registry and Shortcuts dialog in `src/App.vue`, the menu hints and
 * usage text in `electron/main.ts`, and the table in `README.md`. They drifted:
 * the usage text still advertised bare `E`/`D` for edit/duplicate long after
 * those became `Ctrl+E`/`Ctrl+D`, and `Alt+N` was wired up but documented
 * nowhere. See issue #8.
 *
 * **This table does not perform key matching.** `handleGlobalKeydown` in
 * `src/App.vue` remains the hand-written source of truth for *behaviour*,
 * because the gating rules (input focus, selection state, edit mode, event
 * ordering) are genuinely per-shortcut and encoding them as data made the
 * handler harder to read, not easier. What keeps the two honest is
 * `tests/unit/accelerators.test.ts`: every `scope: 'global'` row must have a
 * matching `// @accel <id>` marker on a branch in the handler, and every marker
 * must have a row. Add one without the other and the suite fails.
 *
 * When adding a shortcut: add the row here, add the handler branch tagged with
 * `// @accel <id>`, and run `npm run test`. The menu hint, palette hint,
 * Shortcuts dialog row, and usage text all follow automatically. The README
 * table is checked (not generated) by the same test, which prints the expected
 * rows on failure.
 *
 * ── Modifier convention (issue #8) ─────────────────────────────────────────
 * The rule, now enforced by `tests/unit/accelerators.test.ts` rather than left
 * to inference:
 *
 *   1. A command action uses `Mod` (Ctrl on Win/Linux, Cmd on macOS) as its
 *      primary modifier — `Mod+N`, `Mod+E`, `Mod+O`, `Mod+Enter`.
 *   2. `Shift` combines with `Mod` for the secondary/opposite variant of a pair
 *      — `Mod+O` import-from-file vs `Mod+Shift+O` import-from-link; `Mod+Shift+E`
 *      export. No action is bound to a bare unmodified letter (that is how a lone
 *      `X` ended up next to `Ctrl+X` in the Edit menu).
 *   3. `Alt` is reserved for **positional** moves only — `Alt+Up` / `Alt+Down`.
 *   4. A small set of standard keys stay unmodified because the OS/user expects
 *      them that way: `Escape` (cancel), `F2` (rename), `Delete`/`Backspace`
 *      (delete), `?` (help), `/` (focus search), and bare `Up`/`Down` (list
 *      navigation).
 */

/** How to spell modifier keys for a given audience. */
export type ChordStyle =
  /** Runtime macOS: Cmd / Option. */
  | 'mac'
  /** Runtime Windows & Linux: Ctrl / Alt. */
  | 'win'
  /** Platform-neutral prose (README): Ctrl/Cmd. */
  | 'both'

export interface Accelerator {
  /**
   * Stable identity, and the value used in the handler's `// @accel` marker.
   * Matches `commandId` wherever a command exists.
   */
  id: string
  /**
   * Id in `appCommands` (`src/App.vue`). Absent for accelerators that are not
   * commands — Escape cancels contextually and has no palette entry.
   */
  commandId?: string
  /** Platform-neutral chords. More than one means genuine alternatives. */
  keys: string[]
  /** Row text for the Shortcuts dialog and the README table. */
  description: string
  /** When the binding is live. The README's "Context" column. */
  context: string
  /**
   * `global` — implemented by `handleGlobalKeydown` in `src/App.vue`, and
   * therefore covered by the parity test.
   * `component` — owned by an individual component (the QA editor's submit, the
   * list components' arrow navigation). Documented here, verified there.
   */
  scope: 'global' | 'component'
  /**
   * Fires even while a text input holds focus. Only three shortcuts do; the
   * rest are gated by `isInputTarget` so typing never triggers an action.
   */
  worksInInput?: boolean
}

/**
 * Ordered as the Shortcuts dialog and README present them: the three that work
 * while typing first, then the rest roughly by how often they are reached for.
 */
export const ACCELERATORS: readonly Accelerator[] = [
  {
    id: 'qa.save',
    commandId: 'qa.save',
    keys: ['Mod+S'],
    description: 'Save while editing',
    context: 'Edit mode',
    scope: 'global',
    worksInInput: true,
  },
  {
    // No palette entry: Escape's meaning depends entirely on what is open.
    id: 'app.escape',
    keys: ['Escape'],
    description: 'Close dialog / cancel current action',
    context: 'Global',
    scope: 'global',
    worksInInput: true,
  },
  {
    id: 'app.commandPalette',
    commandId: 'app.commandPalette',
    keys: ['Mod+K'],
    description: 'Open command palette',
    context: 'Global',
    scope: 'global',
    worksInInput: true,
  },
  {
    id: 'search.focus',
    commandId: 'search.focus',
    keys: ['Mod+F', '/'],
    description: 'Focus search',
    context: 'Global',
    scope: 'global',
  },
  {
    id: 'qa.new',
    commandId: 'qa.new',
    keys: ['Mod+N'],
    description: 'Create new Q&A',
    context: 'Global',
    scope: 'global',
  },
  {
    id: 'app.settings',
    commandId: 'app.settings',
    keys: ['Mod+,'],
    description: 'Open settings',
    context: 'Global',
    scope: 'global',
  },
  {
    id: 'thread.rename',
    commandId: 'thread.rename',
    keys: ['F2'],
    description: 'Rename selected thread',
    context: 'Thread selected',
    scope: 'global',
  },
  {
    id: 'qa.edit',
    commandId: 'qa.edit',
    keys: ['Mod+E'],
    description: 'Edit selected Q&A',
    context: 'Q&A selected',
    scope: 'global',
  },
  {
    id: 'qa.duplicate',
    commandId: 'qa.duplicate',
    keys: ['Mod+D'],
    description: 'Duplicate selected Q&A into new form',
    context: 'Q&A selected',
    scope: 'global',
  },
  {
    // Backspace is not Mac-only — the handler accepts it everywhere, and the
    // docs used to imply otherwise.
    id: 'qa.delete',
    commandId: 'qa.delete',
    keys: ['Delete', 'Backspace'],
    description: 'Delete selected Q&A (with confirmation)',
    context: 'Q&A selected',
    scope: 'global',
  },
  {
    id: 'qa.moveUp',
    commandId: 'qa.moveUp',
    keys: ['Alt+Up'],
    description: 'Move selected Q&A up in thread',
    context: 'Thread mode',
    scope: 'global',
  },
  {
    id: 'qa.moveDown',
    commandId: 'qa.moveDown',
    keys: ['Alt+Down'],
    description: 'Move selected Q&A down in thread',
    context: 'Thread mode',
    scope: 'global',
  },
  {
    // Was a bare `X` — the only unmodified letter bound to an action, sitting
    // next to Ctrl+X cut in the Edit menu. Shifted to match the import pair
    // below: plain acts on it, +Shift moves it in or out.
    id: 'io.export',
    commandId: 'io.export',
    keys: ['Mod+Shift+E'],
    description: 'Export selected Q&A or thread to file',
    context: 'Q&A or thread selected',
    scope: 'global',
  },
  {
    id: 'io.importFile',
    commandId: 'io.importFile',
    keys: ['Mod+O'],
    description: 'Import from file',
    context: 'Global',
    scope: 'global',
  },
  {
    id: 'io.importSharedLink',
    commandId: 'io.importSharedLink',
    keys: ['Mod+Shift+O'],
    description: 'Import from shared link',
    context: 'Global',
    scope: 'global',
  },
  {
    id: 'app.shortcuts',
    commandId: 'app.shortcuts',
    keys: ['?'],
    description: 'Show keyboard shortcuts',
    context: 'Global',
    scope: 'global',
  },
  {
    id: 'form.submit',
    keys: ['Mod+Enter'],
    description: 'Submit form',
    context: 'Q&A editor',
    scope: 'component',
  },
  {
    id: 'list.navigate',
    keys: ['Up', 'Down'],
    description: 'Navigate lists',
    context: 'Thread or Q&A list',
    scope: 'component',
  },
]

const MOD_LABEL: Record<ChordStyle, string> = { mac: 'Cmd', win: 'Ctrl', both: 'Ctrl/Cmd' }
const ALT_LABEL: Record<ChordStyle, string> = { mac: 'Option', win: 'Alt', both: 'Alt' }

/** `Mod+Shift+E` → `Cmd+Shift+E` / `Ctrl+Shift+E` / `Ctrl/Cmd+Shift+E`. */
export function renderChord(chord: string, style: ChordStyle): string {
  return chord
    .split('+')
    .map((token) => {
      if (token === 'Mod') return MOD_LABEL[style]
      if (token === 'Alt') return ALT_LABEL[style]
      return token
    })
    .join('+')
}

/** All chords for one accelerator, e.g. `Ctrl+F or /`. */
export function renderKeys(keys: readonly string[], style: ChordStyle): string {
  return keys.map((chord) => renderChord(chord, style)).join(' or ')
}

/** The style matching the platform the code is running on. */
export function styleForPlatform(isMac: boolean): ChordStyle {
  return isMac ? 'mac' : 'win'
}

const BY_COMMAND_ID = new Map(
  ACCELERATORS.filter((a) => a.commandId).map((a) => [a.commandId as string, a]),
)

/**
 * Display hint for a command, or `''` when it has no keyboard binding.
 * Returning empty rather than undefined keeps call sites free of null checks —
 * most commands (Show All Q&As, Find Duplicates, …) are deliberately unbound.
 */
export function hintFor(commandId: string, style: ChordStyle): string {
  const accelerator = BY_COMMAND_ID.get(commandId)
  return accelerator ? renderKeys(accelerator.keys, style) : ''
}

/** Rows for the Shortcuts dialog and README, in table order. */
export function acceleratorRows(style: ChordStyle): Array<{ keys: string; description: string; context: string }> {
  return ACCELERATORS.map((a) => ({
    keys: renderKeys(a.keys, style),
    description: a.description,
    context: a.context,
  }))
}
